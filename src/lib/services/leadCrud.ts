import { supabase } from './supabaseClients';
import { cacheGet, cacheSet, TTL, cacheInvalidate } from './cacheLayer';
import { stripPrefix, getTableForLead } from './leadRouter';
import { logHistory, getLeadMessages } from './interactionService';
import { pickNextConsultant, resolveConsultantIdByName, markConsultantAsAssigned } from './consultantService';
import { Lead, LeadStatus, AIClassification } from '@/lib/types';
import { sendMetaConversion } from '@/lib/meta-service';

/**
 * SERVIÇO DE CRUD DE LEADS
 */
const LEAN_COLS = 'id,name,phone,email,source,origem,status,ai_score,ai_classification,ai_summary,vehicle_interest,assigned_consultant_id,created_at,updated_at,vendedor,proxima_acao,valor_investimento,observacoes,carro_troca,region,source_table,primeiro_vendedor,nivel_interesse,momento_compra';

export async function getLeads(consultantId?: string, leadId?: string) {
    const cacheKey = `leads_${consultantId || 'all'}_${leadId || 'none'}`;
    const cached = cacheGet<Lead[]>(cacheKey);
    if (cached) return cached;

    try {
        let query = supabase.from('leads').select(LEAN_COLS);
        if (consultantId) {
            query = query.eq('assigned_consultant_id', consultantId)
                         .neq('status', 'lost')
                         .neq('status', 'lost_redistributed');
        }
        if (leadId) query = query.eq('id', leadId);
        const { data, count, error } = await query
            .order('created_at', { ascending: false })
            .range(0, 2000); // Força a busca de até 2000 registros (contornando o limite default de 1000 do Supabase)
        
        if (error) throw error;
        
        let leads = data as Lead[];

        // Enriquecer com nomes de consultores
        const consultants = await getConsultantNamesCached();
        leads = leads.map(l => {
            const consultant = consultants.find(c => c.id === l.assigned_consultant_id);
            return {
                ...l,
                consultant_name: consultant?.name || l.primeiro_vendedor || '—'
            };
        });

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
    if (!phone) return null;
    let cleanPhone = phone.replace(/\D/g, '');
    
    // Normalização: remove prefixo 55 se presente
    if (cleanPhone.startsWith('55') && cleanPhone.length >= 12) {
        cleanPhone = cleanPhone.substring(2);
    }
    
    if (cleanPhone.length < 8) return null;

    // Busca prioritária na VIEW inteligente que unifica tudo
    const { data, error } = await supabase
        .from('leads')
        .select(LEAN_COLS)
        .ilike('phone', `%${cleanPhone.slice(-8)}%`) // Busca resiliente pelos últimos 8 dígitos
        .order('priority', { ascending: true }) // V2 > CRM26 > Master
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error("Erro ao buscar lead por telefone:", error);
        return null;
    }

    return data as Lead;
}

export async function getLeadsManos(consultantId?: string, leadId?: string) {
    let query = supabase.from('leads_manos_crm').select(LEAN_COLS).order('created_at', { ascending: false });
    if (consultantId) {
        query = query.eq('assigned_consultant_id', consultantId)
                     .neq('status', 'lost')
                     .neq('status', 'lost_redistributed');
    }
    if (leadId) {
        const realId = stripPrefix(leadId);
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(realId)) query = query.eq('id', realId);
        else return [];
    }
    const { data } = await query;
    const consultants = await getConsultantNamesCached();
    return (data || []).map(item => {
        const consultant = consultants?.find(c => c.id === item.assigned_consultant_id);
        return {
            ...item,
            id: `main_${item.id}`,
            origem: item.source || 'Contato Direto WhatsApp',
            consultant_name: consultant?.name || item.primeiro_vendedor || 'Pendente',
            consultants_manos_crm: consultant || { name: 'Pendente' }
        };
    });
}

export async function getLeadsCRM26(consultantName?: string, includeSent: boolean = false, showRedistributed: boolean = false, leadId?: string) {
    let query = supabase.from('leads_distribuicao_crm_26').select('id, nome, telefone, cidade, interesse, troca, resumo, vendedor, enviado, criado_em, ai_classification, ai_score, nivel_interesse, momento_compra, status, assigned_consultant_id');
    if (!showRedistributed) query = query.not('status', 'eq', 'lost_redistributed');
    query = query.order('criado_em', { ascending: false });
    if (consultantName) {
        query = query.ilike('vendedor', `%${consultantName.split(' ')[0]}%`)
                     .neq('status', 'lost')
                     .neq('status', 'lost_redistributed');
    }
    if (leadId && leadId.startsWith('crm26_')) query = query.eq('id', stripPrefix(leadId));

    const { data } = await query;
    const consultants = await getConsultantNamesCached();
    return (data || []).filter(i => i.nome && i.telefone).map(i => normalizeCRM26(i, consultants));
}

