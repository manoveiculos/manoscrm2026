// src/lib/whatsapp/ia/config.ts — modo da Laura no CRM (servidor)
//
// Três travas (ver modoEfetivo em regras.ts):
//   WA_IA_ATIVA=true           no servidor — sem isso a IA nunca roda;
//   wa_ia_config.modo          botão do admin na tela Conversas (ensaio | desligada);
//   WA_IA_ENVIO_LIBERADO=true  só na etapa C — sem isso "envia" vira "ensaio".

import type { SupabaseClient } from '@supabase/supabase-js';
import { modoEfetivo, type ModoIa } from './regras';

export interface ConfigIa {
    /** O que vale de verdade agora. */
    modo: ModoIa;
    /** O que está gravado no botão do admin. */
    modoGravado: ModoIa;
    /** Por que o modo efetivo é diferente do gravado (ou null). */
    motivo: string | null;
    ativaNoServidor: boolean;
    envioLiberado: boolean;
    atualizadoEm: string | null;
}

export async function lerConfigIa(supabase: SupabaseClient): Promise<ConfigIa> {
    let modoGravado: ModoIa = 'desligada';
    let atualizadoEm: string | null = null;
    try {
        const { data, error } = await supabase.from('wa_ia_config').select('modo, atualizado_em').eq('id', 1).maybeSingle();
        if (error) throw new Error(error.message);
        if (data?.modo === 'ensaio' || data?.modo === 'envia' || data?.modo === 'desligada') modoGravado = data.modo;
        atualizadoEm = data?.atualizado_em ?? null;
    } catch {
        // tabela ainda não existe (migration não aplicada): fica desligada
        modoGravado = 'desligada';
    }
    const ativaEnv = process.env.WA_IA_ATIVA ?? null;
    const envioLiberadoEnv = process.env.WA_IA_ENVIO_LIBERADO ?? null;
    const { modo, motivo } = modoEfetivo({ ativaEnv, envioLiberadoEnv, modoConfig: modoGravado });
    return {
        modo,
        modoGravado,
        motivo: modo === modoGravado ? null : motivo,
        ativaNoServidor: (ativaEnv || '').trim() === 'true',
        envioLiberado: (envioLiberadoEnv || '').trim() === 'true',
        atualizadoEm,
    };
}

/** O botão do admin só liga ensaio ou desliga. "envia" fica bloqueado até a etapa C. */
export async function gravarModoIa(supabase: SupabaseClient, modo: 'ensaio' | 'desligada' | 'envia', authId: string | null): Promise<void> {
    const { error } = await supabase.from('wa_ia_config')
        .upsert({ id: 1, modo, atualizado_por: authId, atualizado_em: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw new Error(error.message);
}
