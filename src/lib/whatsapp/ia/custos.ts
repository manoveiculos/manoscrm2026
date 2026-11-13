// src/lib/whatsapp/ia/custos.ts — registra o custo de chamadas de IA que ainda não tinham registro (SÓ SERVIDOR)
//
// Laura grava em wa_ia_execucoes e o follow-up em wa_followups. Triagem e analista gravam aqui
// (tabela ia_custos). A Central dos Agentes soma as três fontes (src/lib/agentes/custos.ts).
// Nunca lança: contabilidade não pode derrubar o atendimento.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { UsoTokens } from './regras';

export async function registrarCustoIa(
    supabase: SupabaseClient,
    r: { agente: string; custoUsd: number; modelo?: string | null; uso?: UsoTokens | null; conversaId?: string | null; leadRef?: string | null },
): Promise<void> {
    try {
        const { error } = await supabase.from('ia_custos').insert({
            agente: r.agente, custo_usd: Math.max(0, r.custoUsd), modelo: r.modelo ?? null,
            tokens_entrada: r.uso?.input_tokens ?? null, tokens_saida: r.uso?.output_tokens ?? null,
            conversa_id: r.conversaId || null, lead_ref: r.leadRef ?? null,
        });
        if (error) console.warn('[ia_custos] não registrou:', error.message);
    } catch (e) {
        console.warn('[ia_custos] não registrou:', e instanceof Error ? e.message : e);
    }
}
