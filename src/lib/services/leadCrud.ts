import { supabase } from './supabaseClients';
import { cacheGet, cacheSet, TTL, cacheInvalidate } from './cacheLayer';
import { stripPrefix, getTableForLead } from './leadRouter';
import { logHistory, getLeadMessages } from './interactionService';
import { pickNextConsultant } from './consultantService';
import { Lead, LeadStatus, AIClassification } from '@/lib/types';
import { sendMetaConversion } from '@/lib/meta-service';

/**
 * SERVIÇO DE CRUD DE LEADS
 */

export async function getLeads(consultantId?: string, leadId?: string) {
    const cacheKey = `leads_${consultantId || 'all'}_${leadId || 'none'}`;
    const cached = cacheGet<Lead[]>(cacheKey);
    if (cached) return cached;

    try {
        let query = supabase.from('leads').select('*');
        if (consultantId) query = query.eq('assigned_consultant_id', consultantId);
        if (leadId) query = query.eq('id', leadId);
        query = query.order('created_at', { ascending: false });

        const { data, error } = await query;
        if (error) throw error;
        const leads = data as Lead[];
        cacheSet(cacheKey, leads, TTL.LEADS);
        return leads;
    } catch (err) {
        console.error("Error fetching leads from unified View:", err);
        return [];
    }
}

/**
 * Busca resiliente por telefone (usado por IA e Extensão)
 */
export async function getLeadByPhone(phone: string): Promise<Lead | null> {
    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone || cleanPhone.length < 8) return null;

    const last8 = cleanPhone.substring(cleanPhone.length - 8);
    const variants = [cleanPhone, last8, `55${cleanPhone}`];

    // Busca na VIEW unificada (Prioridade automática via Fase 4 SQL)
    const { data, error } = await supabase
        .from('leads')
        .select('*')
        .or(`phone.ilike.%${variants.join('%,phone.ilike.%')}%`)
        .order('priority', { ascending: true }) // V2 > CRM26 > Legado
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error("Error getLeadByPhone:", error);
        return null;
    }

    if (!data) return null;

    // Buscar nome do consultor para o Dashboard/Extensão
    const consultants = await getConsultantNamesCached();
    const consultant = consultants.find(c => c.id === data.assigned_consultant_id);

    return {
        ...data,
        primeiro_vendedor: consultant?.name || data.assigned_consultant_id || 'Não atribuído'
    } as Lead;
}

export async function getLeadsManos(consultantId?: string, leadId?: string) {
    let query = supabase.from('leads_manos_crm').select('*').order('created_at', { ascending: false });
    if (consultantId) query = query.eq('assigned_consultant_id', consultantId);
    if (leadId) {
        const realId = stripPrefix(leadId);
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(realId)) query = query.eq('id', realId);
        else return [];
    }
    const { data } = await query;
    const consultants = await getConsultantNamesCached();
    return (data || []).map(item => ({
        ...item,
        id: `main_${item.id}`,
        origem: item.source || 'Contato Direto WhatsApp',
        consultants_manos_crm: consultants?.find(c => c.id === item.assigned_consultant_id) || { name: 'Pendente' }
    }));
}

export async function getLeadsCRM26(consultantName?: string, includeSent: boolean = false, showRedistributed: boolean = false, leadId?: string) {
    let query = supabase.from('leads_distribuicao_crm_26').select('*');
    if (!showRedistributed) query = query.not('status', 'eq', 'lost_redistributed');
    query = query.order('criado_em', { ascending: false });
    if (consultantName) query = query.ilike('vendedor', `%${consultantName.split(' ')[0]}%`);
    if (leadId && leadId.startsWith('crm26_')) query = query.eq('id', stripPrefix(leadId));

    const { data } = await query;
    const consultants = await getConsultantNamesCached();
    return (data || []).filter(i => i.nome && i.telefone).map(i => normalizeCRM26(i, consultants));
}

export async function createLead(leadData: Partial<Lead>) {
    const cleanPhone = (leadData.phone || '').replace(/\D/g, '');
    if (!cleanPhone) throw new Error("Telefone obrigatório");

    const { data: existing } = await supabase.from('leads_manos_crm').select('*, consultants_manos_crm(name)').eq('phone', cleanPhone).maybeSingle();

    if (existing) {
        const now = new Date().toISOString();
        const { data } = await supabase.from('leads_manos_crm').update({
            updated_at: now,
            ai_summary: `${existing.ai_summary || ''}\n\n[REATIVADO ${new Date().toLocaleDateString()}]`.trim()
        }).eq('id', existing.id).select().single();
        cacheInvalidate('leads_');
        return data;
    }

    const payload = sanitizeLeadPayload(leadData, cleanPhone);
    const { data, error } = await supabase.from('leads_manos_crm').insert([payload]).select().single();
    if (error) throw error;
    cacheInvalidate('leads_');
    return data;
}

export async function updateLeadStatus(leadId: string, status: LeadStatus, oldStatus?: LeadStatus, notes?: string, motivo_perda?: string, resumo_fechamento?: string) {
    const table = getTableForLead(leadId);
    const realId = stripPrefix(leadId);
    const now = new Date().toISOString();
    
    const { error } = await supabase.from(table).update({
        status,
        updated_at: table === 'leads_manos_crm' ? now : undefined,
        atualizado_em: table !== 'leads_manos_crm' ? now : undefined,
        motivo_perda,
        resumo_fechamento,
        notas: notes
    }).eq('id', realId);

    if (!error) await logHistory(leadId, status, oldStatus, notes);
    cacheInvalidate('leads_');
}

export async function updateLeadDetails(leadId: string, details: Partial<Lead>) {
    const table = getTableForLead(leadId);
    const realId = stripPrefix(leadId);
    const payload = table === 'leads_manos_crm' ? details : mapToCRM26(details);
    
    const { error } = await supabase.from(table).update({
        ...payload,
        updated_at: table === 'leads_manos_crm' ? new Date().toISOString() : undefined,
        atualizado_em: table !== 'leads_manos_crm' ? new Date().toISOString() : undefined
    }).eq('id', realId);

    if (error) throw error;
    cacheInvalidate('leads_');
}

// === HELPERS ===
async function getConsultantNamesCached() {
    let cached = cacheGet<any[]>('consultant_names');
    if (!cached) {
        const { data } = await supabase.from('consultants_manos_crm').select('id, name');
        cached = data || [];
        cacheSet('consultant_names', cached, TTL.CONSULTANTS);
    }
    return cached;
}

function normalizeCRM26(i: any, consultants: any[]) {
    return {
        ...i,
        id: `crm26_${i.id}`,
        name: i.nome,
        phone: i.telefone,
        ai_summary: (i.resumo || '').split('||IA_DATA||')[0].trim(),
        status: i.status === 'NOVO' ? 'received' : i.status
    };
}

function sanitizeLeadPayload(ld: any, phone: string) {
    return {
        name: ld.name || ld.nome || 'Sem Nome',
        phone,
        source: ld.source || ld.origem || 'Não especificada',
        status: ld.status || 'received',
        created_at: new Date().toISOString()
    };
}

function mapToCRM26(details: any) {
    const obj: any = {};
    if (details.name) obj.nome = details.name;
    if (details.phone) obj.telefone = details.phone.replace(/\D/g, '');
    if (details.ai_summary) obj.resumo = details.ai_summary;
    return obj;
}

export { getLeadMessages, logHistory };
