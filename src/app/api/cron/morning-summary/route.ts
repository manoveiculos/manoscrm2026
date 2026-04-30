import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { sendWhatsApp, isSenderConfigured } from '@/lib/services/whatsappSender';
import { withHeartbeat } from '@/lib/services/cronHeartbeat';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * GET /api/cron/morning-summary
 *
 * Briefing matinal pro GESTOR — não confundir com morning-push (que é pro vendedor).
 *
 * Roda 1x/dia (ex: 10h UTC = 7h BRT). Manda no WhatsApp pessoal do admin um
 * resumo da equipe: leads recebidos ontem, vendas, perdas, % SLA, top/bottom
 * vendedor, alertas críticos.
 *
 * Destinatário: o primeiro consultor com role='admin' E personal_whatsapp preenchido.
 * (Suporta também env var ADMIN_PHONE como override.)
 */

const FINAL_LOST = ['perdido', 'lost', 'lost_by_inactivity'];
const FINAL_SOLD = ['vendido', 'comprado'];

function fmtPct(n: number): string {
    return `${(n * 100).toFixed(0)}%`;
}

function trophyEmoji(rank: number): string {
    if (rank === 0) return '🥇';
    if (rank === 1) return '🥈';
    if (rank === 2) return '🥉';
    return '•';
}

