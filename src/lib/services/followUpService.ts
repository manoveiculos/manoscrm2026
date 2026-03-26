import { supabase } from './supabaseClients';
import { stripPrefix } from './leadRouter';

/**
 * SERVIÇO DE FOLLOW-UP
 * Gerencia agendamentos e tarefas para os leads (tabela 'follow_ups').
 */

export async function getFollowUps(leadId: string) {
    const cleanId = stripPrefix(leadId);
    const { data, error } = await supabase
        .from('follow_ups')
        .select('*')
        .eq('lead_id', cleanId)
        .order('scheduled_at', { ascending: false });
    return { data, error };
}

export async function getNextFollowUp(leadId: string) {
    const cleanId = stripPrefix(leadId);
    const { data, error } = await supabase
        .from('follow_ups')
        .select('*')
        .eq('lead_id', cleanId)
        .eq('status', 'pending')
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(1)
        .maybeSingle();
    return { data, error };
}

export async function createFollowUp(followUp: {
    lead_id: string;
    user_id: string;
    scheduled_at: string;
    type: string;
    note: string;
    priority: string;
}) {
    // Garantir ID limpo para o banco (UUID)
    const payload = {
        ...followUp,
        lead_id: stripPrefix(followUp.lead_id)
    };
    
    const { data, error } = await supabase
        .from('follow_ups')
        .insert(payload)
        .select()
        .single();
    return { data, error };
}

export async function completeFollowUp(id: string, result: string, resultNote?: string) {
    const { data, error } = await supabase
        .from('follow_ups')
        .update({
            status: 'completed' as const,
            result,
            result_note: resultNote,
            completed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
    return { data, error };
}

export async function markMissedFollowUps(leadId: string) {
    const cleanId = stripPrefix(leadId);
    await supabase
        .from('follow_ups')
        .update({ status: 'missed' as const })
        .eq('lead_id', cleanId)
        .eq('status', 'pending')
        .lt('scheduled_at', new Date().toISOString());
}
