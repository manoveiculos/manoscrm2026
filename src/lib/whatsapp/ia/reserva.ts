// src/lib/whatsapp/ia/reserva.ts — "só uma rodada manda" (triagem e follow-up)
//
// Bug de 19/11/2026: o cron da triagem roda todo minuto e uma rodada com vários leads dura mais de 1 min; o do
// follow-up disparou 2 vezes por janela. As rodadas se sobrepunham e o mesmo cliente recebia a mesma mensagem
// 2 e 3 vezes. A reserva é feita ANTES de gerar o texto, no banco, e sem migration.

import type { SupabaseClient } from '@supabase/supabase-js';

export type ColunaReserva = 'contato_em' | 'lembrete_em';

/**
 * Triagem: reserva atômica (UPDATE ... WHERE coluna IS NULL). Só UMA rodada consegue marcar a coluna;
 * quem perde pula o lead. Se o envio não sair, soltar() devolve o lead para a próxima rodada.
 */
export async function reservar(supabase: SupabaseClient, leadUid: string, coluna: ColunaReserva, agora: Date): Promise<boolean> {
    const { data, error } = await supabase.from('wa_triagem').update({ [coluna]: agora.toISOString() }).eq('lead_uid', leadUid).is(coluna, null).select('lead_uid');
    return !error && (data?.length ?? 0) > 0;
}

export async function soltar(supabase: SupabaseClient, leadUid: string, coluna: ColunaReserva): Promise<void> {
    await supabase.from('wa_triagem').update({ [coluna]: null }).eq('lead_uid', leadUid);
}

/** Linha provisória em wa_followups ('rascunho' + este motivo) que marca "esta rodada está cuidando deste toque". */
export const MOTIVO_RESERVA = 'reserva';
const VALIDADE_RESERVA_MS = 10 * 60_000;

/**
 * Follow-up: grava a linha de reserva e relê. Só segue quem NÃO encontra outra reserva recente nem um envio novo
 * depois da decisão. Duas rodadas ao mesmo tempo nunca passam as duas (a que grava depois sempre enxerga a
 * primeira); no pior caso nenhuma passa e a próxima rodada tenta de novo.
 * Devolve o id da reserva (vira o registro final do toque) ou null.
 */
export async function reservarToque(
    supabase: SupabaseClient, conversaId: string, etapa: number, ancora: string, enviadosAntes: number, agora: Date = new Date(),
): Promise<string | null> {
    const { data: minha, error } = await supabase.from('wa_followups').insert({ conversa_id: conversaId, etapa, status: 'rascunho', motivo: MOTIVO_RESERVA }).select('id').single();
    if (error || !minha) return null;
    const { data: linhas } = await supabase.from('wa_followups').select('id, status, motivo, criado_em').eq('conversa_id', conversaId).gt('criado_em', ancora);
    const limite = agora.getTime() - VALIDADE_RESERVA_MS;
    const outras = (linhas || []).filter(l => l.id !== minha.id);
    const enviadosAgora = outras.filter(l => l.status === 'enviado').length;
    const reservaDeOutra = outras.some(l => l.status === 'rascunho' && l.motivo === MOTIVO_RESERVA && Date.parse(l.criado_em as string) > limite);
    if (reservaDeOutra || enviadosAgora > enviadosAntes) {
        await supabase.from('wa_followups').delete().eq('id', minha.id);
        return null;
    }
    return minha.id as string;
}