export async function createLead(leadData: Partial<Lead>) {
    let cleanPhone = (leadData.phone || '').replace(/\D/g, '');
    if (!cleanPhone) throw new Error("Telefone obrigatório");
    
    // Normalização padrão CRM: remove '55'
    if (cleanPhone.startsWith('55') && cleanPhone.length >= 12) {
        cleanPhone = cleanPhone.substring(2);
    }
    leadData.phone = cleanPhone;

    // Busca inteligente: verifica se já existe antes de duplicar
    const existing = await getLeadByPhone(cleanPhone);

    if (existing) {
        const table = getTableForLead(existing.id);
        const realId = stripPrefix(existing.id);

        const updatePayload: any = {
            name: leadData.name || existing.name,
            source: leadData.source || existing.source,
            vehicle_interest: leadData.vehicle_interest || existing.vehicle_interest,
            updated_at: new Date().toISOString()
        };

        // [CORREÇÃO CRÍTICA] Se o lead existente não tem consultor, forçar atribuição agora
        if (!existing.assigned_consultant_id) {
            const consultants = await getConsultantNamesCached();
            const nextCons = await pickNextConsultant(updatePayload.name);
            if (nextCons) {
                updatePayload.assigned_consultant_id = nextCons.id;
                updatePayload.primeiro_vendedor = nextCons.name;
                await markConsultantAsAssigned(nextCons.id);
            }
        }

        // Mapeamento para nomes de colunas CRM26 se necessário
        if (table === 'leads_distribuicao_crm_26') {
            updatePayload.atualizado_em = updatePayload.updated_at;
            delete updatePayload.updated_at;
            if (leadData.name) updatePayload.nome = leadData.name;
            if (leadData.vehicle_interest) updatePayload.interesse = leadData.vehicle_interest;
            if (updatePayload.assigned_consultant_id) {
                const consultants = await getConsultantNamesCached();
                const cons = consultants.find(c => c.id === updatePayload.assigned_consultant_id);
                updatePayload.vendedor = cons?.name || 'Desconhecido';
            }
        }

        const { data: updated, error } = await supabase
            .from(table)
            .update(updatePayload)
            .eq('id', (table === 'leads_distribuicao_crm_26' ? parseInt(realId) : realId))
            .select()
            .single();

        if (error) throw error;
        cacheInvalidate('leads_');
        return updated;
    }

    // Se é novo, prepara payload e atribui consultor
    const payload = sanitizeLeadPayload(leadData, cleanPhone);
    
    try {
        const consultants = await getConsultantNamesCached();
        
        // Se já temos o ID do consultor, apenas garantimos que o nome esteja preenchido
        if (payload.assigned_consultant_id) {
            const consultant = consultants.find(c => c.id === payload.assigned_consultant_id);
            if (consultant) {
                payload.primeiro_vendedor = consultant.name;
            }
        } 
        // Se não temos ID, tentamos resolver por nome ou Round Robin
        else {
            if (payload.primeiro_vendedor) {
                const resolvedId = await resolveConsultantIdByName(payload.primeiro_vendedor);
                if (resolvedId) payload.assigned_consultant_id = resolvedId;
            }
            
            if (!payload.assigned_consultant_id) {
                const nextCons = await pickNextConsultant(payload.name);
                if (nextCons) {
                    payload.assigned_consultant_id = nextCons.id;
                    payload.primeiro_vendedor = nextCons.name;
                }
            }
        }

        // [REGRA DE OURO] Proibição de Lead Órfão - Contingência Final
        if (!payload.assigned_consultant_id) {
            console.warn("Round Robin falhou. Atribuindo lead ao Alexandre (Gerente) por contingência.");
            const backup = consultants.find(c => c.name.toLowerCase().includes('alexandre')) || consultants[0];
            if (backup) {
                payload.assigned_consultant_id = backup.id;
                payload.primeiro_vendedor = backup.name;
            }
        }

        // Atualizar timestamp de atribuição para o consultor escolhido
        if (payload.assigned_consultant_id) {
            await markConsultantAsAssigned(payload.assigned_consultant_id);
        }
    } catch (atribError) {
        console.error("Erro crítico na atribuição de consultor:", atribError);
    }

    const { data, error } = await supabase.from('leads_manos_crm').insert([payload]).select().single();
    if (error) throw error;
    cacheInvalidate('leads_');
    return data;
}

