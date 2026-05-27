import { NextRequest, NextResponse } from 'next/server';
import { sendCobrancaWhatsApp } from '@/lib/services/cobrancaWhatsappSender';

/**
 * POST /api/billing/ai-daily-briefing/send-to-camila
 *   body: { briefing: { resumo_dia, prioridades, alertas, dica_do_dia }, telefone?: string }
 *
 * Formata o briefing como texto WhatsApp e envia.
 * Destino padrão: 5547988452087 (Camila, financeiro).
 *
 * Envia em múltiplas mensagens curtas (1 resumo + 1 por prioridade)
 * com gap natural entre elas via dedup do sender (10min) — mas como cada msg
 * é diferente, vão todas. Para evitar flood manda em sequência com 1s entre cada.
 */

const CAMILA_PHONE_DEFAULT = '5547988452087';

const CATEGORIA_EMOJI: Record<string, string> = {
    URGENTE_HOJE: '🔥',
    FALAR_AGORA: '💬',
    FOLLOWUP_HOJE: '📅',
    MARCAR_AMANHA: '⏰',
    ESCALAR_JURIDICO: '⚖️',
};

const QUANDO_LABEL: Record<string, string> = {
    HOJE_MANHA: 'Hoje de manhã',
    HOJE_TARDE: 'Hoje à tarde',
    AMANHA: 'Amanhã',
    EM_3_DIAS: 'Em 3 dias',
    EM_7_DIAS: 'Em 7 dias',
};

function brl(v: number): string {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatHeader(briefing: any, dateStr: string): string {
    const lines: string[] = [];
    lines.push(`📋 *ANÁLISE IA DO DIA — ${dateStr}*`);
    lines.push('');
    lines.push(briefing.resumo_dia || 'Análise do setor de cobrança gerada pela IA.');
    if (briefing.prioridades?.length) {
        lines.push('');
        lines.push(`🎯 *${briefing.prioridades.length} prioridade(s) para hoje*`);
    }
    if (briefing.alertas?.length > 0) {
        lines.push('');
        lines.push(`⚠️ *Alertas:*`);
        for (const a of briefing.alertas) lines.push(`• ${a}`);
    }
    if (briefing.dica_do_dia) {
        lines.push('');
        lines.push(`💡 *Dica de hoje:* ${briefing.dica_do_dia}`);
    }
    return lines.join('\n');
}

function formatPrioridade(p: any, idx: number, total: number): string {
    const emoji = CATEGORIA_EMOJI[p.categoria] || '📌';
    const quando = QUANDO_LABEL[p.quando_fazer] || '';
    const lines: string[] = [];
    lines.push(`${emoji} *${idx + 1}/${total} — ${p.cliente?.toUpperCase()}*`);
    lines.push(`📞 ${p.telefone} · 💰 ${brl(Number(p.valor) || 0)}${p.dias_atraso > 0 ? ` · ⏱️ ${p.dias_atraso} dias atraso` : ''}`);
    if (quando) lines.push(`⏰ ${quando}`);
    lines.push('');
    lines.push(`*Por quê:* ${p.porque}`);
    lines.push('');
    lines.push(`*O que fazer:* ${p.o_que_fazer}`);
    if (p.script_sugerido) {
        lines.push('');
        lines.push(`*Mensagem pronta:*`);
        lines.push(`> ${p.script_sugerido.split('\n').join('\n> ')}`);
    }
    if (p.se_nao_responder) {
        lines.push('');
        lines.push(`_Se não responder:_ ${p.se_nao_responder}`);
    }
    return lines.join('\n');
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const briefing = body?.briefing;
        const telefone = (body?.telefone || CAMILA_PHONE_DEFAULT).toString();
        const dateStr = body?.date || new Date().toLocaleDateString('pt-BR');

        if (!briefing || typeof briefing !== 'object') {
            return NextResponse.json({ error: 'briefing inválido' }, { status: 400 });
        }

        const messages: string[] = [];

        // 1ª mensagem: header com resumo + alertas + dica
        messages.push(formatHeader(briefing, dateStr));

        // 1 msg por prioridade (limitado a 10 — Camila não vai querer + que isso)
        const prios = (briefing.prioridades || []).slice(0, 10);
        for (let i = 0; i < prios.length; i++) {
            messages.push(formatPrioridade(prios[i], i, prios.length));
        }

        // Envia em sequência com pausa de 1.5s entre cada (anti-ban + ordem garantida)
        const results: any[] = [];
        for (let i = 0; i < messages.length; i++) {
            const result = await sendCobrancaWhatsApp({
                toPhone: telefone,
                message: messages[i],
                skipDedup: true, // briefing pode repetir conteúdo se reenviado
            });
            results.push({ index: i, ok: result.ok, error: result.error });
            if (i < messages.length - 1) {
                await new Promise(r => setTimeout(r, 1500));
            }
        }

        const failed = results.filter(r => !r.ok);
        if (failed.length === messages.length) {
            return NextResponse.json({
                ok: false,
                error: 'Nenhuma mensagem foi entregue',
                results,
            }, { status: 502 });
        }

        return NextResponse.json({
            ok: true,
            sent: messages.length - failed.length,
            failed: failed.length,
            total: messages.length,
            telefone,
            results,
        });
    } catch (e: any) {
        console.error('[send-to-camila] erro:', e);
        return NextResponse.json({ error: e?.message || 'erro' }, { status: 500 });
    }
}
