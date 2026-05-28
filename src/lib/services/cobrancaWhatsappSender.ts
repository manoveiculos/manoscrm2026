import { createClient } from '@/lib/supabase/admin';

/**
 * cobrancaWhatsappSender — camada de envio WhatsApp do módulo de Cobrança.
 *
 * IMPORTANTE: instância **separada** do SDR (Arthur/Karol) por anti-ban.
 * Usa as envs EVOLUTION_COBRANCA_*. Não toca em EVOLUTION_INSTANCE_NAME (SDR).
 *
 * Toda mensagem enviada também é registrada em billing_whatsapp_messages
 * com direction = 'OUTBOUND', para aparecer na aba WhatsApp da cobrança.
 */

const EVOLUTION_BASE = process.env.EVOLUTION_COBRANCA_BASE_URL;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_COBRANCA_INSTANCE_NAME;
const EVOLUTION_TOKEN = process.env.EVOLUTION_COBRANCA_INSTANCE_TOKEN;

export interface CobrancaSendArgs {
    toPhone: string;
    message: string;
    recordId?: string;
    cpfCnpj?: string;
    skipDedup?: boolean;
}

export interface CobrancaSendResult {
    ok: boolean;
    error?: string;
    evolutionMsgId?: string;
}

function digits(s: string): string {
    return (s || '').replace(/\D/g, '');
}

// Formato para enviar ao Evolution: PRECISA do 55
function normalizeForEvolution(raw: string): string {
    const d = digits(raw);
    if (!d) return '';
    if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d;
    if (d.length === 10 || d.length === 11) return `55${d}`;
    return d;
}

// Formato para gravar no DB: SEM o 55, igual ao webhook (consistência do inbox)
function normalizeForDb(raw: string): string {
    const d = digits(raw);
    if (!d) return '';
    if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d.slice(2);
    return d;
}

async function checkDedup(toPhone: string, message: string): Promise<boolean> {
    try {
        const admin = createClient();
        const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data } = await admin
            .from('billing_whatsapp_messages')
            .select('id')
            .eq('telefone', toPhone)
            .eq('direction', 'OUTBOUND')
            .eq('body', message)
            .gte('created_at', tenMinAgo)
            .limit(1);
        return (data?.length || 0) > 0;
    } catch {
        return false;
    }
}

async function recordOutbound(args: CobrancaSendArgs, evolutionMsgId: string | undefined, toPhone: string) {
    try {
        const admin = createClient();
        await admin.from('billing_whatsapp_messages').insert({
            record_id: args.recordId ?? null,
            cpf_cnpj: args.cpfCnpj ?? null,
            telefone: toPhone,
            direction: 'OUTBOUND',
            body: args.message,
            evolution_msg_id: evolutionMsgId ?? null,
            evolution_instance: EVOLUTION_INSTANCE ?? null,
        });
    } catch (e) {
        // não bloqueia o envio se o registro falhar
        console.error('[cobrancaSender] falha ao gravar OUTBOUND:', e);
    }
}

export function isCobrancaSenderConfigured(): boolean {
    return Boolean(EVOLUTION_BASE && EVOLUTION_INSTANCE && EVOLUTION_TOKEN);
}

export async function sendCobrancaWhatsApp(args: CobrancaSendArgs): Promise<CobrancaSendResult> {
    if (!isCobrancaSenderConfigured()) {
        return { ok: false, error: 'EVOLUTION_COBRANCA_* não configurado' };
    }

    const toEvolution = normalizeForEvolution(args.toPhone);
    const toDb = normalizeForDb(args.toPhone);
    if (!toEvolution || toEvolution.length < 10) {
        return { ok: false, error: 'telefone_invalido' };
    }
    if (!args.message || args.message.trim().length < 2) {
        return { ok: false, error: 'mensagem_vazia' };
    }

    // Bloqueio de Fórum (Judicial Avançado)
    if (args.recordId) {
        const admin = createClient();
        const { data: recordData } = await admin
            .from('records_cobrancamanos26')
            .select('fase')
            .eq('id', args.recordId)
            .maybeSingle();
        if (recordData?.fase === 'ENVIO_FORUM') {
            return { ok: false, error: 'bloqueio_judicial_forum' };
        }
    } else if (args.toPhone) {
        const admin = createClient();
        const { data: recordsData } = await admin
            .from('records_cobrancamanos26')
            .select('fase')
            .eq('telefone', toDb)
            .eq('fase', 'ENVIO_FORUM')
            .limit(1);
        if (recordsData && recordsData.length > 0) {
            return { ok: false, error: 'bloqueio_judicial_forum' };
        }
    }

    if (!args.skipDedup && await checkDedup(toDb, args.message)) {
        return { ok: false, error: 'dedup_hit_10min' };
    }

    const baseUrl = EVOLUTION_BASE!.replace(/"/g, '').replace(/\/$/, '');
    const instance = EVOLUTION_INSTANCE!.replace(/"/g, '');
    const token = EVOLUTION_TOKEN!.replace(/"/g, '');

    try {
        const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
            method: 'POST',
            headers: {
                'apikey': token,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                number: toEvolution,
                text: args.message,
                linkPreview: false,
            }),
            signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) {
            const body = await res.text().catch(() => '');
            return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
        }

        const json = await res.json().catch(() => ({}));
        const evolutionMsgId = json?.key?.id || json?.id;

        await recordOutbound(args, evolutionMsgId, toDb);

        return { ok: true, evolutionMsgId };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'evolution_request_failed' };
    }
}