export async function updateLeadStatus(leadId: string, status: LeadStatus, oldStatus?: LeadStatus, notes?: string, motivo_perda?: string, resumo_fechamento?: string) {
    const table = getTableForLead(leadId);
    const realIdRaw = stripPrefix(leadId);
    const realId = table === 'leads_distribuicao_crm_26' ? parseInt(realIdRaw) : realIdRaw;
    const now = new Date().toISOString();
    
    const updatePayload: any = {
        status,
        updated_at: (table === 'leads_manos_crm' || table === 'leads_master') ? now : undefined,
        atualizado_em: (table !== 'leads_manos_crm' && table !== 'leads_master') ? now : undefined,
        motivo_perda,
        resumo_fechamento
    };

    if (notes) {
        if (table === 'leads_manos_crm') {
            updatePayload.observacoes = notes;
        } else {
            updatePayload.notas = notes;
        }
    }

    const { data, error } = await supabase.from(table).update(updatePayload).eq('id', realId).select('id');

    if (error) throw error;
    if (!data || data.length === 0) throw new Error(`Lead não encontrado na tabela ${table} (id: ${realId})`);

    await logHistory(leadId, status, oldStatus, notes);
    cacheInvalidate('leads_');
}

export async function updateLeadDetails(leadId: string, details: Partial<Lead>) {
    const table = getTableForLead(leadId);
    const realIdRaw = stripPrefix(leadId);
    const realId = table === 'leads_distribuicao_crm_26' ? parseInt(realIdRaw) : realIdRaw;
    const payload = table === 'leads_manos_crm' ? details : mapToCRM26(details);
    
    const { data, error } = await supabase.from(table).update({
        ...payload,
        updated_at: (table === 'leads_manos_crm' || table === 'leads_master') ? new Date().toISOString() : undefined,
        atualizado_em: (table !== 'leads_manos_crm' && table !== 'leads_master') ? new Date().toISOString() : undefined
    }).eq('id', realId).select('id');

    if (error) throw error;
    if (!data || data.length === 0) throw new Error(`Lead não encontrado na tabela ${table} (id: ${realId})`);
    cacheInvalidate('leads_');
}

/**
 * Registra uma consulta de crédito na tabela de auditoria.
 */
export async function logCreditConsultation(log: {
    consultant_id: string;
    lead_id: string;
    cpf_consultado: string;
    status_consulta: 'sucesso' | 'falha';
    score_original?: number;
    score_com_redutor?: number;
}) {
    const { error } = await supabase.from('audit_credit_consultations').insert([{
        ...log,
        cost: log.status_consulta === 'sucesso' ? 2.00 : 0,
        created_at: new Date().toISOString()
    }]);

    if (error) {
        console.error("Erro ao registrar auditoria de crédito:", error);
        throw error;
    }
}

export async function deleteLead(leadId: string) {
    const table = getTableForLead(leadId);
    const realId = stripPrefix(leadId);

    const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', (table === 'leads_distribuicao_crm_26' ? parseInt(realId) : realId));

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
    const consultant = consultants?.find(c => c.id === i.assigned_consultant_id);
    return {
        ...i,
        id: `crm26_${i.id}`,
        name: i.nome,
        phone: i.telefone,
        ai_summary: (i.resumo || '').split('||IA_DATA||')[0].trim(),
        status: i.status === 'NOVO' ? 'received' : i.status,
        consultant_name: consultant?.name || i.vendedor || i.primeiro_vendedor || 'Pendente',
        carro_troca: i.carro_troca || i.troca,
        cpf: i.cpf
    };
}

function sanitizeLeadPayload(ld: any, phone: string) {
    return {
        name: ld.name || ld.nome || 'Sem Nome',
        phone,
        source: ld.source || ld.origem || 'Não especificada',
        status: ld.status || 'received',
        assigned_consultant_id: ld.assigned_consultant_id || null,
        primeiro_vendedor: ld.primeiro_vendedor || null,
        created_at: new Date().toISOString()
    } as any;
}

function mapToCRM26(details: any) {
    const obj: any = {};
    if (details.name) obj.nome = details.name;
    if (details.phone) obj.telefone = details.phone.replace(/\D/g, '');
    if (details.ai_summary) obj.resumo = details.ai_summary;
    if (details.status) obj.status = details.status;
    
    if (details.carro_troca) {
        obj.carro_troca = details.carro_troca;
        obj.troca = details.carro_troca;
    }
    
    if (details.vehicle_interest) obj.interesse = details.vehicle_interest;
    if (details.valor_investimento) obj.valor_investimento = details.valor_investimento;
    if (details.assigned_consultant_id) obj.assigned_consultant_id = details.assigned_consultant_id;
    if (details.cpf) obj.cpf = details.cpf;
    
    return obj;
}

export { getLeadMessages, logHistory };
