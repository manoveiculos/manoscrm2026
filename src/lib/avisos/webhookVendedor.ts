// src/lib/avisos/webhookVendedor.ts — aviso no WhatsApp do consultor pelo webhook do n8n
//
// Decisão do Alexandre (11/11/2026): TODO aviso a consultor (lead novo, cliente pediu humano,
// cobrança, resumo do dia) sai pelo MESMO webhook, e o n8n direciona só pelo NOME:
// o Switch do fluxo lê `vendedor_lower` (sergio | victor | wilson | alexandre) e manda `mensagem`.
//
// O corpo leva os campos do fluxo (vendedor, vendedor_lower, mensagem) e também os que o CRM
// já mandava (consultant_name, type, message, meta), para nada antigo quebrar.
//
// Telefone: sempre 55 + DDD + número, só dígitos (ex.: 5547988467855), em `telefone` e em
// `consultant_phone`. Número que não fecha nesse formato vai vazio (nunca meio número).

import { normalizarTelefoneBR } from '@/lib/telefone';
import { registrarAviso } from './registro';

export const WEBHOOK_VENDEDOR_PADRAO = 'https://n8n.drivvoo.com/webhook/chamadavendedorcrm';

export function urlWebhookVendedor(): string {
    return (process.env.N8N_VENDOR_WEBHOOK_URL || WEBHOOK_VENDEDOR_PADRAO).trim();
}

/** Telefone do consultor no formato do webhook: "5547988467855", ou "" se não for válido. */
export function telefoneDoAviso(bruto: string | null | undefined): string {
    return normalizarTelefoneBR(bruto) ?? '';
}

/** "Sérgio Silva" → "sergio": primeiro nome, minúsculo, sem acento (é a chave do Switch no n8n). */
export function chaveDoNome(nome: string | null | undefined): string {
    return (nome || '').trim().split(/\s+/)[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
}

export interface AvisoVendedor {
    /** Nome do consultor (ou "Alexandre" para o gestor). */
    nome: string;
    mensagem: string;
    /** Para o n8n e para auditoria: lead_novo, precisa_humano, cobranca, resumo_dia... */
    tipo: string;
    telefone?: string | null;
    meta?: Record<string, unknown>;
}

export function corpoDoAviso(a: AvisoVendedor): Record<string, unknown> {
    return {
        vendedor: (a.nome || '').trim(),
        vendedor_lower: chaveDoNome(a.nome),
        mensagem: a.mensagem,
        telefone: telefoneDoAviso(a.telefone),
        tipo: a.tipo,
        // formato antigo do CRM (mantido)
        consultant_name: (a.nome || '').trim(),
        consultant_phone: telefoneDoAviso(a.telefone),
        type: a.tipo,
        message: a.mensagem,
        meta: a.meta ?? {},
    };
}

/** Acrescenta os campos de rota por nome a um corpo no formato antigo ({ consultant_name, message }). */
export function comRotaPorNome<T extends { consultant_name?: string | null; consultant_phone?: string | null; message?: string | null }>(
    corpo: T,
): T & { vendedor: string; vendedor_lower: string; mensagem: string; telefone: string; consultant_phone: string } {
    const telefone = telefoneDoAviso(corpo.consultant_phone);
    return {
        ...corpo, consultant_phone: telefone, telefone,
        vendedor: (corpo.consultant_name || '').trim(), vendedor_lower: chaveDoNome(corpo.consultant_name), mensagem: corpo.message || '',
    };
}

/** Envia o aviso e deixa registrado no histórico do admin. Nunca lança: devolve ok/erro. */
export async function enviarAvisoVendedor(a: AvisoVendedor & { consultorId?: string | null; leadRef?: string | null; conversaId?: string | null; origem?: string | null }): Promise<{ ok: boolean; erro?: string }> {
    if (!chaveDoNome(a.nome) || !a.mensagem.trim()) return { ok: false, erro: 'aviso sem nome ou sem mensagem' };
    let r: { ok: boolean; erro?: string };
    try {
        const segredo = (process.env.N8N_VENDOR_WEBHOOK_SECRET || '').trim();
        const res = await fetch(urlWebhookVendedor(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(segredo ? { 'x-manos-secret': segredo } : {}) },
            body: JSON.stringify(corpoDoAviso(a)),
            signal: AbortSignal.timeout(8000),
        });
        r = res.ok ? { ok: true } : { ok: false, erro: `HTTP ${res.status}` };
    } catch (e) {
        r = { ok: false, erro: e instanceof Error ? e.message : 'falha de rede' };
    }
    await registrarAviso({
        tipo: a.tipo, consultorNome: a.nome, consultorId: a.consultorId, telefone: a.telefone, mensagem: a.mensagem,
        ok: r.ok, erro: r.erro, leadRef: a.leadRef, conversaId: a.conversaId, origem: a.origem ?? 'avisoVendedor', meta: a.meta,
    });
    return r;
}
