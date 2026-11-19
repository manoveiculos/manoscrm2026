// src/lib/leads/enriquecimento.ts — situação e última mensagem por lead (SÓ SERVIDOR)
//
// Lê as conversas do WhatsApp da loja que estão ligadas a um lead e devolve, por uid do lead,
// o que a lista de Leads precisa para ordenar por urgência. Usado por /api/leads/situacoes e /api/leads/lista.

import type { SupabaseClient } from '@supabase/supabase-js';
import { situacaoDoBanco, mensagensRecentes, type MsgBanco } from './resumo';
import type { Enriquecimento } from './urgencia';

export interface ConversaLinha { id: string; lead_uid: string; situacao: unknown; ultima_mensagem_em: string | null }

export async function lerConversasDeLeads(admin: SupabaseClient): Promise<ConversaLinha[]> {
    const { data, error } = await admin.from('wa_conversas')
        .select('id, lead_uid, situacao, ultima_mensagem_em')
        .not('lead_uid', 'is', null).order('ultima_mensagem_em', { ascending: false }).limit(5000);
    if (error) throw new Error(error.message);
    return (data || []) as ConversaLinha[];
}

/** Monta { uid → Enriquecimento } para as conversas dadas (várias conversas do mesmo lead: vale a mais recente). */
export async function enriquecer(admin: SupabaseClient, conversas: ConversaLinha[]): Promise<Record<string, Enriquecimento>> {
    const ultimas = new Map<string, MsgBanco>();
    if (conversas.length) {
        const { data: msgs } = await admin.rpc('wa_ultimas_mensagens', { p_conversas: conversas.map(c => c.id) });
        for (const m of (msgs || []) as (MsgBanco & { conversa_id: string })[]) ultimas.set(m.conversa_id, m);
    }
    const itens: Record<string, Enriquecimento> = {};
    for (const c of conversas) {
        const uid = String(c.lead_uid);
        if (itens[uid]) continue;
        const s = situacaoDoBanco(c.situacao);
        const m = ultimas.get(c.id);
        const lida = m ? mensagensRecentes([m], 1)[0] : null;
        itens[uid] = {
            conversaId: c.id,
            situacao: s?.codigo ?? null,
            rotuloSituacao: s?.rotulo ?? null,
            quando: s?.quando ?? null,
            ultimaDe: lida?.de ?? null,
            ultimaEm: m?.criada_em ?? c.ultima_mensagem_em ?? null,
            ultimaTexto: lida?.texto.slice(0, 90) ?? null,
        };
    }
    return itens;
}
