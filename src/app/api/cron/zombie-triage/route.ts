import { createClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { withHeartbeat } from '@/lib/services/cronHeartbeat';

export const maxDuration = 120;

/**
 * GET /api/cron/zombie-triage
 *
 * Roda 1x/dia (sugerido: 6h BRT = 9h UTC). Triagem automática de leads zumbis
 * (>15d sem interação). Classifica em 3 buckets e age conforme:
 *
 *   1. LIXO          → permanently_delete_lead + blocklist
 *      Critério: sem first_contact_at + score < 30 + >30 dias + sem inbound
 *      Justificativa: lead nunca foi tocado, score baixo, e ninguém quis
 *      responder. É spam ou número errado.
 *
 *   2. REATIVAR      → marca respondeu_follow_up=false, follow_up_count=0,
 *                       ai_silence_until=NULL, status='received'
 *                       (assim entra no fluxo da IA SDR novamente em <1min)
 *      Critério: cliente já respondeu alguma vez + score >= 60 + >15d parado
 *      Justificativa: lead quente esquecido. Tenta reativar.
 *
 *   3. ARQUIVAR FRIO → status='frio' (sai do /inbox principal)
 *      Critério: resto (15d+ parado, sem critério pra lixo ou reativar)
 *      Justificativa: não morto, mas dorme. Vendedor não vê no inbox.
 *
 * Modo: ?dryRun=true preview sem aplicar.
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const url = new URL(request.url);
    const dryRun = url.searchParams.get('dryRun') === 'true';

    return await withHeartbeat('zombie-triage', async () => {
        const out = await runTriage(dryRun);
        return { result: NextResponse.json(out), metrics: out };
    });
}

interface TriageMetrics {
    ok: boolean;
    dryRun: boolean;
    candidates: number;
    lixo: number;
    reativar: number;
    arquivar: number;
    erros: number;
    errors_sample?: Array<{ lead_id: string; reason: string }>;
}

async function runTriage(dryRun: boolean): Promise<TriageMetrics> {
    const admin = createClient();
    const m: TriageMetrics = { ok: true, dryRun, candidates: 0, lixo: 0, reativar: 0, arquivar: 0, erros: 0 };
    const errors: Array<{ lead_id: string; reason: string }> = [];

    // Critério "zumbi": leads_unified_active com updated_at > 15 dias atrás.
    // leads_unified_active já filtra status final + archived_at IS NULL.
    const cutoff15d = new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString();
    const cutoff30d = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

    const { data: zombies, error } = await admin
        .from('leads_unified_active')
        .select('uid, table_name, native_id, name, phone, ai_score, first_contact_at, updated_at, status')
        .lt('updated_at', cutoff15d)
        .limit(200);

    if (error) {
        return { ...m, ok: false, erros: 1, errors_sample: [{ lead_id: '_query', reason: error.message }] };
    }

    if (!zombies || zombies.length === 0) {
        return m;
    }
    m.candidates = zombies.length;

    for (const z of zombies) {
        try {
            const score = Number(z.ai_score || 0);
            const isOld30d = !!z.updated_at && z.updated_at < cutoff30d;
            const noFirstContact = !z.first_contact_at;

            // Já respondeu? Conta inbound em whatsapp_messages.
            let hasInbound = false;
            try {
                const { count } = await admin
                    .from('whatsapp_messages')
                    .select('id', { count: 'exact', head: true })
                    .eq('lead_id', String(z.native_id))
                    .eq('direction', 'inbound');
                hasInbound = (count || 0) > 0;
            } catch { hasInbound = false; }

            // ── Classificação ──
            let bucket: 'lixo' | 'reativar' | 'arquivar';

            // Lixo (regras combinadas):
            //   A) Nunca contatado + sem inbound + >30 dias + score < 30
            //   B) Nunca contatado + sem inbound + >15 dias + score = 0 (claramente bot/spam)
            const isLixoStrict = noFirstContact && isOld30d && score < 30 && !hasInbound;
            const isLixoZeroScore = noFirstContact && !hasInbound && score === 0;

            if (isLixoStrict || isLixoZeroScore) {
                bucket = 'lixo';
            } else if (hasInbound && score >= 60) {
                bucket = 'reativar';
            } else {
                bucket = 'arquivar';
            }

            if (dryRun) {
                m[bucket]++;
                continue;
            }

            // ── Ação ──
            if (bucket === 'lixo') {
                const { error: delErr } = await admin.rpc('permanently_delete_lead', {
                    p_lead_id: String(z.native_id),
                    p_lead_table: z.table_name,
                    p_reason: 'zombie_auto_trash',
                    p_deleted_by: 'cron_zombie_triage',
                });
                if (delErr) { errors.push({ lead_id: z.uid, reason: delErr.message }); m.erros++; continue; }
                m.lixo++;
            } else if (bucket === 'reativar') {
                const updates: Record<string, any> = {
                    follow_up_count: 0,
                    respondeu_follow_up: false,
                    ai_silence_until: null,
                    atendimento_manual_at: null,
                    status: 'received',
                };
                if (z.table_name === 'leads_distribuicao_crm_26') {
                    updates.atualizado_em = new Date().toISOString();
                } else {
                    updates.updated_at = new Date().toISOString();
                }
                const { error: upErr } = await admin
                    .from(z.table_name)
                    .update(updates)
                    .eq('id', z.table_name === 'leads_distribuicao_crm_26' ? parseInt(z.native_id) : z.native_id);
                if (upErr) { errors.push({ lead_id: z.uid, reason: upErr.message }); m.erros++; continue; }

                // Re-enfileira IA SDR pra mandar msg de reativação
                await admin.from('ai_sdr_queue').insert({
                    lead_id: String(z.native_id),
                    lead_table: z.table_name,
                    payload: {
                        leadId: String(z.native_id),
                        leadName: z.name,
                        leadPhone: z.phone,
                        vehicleInterest: null,
                        source: 'reativacao_zumbi',
                        consultantName: null,
                        flow: 'venda',
                    },
                    scheduled_at: new Date(Date.now() + 60_000).toISOString(),
                }).then(null, () => { /* unique_violation = OK, já enfileirado */ });

                m.reativar++;
            } else {
                // arquivar: seta archived_at (sinal canônico de "saiu da fila"),
                // que a view leads_unified_active passou a respeitar (mig 20260711).
                // Mantém status='frio' só como marcador de motivo.
                // NÃO reseta updated_at: resetar mascarava a idade real do lead e
                // era o que criava o "zumbi imortal" (reaparecia fresco a cada rodada).
                const updates: Record<string, any> = {
                    status: 'frio',
                    archived_at: new Date().toISOString(),
                    archived_reason: 'zombie_auto_archive: 15d+ sem interação',
                };
                const { error: upErr } = await admin
                    .from(z.table_name)
                    .update(updates)
                    .eq('id', z.table_name === 'leads_distribuicao_crm_26' ? parseInt(z.native_id) : z.native_id);
                if (upErr) { errors.push({ lead_id: z.uid, reason: upErr.message }); m.erros++; continue; }
                m.arquivar++;
            }
        } catch (e: any) {
            errors.push({ lead_id: z.uid || 'unknown', reason: e?.message || 'exception' });
            m.erros++;
        }
    }

    if (errors.length > 0) m.errors_sample = errors.slice(0, 10);
    return m;
}
