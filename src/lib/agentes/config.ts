// src/lib/agentes/config.ts — INTERRUPTOR DOS AGENTES (agentes_config) — SÓ SERVIDOR
//
// Enquanto a migration 20261106b não for aplicada, a tabela não existe e tudo
// fica "ligado" (o comportamento de hoje). Depois, o admin liga/desliga pela
// Central dos Agentes e cada agente consulta agenteLigado() antes de agir.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/admin';
import { ID_IA_GERAL, agentePorId } from './catalogo';
import type { ConfigAgente, ModoAgente } from './estado';

const tabelaAusente = (msg?: string) => !!msg && /agentes_config/.test(msg) && /(does not exist|schema cache|not find)/i.test(msg);

export async function lerConfigs(admin: SupabaseClient): Promise<{ instalada: boolean; configs: Record<string, ConfigAgente> }> {
    const { data, error } = await admin.from('agentes_config').select('agente_id, modo, alterado_por, alterado_em');
    if (error) {
        if (!tabelaAusente(error.message)) console.warn('[agentes] config:', error.message);
        return { instalada: false, configs: {} };
    }
    const configs: Record<string, ConfigAgente> = {};
    for (const r of (data || []) as any[]) {
        configs[r.agente_id] = { modo: r.modo, alteradoPor: r.alterado_por, alteradoEm: r.alterado_em };
    }
    return { instalada: true, configs };
}

/**
 * O agente pode agir agora? Desligado nele, ou IA geral desligada (para
 * agentes de IA) → false. Sem tabela ou sem linha → true. Nunca lança erro:
 * na dúvida, mantém o comportamento de hoje.
 */
export async function agenteLigado(agenteId: string): Promise<{ ligado: boolean; modo: ModoAgente }> {
    try {
        const { instalada, configs } = await lerConfigs(createClient());
        if (!instalada) return { ligado: true, modo: 'ligado' };
        const agente = agentePorId(agenteId);
        if (agente?.ia && configs[ID_IA_GERAL]?.modo === 'desligado') return { ligado: false, modo: 'desligado' };
        const modo = configs[agenteId]?.modo || 'ligado';
        return { ligado: modo !== 'desligado', modo };
    } catch {
        return { ligado: true, modo: 'ligado' };
    }
}

export async function gravarConfig(admin: SupabaseClient, agenteId: string, modo: ModoAgente, quem: string) {
    return admin.from('agentes_config').upsert(
        { agente_id: agenteId, modo, alterado_por: quem.slice(0, 120), alterado_em: new Date().toISOString() },
        { onConflict: 'agente_id' },
    );
}

export { tabelaAusente };
