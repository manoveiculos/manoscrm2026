// src/lib/services/modoDistribuicao.ts — como os leads novos chegam aos consultores (SÓ SERVIDOR)
//
//   'rodizio' (padrão): o motor entrega o lead a um consultor e, sem clique em 10 min, passa para o próximo.
//   'fila'   (decisão do Alexandre, 13/11/2026): o lead fica sem dono, todos são avisados e o primeiro que
//            clica em "Iniciar atendimento" leva. Nada gira entre consultores.
// A chave fica em wa_ia_config.distribuicao. Qualquer erro de leitura = 'rodizio' (o comportamento de sempre).

import type { SupabaseClient } from '@supabase/supabase-js';

export type ModoDistribuicao = 'rodizio' | 'fila';

export async function lerModoDistribuicao(supabase: SupabaseClient): Promise<ModoDistribuicao> {
    try {
        const { data, error } = await supabase.from('wa_ia_config').select('distribuicao').eq('id', 1).maybeSingle();
        if (error) return 'rodizio';
        return data?.distribuicao === 'fila' ? 'fila' : 'rodizio';
    } catch { return 'rodizio'; }
}
