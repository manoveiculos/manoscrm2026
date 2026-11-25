// src/lib/avisos/webhookVendedor.ts — aviso no WhatsApp do consultor (SÓ SERVIDOR)
//
// Decisão do Alexandre (25/11/2026): o n8n SAI dos avisos. Todo aviso a consultor (lead novo, fila, cobrança,
// cliente voltou, resumo do dia) sai direto do CRM pela Evolution, para o telefone confirmado de cada consultor,
// e cada tentativa fica em avisos_enviados com o resultado REAL do envio (antes "enviado" só dizia que o n8n
// respondeu 200, e o Sergio/Victor ficavam sem receber).
//
// Instância: EVOLUTION_AVISOS_INSTANCE (+ EVOLUTION_AVISOS_TOKEN); sem elas usa a EVOLUTION_INSTANCE_NAME de sempre.
// As funções corpoDoAviso/comRotaPorNome ficam só por compatibilidade (testes); o envio não usa mais webhook.
//
// Telefone: sempre 55 + DDD + número, só dígitos (ex.: 5547988467855), em `telefone` e em
// `consultant_phone`. Número que não fecha nesse formato vai vazio (nunca meio número).

import { normalizarTelefoneBR } from '@/lib/telefone';
import { sendWhatsApp } from '@/lib/services/whatsappSender';
import { registrarAviso } from './registro';

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

/** Envia o aviso direto pela Evolution e deixa registrado no histórico do admin. Nunca lança: devolve ok/erro. */
export async function enviarAvisoVendedor(a: AvisoVendedor & { consultorId?: string | null; leadRef?: string | null; conversaId?: string | null; origem?: string | null }): Promise<{ ok: boolean; erro?: string }> {
    if (!chaveDoNome(a.nome) || !a.mensagem.trim()) return { ok: false, erro: 'aviso sem nome ou sem mensagem' };
    const telefone = telefoneDoAviso(a.telefone);
    let r: { ok: boolean; erro?: string };
    if (!telefone) {
        r = { ok: false, erro: 'telefone do consultor ausente ou inválido' };
    } else {
        const instancia = (process.env.EVOLUTION_AVISOS_INSTANCE || '').replace(/"/g, '').trim();
        const token = (process.env.EVOLUTION_AVISOS_TOKEN || '').replace(/"/g, '').trim();
        const x = await sendWhatsApp({
            toPhone: telefone, message: a.mensagem, kind: 'vendor_alert', consultantId: a.consultorId ?? undefined,
            leadId: a.leadRef ?? undefined, skipDedup: true,
            ...(instancia ? { evolutionInstance: { name: instancia, token: token || undefined } } : {}),
        });
        r = x.ok ? { ok: true } : { ok: false, erro: (x.error || 'falha no envio').slice(0, 300) };
    }
    await registrarAviso({
        tipo: a.tipo, consultorNome: a.nome, consultorId: a.consultorId, telefone: a.telefone, mensagem: a.mensagem,
        ok: r.ok, erro: r.erro, leadRef: a.leadRef, conversaId: a.conversaId, origem: a.origem ?? 'avisoVendedor', meta: a.meta,
    });
    return r;
}
