// src/lib/avisos/registro.ts — grava cada aviso enviado ao consultor (SÓ SERVIDOR)
//
// Nunca lança e nunca atrasa o aviso: se a tabela ainda não existir (migration não aplicada)
// ou o banco falhar, só avisa no log. O histórico é para a reunião semanal, não é requisito do envio.

import { createClient } from '@/lib/supabase/admin';
import { normalizarTelefoneBR } from '@/lib/telefone';

export interface NovoRegistro {
    tipo: string;
    consultorNome: string;
    consultorId?: string | null;
    telefone?: string | null;
    mensagem: string;
    ok: boolean;
    erro?: string | null;
    leadRef?: string | null;
    conversaId?: string | null;
    origem?: string | null;
    meta?: Record<string, unknown>;
}

export async function registrarAviso(r: NovoRegistro): Promise<void> {
    try {
        const { error } = await createClient().from('avisos_enviados').insert({
            tipo: r.tipo || 'aviso',
            consultor_nome: (r.consultorNome || '').trim() || '(sem nome)',
            consultor_id: r.consultorId ?? null,
            telefone: normalizarTelefoneBR(r.telefone) || null,
            mensagem: r.mensagem,
            status: r.ok ? 'enviado' : 'falhou',
            erro: r.ok ? null : (r.erro || 'erro desconhecido').slice(0, 300),
            lead_ref: r.leadRef ?? null,
            conversa_id: r.conversaId ?? null,
            origem: r.origem ?? null,
            meta: r.meta ?? {},
        });
        if (error) console.warn('[avisos] não registrou o aviso:', error.message);
    } catch (e) {
        console.warn('[avisos] não registrou o aviso:', e instanceof Error ? e.message : e);
    }
}
