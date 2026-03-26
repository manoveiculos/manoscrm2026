import { supabase } from './supabaseClients';
import { stripPrefix } from './leadRouter';

/**
 * SERVIÇO DE INTERAÇÕES E MENSAGENS
 */

export async function getLeadMessages(leadId: string) {
    try {
        const cleanId = stripPrefix(leadId);
        
        // Se o ID não for numérico (ex: UUID do CRM Main), não buscamos nesta tabela 
        // pois whatsapp_messages.lead_id é BIGINT.
        if (!/^\d+$/.test(cleanId)) {
            return [];
        }

        const { data, error } = await supabase
            .from('whatsapp_messages')
            .select('*')
            .eq('lead_id', parseInt(cleanId))
            .order('created_at', { ascending: true });
        
        if (error) throw error;
        return data || [];
    } catch (err: any) {
        console.error("Erro ao buscar mensagens do lead:", err.message || err);
        return [];
    }
}

export async function logHistory(leadId: string, newStatus: string, oldStatus?: string, notes?: string) {
    if (leadId.startsWith('crm26_')) return;

    const realId = stripPrefix(leadId);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(realId)) return;

    await supabase.from('interactions_manos_crm').insert([{
        lead_id: realId,
        old_status: oldStatus,
        new_status: newStatus,
        notes: notes,
        created_at: new Date().toISOString()
    }]);
}

export interface TimelineEntry {
    id: string;
    type: 'interaction' | 'message' | 'followup' | 'ai_system' | 'status_change' | 'whatsapp_in' | 'whatsapp_out';
    timestamp: string;
    title: string;
    content: string;
    icon?: string;
    meta?: any;
}

/**
 * BUSCA RESILIENTE DE TIMELINE (FASE 2)
 * Consolida dados de múltiplas tabelas usando ID e Telefone como chaves de cruzamento.
 */
export async function getUnifiedTimeline(leadId: string, phone?: string): Promise<TimelineEntry[]> {
    const cleanId = stripPrefix(leadId);
    const cleanPhone = phone?.replace(/\D/g, '');
    const timeline: TimelineEntry[] = [];

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isMaster = uuidRegex.test(cleanId);

    // 1. Interações Manuais & Mudanças de Status (UUID only)
    if (isMaster) {
        const { data: interactions } = await supabase
            .from('interactions_manos_crm')
            .select('*')
            .eq('lead_id', cleanId)
            .order('created_at', { ascending: false });

        interactions?.forEach(i => {
            const isWA = i.type === 'whatsapp_in' || i.type === 'whatsapp_out';
            timeline.push({
                id: `int_${i.id}`,
                type: isWA ? i.type
                    : i.old_status ? 'status_change'
                    : 'interaction',
                timestamp: i.created_at,
                title: isWA
                    ? (i.user_name || (i.type === 'whatsapp_out' ? 'Vendedor' : 'Cliente'))
                    : i.old_status ? `Status: ${i.old_status} → ${i.new_status}`
                    : 'Nota de Atendimento',
                content: i.notes || '',
                meta: { old: i.old_status, new: i.new_status, user: i.user_name }
            });
        });
    }

    // 2. Mensagens do WhatsApp (Busca por Telefone é mais resiliente que ID)
    if (cleanPhone) {
        const phoneVariants = [`55${cleanPhone}`, cleanPhone, cleanPhone.slice(-8)];
        const { data: messages } = await supabase
            .from('whatsapp_messages')
            .select('*')
            .or(`sender_phone.in.(${phoneVariants.join(',')}),receiver_phone.in.(${phoneVariants.join(',')})`)
            .order('created_at', { ascending: false })
            .limit(50);

        messages?.forEach(m => {
            timeline.push({
                id: `msg_${m.id}`,
                type: 'message',
                timestamp: m.created_at || m.timestamp,
                title: m.sender_name || 'Mensagem WhatsApp',
                content: m.text || m.body || '',
                meta: { sender: m.sender_phone, type: m.type }
            });
        });
    }

    // 3. Follow-ups (Agendamentos)
    if (isMaster) {
        const { data: followups } = await supabase
            .from('follow_ups')
            .select('*')
            .eq('lead_id', cleanId)
            .order('scheduled_at', { ascending: false });

        followups?.forEach(f => {
            timeline.push({
                id: `fu_${f.id}`,
                type: 'followup',
                timestamp: f.created_at || f.scheduled_at,
                title: `Agendamento: ${f.type || 'Geral'}`,
                content: f.note || '',
                meta: { status: f.status, scheduled_at: f.scheduled_at }
            });
        });
    }

    // 4. Dados Legados do 'Laboratório de IA' (Tracking & Concessionária)
    if (cleanPhone) {
        const { data: trackers } = await supabase
            .from('tracking_leads')
            .select('details')
            .or(`whatsapp.ilike.%${cleanPhone}%,whatsapp.ilike.%${cleanPhone.slice(-8)}%`)
            .order('updated_at', { ascending: false })
            .limit(1);

        const sessionId = (trackers?.[0]?.details as any)?.session_id;

        if (sessionId) {
            const { data: labMsgs } = await supabase
                .from('concessionaria_mensagens')
                .select('*')
                .eq('session_id', sessionId)
                .order('data', { ascending: false });

            labMsgs?.forEach((m, idx) => {
                timeline.push({
                    id: `lab_${idx}_${m.id || m.data}`,
                    type: 'ai_system',
                    timestamp: m.data || new Date().toISOString(),
                    title: m.remetente || 'IA Lab',
                    content: m.texto || '',
                    meta: { session_id: sessionId, score: m.score }
                });
            });
        }
    }

    return timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
