import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createClient } from '@/lib/supabase/admin';
import { extrairOrigem, isGoogleLeadForm, registrarOrigemLead } from '@/lib/services/leadOrigin';

/**
 * WEBHOOK DE ORIGEM DO LEAD
 *
 * Quem cria o lead continua sendo o n8n (WhatsApp, Google, site). Esta rota só
 * recebe o payload BRUTO do canal e grava de onde o lead veio — anúncio CTWA,
 * campanha do Google, UTMs do site — sem sobrescrever origem já gravada. Se o
 * lead ainda não existe (o n8n insere depois), a origem fica pendente e é
 * aplicada no INSERT. Ver docs/origem-lead-e-capi.md.
 *
 * Aceita:
 *   - Evolution API (messages.upsert) e WhatsApp Cloud API (webhook da Meta)
 *   - Webhook do formulário de lead do Google Ads (user_column_data)
 *   - POST do funil do site ({ phone, atribuicao, external_id, ... })
 *   - Formato explícito { telefone, origem: {...}, id_meta? }
 *
 * Autenticação (fechada por padrão):
 *   - header x-webhook-secret = LEAD_ORIGIN_WEBHOOK_SECRET, ou
 *   - google_key do corpo = GOOGLE_ADS_LEAD_FORM_KEY (chave configurada no
 *     formulário do Google Ads, para o Google chamar direto).
 *
 * Sempre responde 200 para payload sem origem (mensagem orgânica, evento de
 * conexão): quem chama não deve tentar de novo.
 */

function segredoConfere(recebido: string | null | undefined, esperado: string | undefined): boolean {
    if (!recebido || !esperado) return false;
    const a = Buffer.from(String(recebido));
    const b = Buffer.from(esperado);
    return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
    const secret = process.env.LEAD_ORIGIN_WEBHOOK_SECRET;
    const googleKey = process.env.GOOGLE_ADS_LEAD_FORM_KEY;
    if (!secret && !googleKey) {
        return NextResponse.json(
            { ok: false, error: 'LEAD_ORIGIN_WEBHOOK_SECRET / GOOGLE_ADS_LEAD_FORM_KEY não configurados' },
            { status: 503 }
        );
    }

    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400 });
    }

    const autorizado =
        segredoConfere(req.headers.get('x-webhook-secret'), secret) ||
        (isGoogleLeadForm(body) && segredoConfere(body?.google_key, googleKey));
    if (!autorizado) {
        return NextResponse.json({ ok: false, error: 'não autorizado' }, { status: 401 });
    }

    // Lead de teste do Google Ads ("Enviar dados de teste") traz dados falsos.
    if (isGoogleLeadForm(body) && body?.is_test === true) {
        return NextResponse.json({ ok: true, ignored: 'is_test' });
    }

    const origem = extrairOrigem(body);
    if (!origem) {
        return NextResponse.json({ ok: true, ignored: 'sem origem de campanha no payload' });
    }

    const admin = createClient();
    try {
        const resultado = await registrarOrigemLead(admin, origem);
        if (!resultado.ok) throw new Error(resultado.motivo || 'registrar_origem_lead falhou');

        return NextResponse.json({ ...resultado, canal: origem.canal });
    } catch (err: any) {
        console.error('[lead-origin] Falha ao gravar origem:', err?.message);
        try {
            const { google_key: _segredo, ...semSegredo } = body || {};
            await admin.from('webhook_errors').insert({
                source: 'lead-origin',
                error_message: err?.message || 'erro desconhecido',
                payload: semSegredo,
            });
        } catch (e: any) {
            console.error('[lead-origin] Falha ao gravar em webhook_errors:', e?.message);
        }
        return NextResponse.json({ ok: false, error: 'falha ao gravar origem' }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({
        status: 'online',
        usage: 'POST com o payload bruto do canal (Evolution/Cloud API, Google Ads lead form, funil do site). Header x-webhook-secret.',
    });
}
