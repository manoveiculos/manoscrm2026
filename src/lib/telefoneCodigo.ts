// src/lib/telefoneCodigo.ts — código de confirmação do WhatsApp do consultor (SÓ SERVIDOR: usa node:crypto)
//
// Ver src/lib/telefone.ts (formato do número) e a migration 20261112_consultor_telefone_verificado.sql.

import { createHash, randomInt } from 'node:crypto';

export const CODIGO_VALE_MIN = 10;
export const MAX_TENTATIVAS = 5;
export const MAX_ENVIOS_10MIN = 3;
export const MAX_ENVIOS_DIA = 8;

export function gerarCodigo(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** O banco guarda só o resumo do código, amarrado ao consultor e ao telefone. */
export function resumoDoCodigo(consultorId: string, telefone: string, codigo: string): string {
    return createHash('sha256').update(`${consultorId}:${telefone}:${codigo.trim()}`).digest('hex');
}

export function textoDoCodigo(codigo: string): string {
    return `Manos CRM: seu código de confirmação é ${codigo}. Vale por ${CODIGO_VALE_MIN} minutos. Se você não pediu, ignore esta mensagem.`;
}

export type MotivoBloqueio = 'muitos_envios_agora' | 'muitos_envios_hoje';

/** Limite de pedidos de código: 3 em 10 min e 8 por dia, por consultor. */
export function podePedirCodigo(enviosIso: string[], agora: Date): { ok: true } | { ok: false; motivo: MotivoBloqueio } {
    const t = agora.getTime();
    const em10 = enviosIso.filter(e => t - Date.parse(e) < 10 * 60_000).length;
    const em24h = enviosIso.filter(e => t - Date.parse(e) < 24 * 3_600_000).length;
    if (em10 >= MAX_ENVIOS_10MIN) return { ok: false, motivo: 'muitos_envios_agora' };
    if (em24h >= MAX_ENVIOS_DIA) return { ok: false, motivo: 'muitos_envios_hoje' };
    return { ok: true };
}

export interface CodigoGuardado { codigoHash: string; telefone: string; expiraEm: string; tentativas: number; usadoEm: string | null }

export type ResultadoConferencia = 'ok' | 'sem_codigo' | 'expirado' | 'muitas_tentativas' | 'errado';

export function conferirCodigo(g: CodigoGuardado | null, consultorId: string, digitado: string, agora: Date): ResultadoConferencia {
    if (!g || g.usadoEm) return 'sem_codigo';
    if (Date.parse(g.expiraEm) <= agora.getTime()) return 'expirado';
    if (g.tentativas >= MAX_TENTATIVAS) return 'muitas_tentativas';
    const d = (digitado || '').replace(/\D/g, '');
    if (d.length !== 6) return 'errado';
    return resumoDoCodigo(consultorId, g.telefone, d) === g.codigoHash ? 'ok' : 'errado';
}