export async function GET(req: NextRequest) {
    const auth = req.headers.get('authorization');
    const expected = `Bearer ${process.env.CRON_SECRET}`;
    if (process.env.CRON_SECRET && auth !== expected) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    try {
        const result = await withHeartbeat<any>('morning-summary', async () => {
            const admin = createClient();

            // Janela: 24h anteriores (não incluindo o dia corrente)
            const yesterdayStart = new Date();
            yesterdayStart.setDate(yesterdayStart.getDate() - 1);
            yesterdayStart.setHours(0, 0, 0, 0);
            const yesterdayEnd = new Date(yesterdayStart);
            yesterdayEnd.setDate(yesterdayEnd.getDate() + 1);

            // Pega leads + consultores + admin
            const [{ data: leads }, { data: consultants }, { data: admins }] = await Promise.all([
                admin.from('leads_unified')
                    .select('table_name, native_id, name, status, assigned_consultant_id, created_at, first_contact_at, updated_at')
                    .gte('created_at', yesterdayStart.toISOString())
                    .lt('created_at', yesterdayEnd.toISOString())
                    .limit(2000),
                admin.from('consultants_manos_crm')
                    .select('id, name, is_active'),
                admin.from('consultants_manos_crm')
                    .select('id, name, personal_whatsapp, phone')
                    .eq('role', 'admin')
                    .not('personal_whatsapp', 'is', null)
                    .limit(5),
            ]);

            const rows = (leads || []) as any[];
            const isLost = (s: string | null) => FINAL_LOST.includes((s || '').toLowerCase());
            const isSold = (s: string | null) => FINAL_SOLD.includes((s || '').toLowerCase());

            const total = rows.length;
            const sold = rows.filter(r => isSold(r.status)).length;
            const lost = rows.filter(r => isLost(r.status)).length;
            const contacted = rows.filter(r => r.first_contact_at).length;

            // Por vendedor
            const consMap = new Map<string, { name: string }>();
            for (const c of (consultants || []) as any[]) {
                if (c.id && c.is_active) consMap.set(c.id, { name: c.name || 'Sem nome' });
            }
            const byVendor = new Map<string, { name: string; received: number; sold: number; lost: number; respondedFast: number }>();
            for (const r of rows) {
                if (!r.assigned_consultant_id) continue;
                const meta = consMap.get(r.assigned_consultant_id);
                if (!meta) continue;
                let b = byVendor.get(r.assigned_consultant_id);
                if (!b) {
                    b = { name: meta.name, received: 0, sold: 0, lost: 0, respondedFast: 0 };
                    byVendor.set(r.assigned_consultant_id, b);
                }
                b.received++;
                if (isSold(r.status)) b.sold++;
                else if (isLost(r.status)) b.lost++;
                if (r.first_contact_at) {
                    const min = (new Date(r.first_contact_at).getTime() - new Date(r.created_at).getTime()) / 60000;
                    if (min >= 0 && min < 5) b.respondedFast++;
                }
            }
            const vendorList = Array.from(byVendor.values())
                .map(v => ({
                    ...v,
                    conv: v.received > 0 ? v.sold / v.received : 0,
                    fastRate: v.received > 0 ? v.respondedFast / v.received : 0,
                }))
                .sort((a, b) => b.sold - a.sold);

            // Identifica vendedor crítico (recebeu lead mas <30% respondeu em 5min)
            const slowVendors = vendorList.filter(v => v.received >= 3 && v.fastRate < 0.3);

            // Monta mensagem
            const greeting = `☀️ *Bom dia! Resumo de ontem*`;
            const date = yesterdayStart.toLocaleDateString('pt-BR');
            const summary = `\n📅 *${date}*\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `📥 *${total}* leads recebidos\n` +
                `🤖 *${contacted}* contatados (${total > 0 ? fmtPct(contacted / total) : '0%'})\n` +
                `🏆 *${sold}* vendidos\n` +
                `❌ *${lost}* perdidos\n` +
                (total > 0 ? `📊 Conversão: *${fmtPct(sold / total)}*\n` : '');

            const ranking = vendorList.length > 0
                ? `\n*Top vendedores:*\n${vendorList.slice(0, 5).map((v, i) =>
                    `${trophyEmoji(i)} ${v.name}: ${v.sold} venda${v.sold !== 1 ? 's' : ''} / ${v.received} leads (${fmtPct(v.fastRate)} <5min)`
                  ).join('\n')}`
                : '';

            const alerts = slowVendors.length > 0
                ? `\n\n⚠️ *Atenção:*\n${slowVendors.map(v =>
                    `• ${v.name} respondeu em <5min em ${fmtPct(v.fastRate)} de ${v.received} leads (meta: 80%)`
                  ).join('\n')}`
                : '';

            const footer = `\n\n_Painel completo: /admin/conversion?days=1_`;

            const message = greeting + summary + ranking + alerts + footer;

            // Decide destinatário(s)
            const destinos: Array<{ name: string; phone: string }> = [];
            const adminPhoneEnv = process.env.ADMIN_PHONE;
            if (adminPhoneEnv) {
                destinos.push({ name: 'Gestor (env)', phone: adminPhoneEnv });
            }
            for (const a of (admins || []) as any[]) {
                const phone = a.personal_whatsapp || a.phone;
                if (phone) destinos.push({ name: a.name, phone });
            }

            if (!isSenderConfigured() || destinos.length === 0) {
                return {
                    result: { sent: false, reason: !isSenderConfigured() ? 'no_sender' : 'no_destination', preview: message, total, sold, lost, contacted },
                    metrics: { total, sold, lost, contacted, destinos: destinos.length },
                };
            }

            // Envia pra cada destino (1 msg só, deduplicada)
            const sendResults: Array<{ name: string; ok: boolean; error?: string }> = [];
            for (const d of destinos.slice(0, 3)) {
                const r = await sendWhatsApp({
                    toPhone: d.phone,
                    message,
                    kind: 'vendor_alert',
                    skipDedup: false,
                });
                sendResults.push({ name: d.name, ok: r.ok, error: r.error });
            }

            return {
                result: { sent: true, sendResults, total, sold, lost, contacted },
                metrics: { total, sold, lost, contacted, destinos: destinos.length, succeeded: sendResults.filter(r => r.ok).length },
            };
        });

        return NextResponse.json({ ok: true, ...result });
    } catch (e: any) {
        console.error('[morning-summary]', e);
        return NextResponse.json({ ok: false, error: e?.message || 'erro' }, { status: 500 });
    }
}
