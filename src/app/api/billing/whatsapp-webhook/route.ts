import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

/**
 * Webhook do Evolution API para a instância "camila-cobranca".
 *
 * Configurar no Evolution Manager → Settings → Webhook:
 *   URL:    https://manoscrm.com.br/api/billing/whatsapp-webhook
 *   Events: MESSAGES_UPSERT  (suficiente — recebe inbound + outbound da própria instância)
 *   Webhook by Events: ON
 *
 * Grava em public.billing_whatsapp_messages e tenta amarrar ao record
 * de cobrança pelo telefone (records_cobrancamanos26.telefone).
 *
 * IMPORTANTE: este endpoint é APENAS para a instância de cobrança.
 * O webhook do SDR é /api/webhook/whatsapp e não deve ser mexido.
 */

function digits(s: string): string {
    return (s || '').replace(/\D/g, '');
}

function normalizePhone(raw: string): string {
    const d = digits(raw);
    if (!d) return '';
    // Evolution manda 5547999999999 — remove o 55 pra casar com records.telefone
    if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
        return d.slice(2);
    }
    return d;
}

// GET = verificação de webhook (Cloud API style + Evolution health check)
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const challenge = searchParams.get('hub.challenge');
    if (challenge) return new NextResponse(challenge, { status: 200 });
    return NextResponse.json({
        ok: true,
        service: 'billing-whatsapp-webhook',
        instance_expected: process.env.EVOLUTION_COBRANCA_INSTANCE_NAME || 'camila-cobranca',
    });
}

export async function POST(req: NextRequest) {
    try {
        const payload = await req.json();
        const evt = String(payload.event || payload.type || '').toLowerCase();

        // Só processa mensagens novas. Ignora connection.update, presence.update, etc.
        if (evt && !/messages[._]?upsert|messages[._]?new/i.test(evt)) {
            return NextResponse.json({ ok: true, ignored_event: evt });
        }

        const data = payload.data || payload;
        const key = data?.key || {};
        const msg = data?.message || {};

        // Filtro de instância: aceita só a instância de cobrança
        const expectedInstance = (process.env.EVOLUTION_COBRANCA_INSTANCE_NAME || '').replace(/"/g, '');
        const receivedInstance = String(payload.instance || data?.instance || '').replace(/"/g, '');
        if (expectedInstance && receivedInstance && receivedInstance !== expectedInstance) {
            return NextResponse.json({
                ok: true,
                ignored_instance: receivedInstance,
                expected: expectedInstance,
            });
        }

        // Extrai telefone (suporta grupos? não — só DM)
        const remoteJid: string = key.remoteJid || '';
        if (remoteJid.includes('@g.us')) {
            return NextResponse.json({ ok: true, ignored: 'group_message' });
        }
        const phoneRaw = remoteJid.split('@')[0] || data?.phone || payload.phone || '';
        const telefone = normalizePhone(phoneRaw);

        if (!telefone) {
            return NextResponse.json({ ok: false, error: 'telefone_ausente' }, { status: 400 });
        }

        // Texto da mensagem (Evolution tem múltiplos formatos)
        const body =
            msg.conversation ||
            msg.extendedTextMessage?.text ||
            msg.imageMessage?.caption ||
            msg.videoMessage?.caption ||
            msg.documentMessage?.caption ||
            msg.audioMessage?.caption ||
            payload.text ||
            null;

        // Mídia
        let mediaUrl: string | null = null;
        let mediaType: string | null = null;
        if (msg.imageMessage) { mediaType = 'image'; mediaUrl = msg.imageMessage?.url || null; }
        else if (msg.videoMessage) { mediaType = 'video'; mediaUrl = msg.videoMessage?.url || null; }
        else if (msg.audioMessage) { mediaType = 'audio'; mediaUrl = msg.audioMessage?.url || null; }
        else if (msg.documentMessage) { mediaType = 'document'; mediaUrl = msg.documentMessage?.url || null; }

        if (!body && !mediaType) {
            return NextResponse.json({ ok: true, ignored: 'sem_conteudo' });
        }

        const direction = key.fromMe === true ? 'OUTBOUND' : 'INBOUND';
        const evolutionMsgId = key.id || null;
        const pushName = data?.pushName || null;

        const admin = createClient();

        // Dedup: se já existe esse evolution_msg_id, ignora (Evolution às vezes reentregra)
        if (evolutionMsgId) {
            const { data: existing } = await admin
                .from('billing_whatsapp_messages')
                .select('id')
                .eq('evolution_msg_id', evolutionMsgId)
                .maybeSingle();
            if (existing) {
                return NextResponse.json({ ok: true, dedup: true, id: existing.id });
            }
        }

        // Tenta amarrar a um record de cobrança pelo telefone
        // (telefone na records pode ter formato com espaços/múltiplos números)
        let recordId: string | null = null;
        let cpfCnpj: string | null = null;
        try {
            const { data: matches } = await admin
                .from('records_cobrancamanos26')
                .select('id, telefone, cpfCnpj')
                .ilike('telefone', `%${telefone}%`)
                .limit(1);
            if (matches && matches.length > 0) {
                recordId = matches[0].id;
                cpfCnpj = matches[0].cpfCnpj;
            }
        } catch (e) {
            // tabela pode ainda não existir — segue sem amarrar
        }

        const { data: inserted, error } = await admin
            .from('billing_whatsapp_messages')
            .insert({
                record_id: recordId,
                cpf_cnpj: cpfCnpj,
                telefone,
                direction,
                body,
                media_url: mediaUrl,
                media_type: mediaType,
                push_name: pushName,
                evolution_msg_id: evolutionMsgId,
                evolution_instance: receivedInstance || expectedInstance || null,
                raw_payload: payload,
            })
            .select('id')
            .single();

        if (error) {
            console.error('[billing-webhook] insert error:', error);
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true, id: inserted?.id, record_id: recordId, direction });
    } catch (e: any) {
        console.error('[billing-webhook] exception:', e);
        return NextResponse.json({ ok: false, error: e?.message || 'unknown' }, { status: 500 });
    }
}
