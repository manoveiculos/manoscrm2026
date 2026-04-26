import { createClient } from '@/lib/supabase/admin';

/**
 * whatsappSender — camada única de envio de WhatsApp do CRM.
 *
 * Responsável por:
 * - Entregar msg ao CLIENTE (IA SDR, follow-up IA)
 * - Entregar msg ao VENDEDOR no número pessoal (cobrança SLA)
 *
 * Providers suportados, em ordem de prioridade:
 *   1. WhatsApp Cloud API (Meta) — se WHATSAPP_CLOUD_TOKEN + WHATSAPP_PHONE_NUMBER_ID presentes
 *   2. Evolution API (auto-hospedada) — se EVOLUTION_BASE_URL + EVOLUTION_INSTANCE_NAME + EVOLUTION_INSTANCE_TOKEN presentes
 *   3. Webhook genérico (ex.: N8N) — se WHATSAPP_SEND_WEBHOOK_URL presente
 *   4. Fallback: grava em notification_failures e retorna false (não quebra o fluxo)
 *
 * IMPORTANTE: o sistema escolhe UM provider por envio (sem cascata em caso de
 * falha) pra evitar entregar a mesma mensagem 2x ao cliente.
 *
 * Dedup: não envia mesma msg (hash) pro mesmo destino em <10min.
 */

const CLOUD_TOKEN = process.env.WHATSAPP_CLOUD_TOKEN;
const CLOUD_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const SEND_WEBHOOK = process.env.WHATSAPP_SEND_WEBHOOK_URL;

// Evolution API (Drivvoo / Evolution)
const EVOLUTION_BASE = process.env.EVOLUTION_BASE_URL;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE_NAME;
const EVOLUTION_TOKEN = process.env.EVOLUTION_INSTANCE_TOKEN;

export type SendKind = 'ai_first_contact' | 'ai_followup' | 'vendor_alert' | 'manual';

export interface SendArgs {
    toPhone: string;
    message: string;
    kind: SendKind;
    leadId?: string;
    consultantId?: string;
    /** Ignora dedup (use só se souber o que está fazendo). */
    skipDedup?: boolean;
}

export interface SendResult {
    ok: boolean;
    provider: 'cloud_api' | 'evolution_api' | 'webhook' | 'none';
    error?: string;
}

function digits(s: string): string {
    return (s || '').replace(/\D/g, '');
}

function normalizeBR(raw: string): string {
    const d = digits(raw);
    if (!d) return '';
    if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d;
    if (d.length === 10 || d.length === 11) return `55${d}`;
    return d;
}

async function hashMsg(input: string): Promise<string> {
    const buf = new TextEncoder().encode(input);
    const h = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

async function logFailure(args: SendArgs, error: string) {
    try {
        const admin = createClient();
        await admin.from('notification_failures').insert({
            lead_id: args.leadId ?? null,
            channel: `whatsapp_${args.kind}`,
            error_message: error,
            payload: { to: args.toPhone, msg_preview: args.message.slice(0, 200) },
            resolved: false,
        });
    } catch {}
}

async function checkDedup(toPhone: string, msgHash: string): Promise<boolean> {
    try {
        const admin = createClient();
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data } = await admin
            .from('whatsapp_send_log')
            .select('id')
            .eq('to_phone', toPhone)
            .eq('msg_hash', msgHash)
            .gte('sent_at', tenMinAgo)
            .limit(1);
        return (data?.length || 0) > 0;
    } catch {
        return false;
    }
}

async function recordSend(toPhone: string, msgHash: string, kind: SendKind, provider: string, leadId?: string) {
    try {
        const admin = createClient();
        await admin.from('whatsapp_send_log').insert({
            to_phone: toPhone,
            msg_hash: msgHash,
            kind,
            provider,
            lead_id: leadId ?? null,
            sent_at: new Date().toISOString(),
        });
    } catch {}
}

async function sendViaCloudAPI(to: string, text: string): Promise<SendResult> {
    try {
        const url = `https://graph.facebook.com/v19.0/${CLOUD_PHONE_ID}/messages`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CLOUD_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to,
                type: 'text',
                text: { body: text },
            }),
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            return { ok: false, provider: 'cloud_api', error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
        }
        return { ok: true, provider: 'cloud_api' };
    } catch (e: any) {
        return { ok: false, provider: 'cloud_api', error: e?.message || 'cloud api error' };
    }
}

async function sendViaWebhook(to: string, text: string, kind: SendKind, meta: Record<string, any>): Promise<SendResult> {
    try {
        const res = await fetch(SEND_WEBHOOK!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to_phone: to,
                message: text,
                kind,
                meta,
            }),
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            return { ok: false, provider: 'webhook', error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
        }
        return { ok: true, provider: 'webhook' };
    } catch (e: any) {
        return { ok: false, provider: 'webhook', error: e?.message || 'webhook error' };
    }
}

async function sendViaEvolutionAPI(to: string, text: string): Promise<SendResult> {
    try {
        if (!EVOLUTION_BASE || !EVOLUTION_INSTANCE || !EVOLUTION_TOKEN) {
            return { ok: false, provider: 'evolution_api', error: 'config_missing' };
        }

        // Remove aspas se presentes nas envs
        const baseUrl = EVOLUTION_BASE.replace(/"/g, '').replace(/\/$/, '');
        const instance = EVOLUTION_INSTANCE.replace(/"/g, '');
        const token = EVOLUTION_TOKEN.replace(/"/g, '');

        const url = `${baseUrl}/message/sendText/${instance}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': token,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                number: to,
                text: text,
                linkPreview: false
            }),
            signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            return { ok: false, provider: 'evolution_api', error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
        }

        return { ok: true, provider: 'evolution_api' };
    } catch (e: any) {
        return { ok: false, provider: 'evolution_api', error: e?.message || 'evolution api error' };
    }
}

export async function sendWhatsApp(args: SendArgs): Promise<SendResult> {
    const to = normalizeBR(args.toPhone);
    if (!to || to.length < 10) {
        await logFailure(args, 'telefone_invalido');
        return { ok: false, provider: 'none', error: 'telefone_invalido' };
    }
    if (!args.message || args.message.trim().length < 2) {
        return { ok: false, provider: 'none', error: 'mensagem_vazia' };
    }

    const msgHash = await hashMsg(`${to}:${args.message}`);
    if (!args.skipDedup && await checkDedup(to, msgHash)) {
        return { ok: false, provider: 'none', error: 'dedup_hit' };
    }

    let result: SendResult;

    if (CLOUD_TOKEN && CLOUD_PHONE_ID) {
        result = await sendViaCloudAPI(to, args.message);
    } else if (EVOLUTION_BASE && EVOLUTION_INSTANCE && EVOLUTION_TOKEN) {
        result = await sendViaEvolutionAPI(to, args.message);
    } else if (SEND_WEBHOOK) {
        result = await sendViaWebhook(to, args.message, args.kind, {
            lead_id: args.leadId,
            consultant_id: args.consultantId,
        });
    } else {
        result = { ok: false, provider: 'none', error: 'no_provider_configured' };
    }

    if (result.ok) {
        await recordSend(to, msgHash, args.kind, result.provider, args.leadId);
    } else {
        await logFailure(args, `${result.provider}: ${result.error}`);
    }
    return result;
}

export function isSenderConfigured(): boolean {
    return Boolean(
        (CLOUD_TOKEN && CLOUD_PHONE_ID) || 
        (EVOLUTION_BASE && EVOLUTION_INSTANCE && EVOLUTION_TOKEN) ||
        SEND_WEBHOOK
    );
}
