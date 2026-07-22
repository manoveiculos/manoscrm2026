import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { postAgendaWebhook } from '@/lib/agendaWebhook';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabaseAdmin = createClient();

/**
 * Lembretes de visita → webhook n8n (além do evento de criação, disparado
 * na hora pelo POST /api/agenda):
 *   • 24h_antes → quando faltam ≤24h pra visita
 *   • no_dia    → a partir das 08:00 (BRT) do dia da visita
 *   • 2h_antes  → quando faltam ≤2h ("pra não ter perigo de esquecer")
 *
 * Idempotente por flags; 1 disparo por visita por ciclo (o mais urgente).
 * Quando um lembrete mais urgente dispara, os anteriores pendentes são
 * suprimidos (evita 2-3 avisos em sequência pra visita criada em cima da hora).
 * Chamado pelo fifteen-min-scheduler.
 */
export async function GET(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const nowMs = Date.now();
    const { data: rows, error } = await supabaseAdmin
        .from('agendamentos')
        .select('*')
        .in('status', ['agendado', 'confirmado'])
        .gte('data_hora', new Date(nowMs).toISOString())
        .lte('data_hora', new Date(nowMs + 2 * 86400_000).toISOString())
        .or('lembrete_1d_enviado_em.is.null,lembrete_dia_enviado_em.is.null,lembrete_2h_enviado_em.is.null');

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    // Cache de vendedores
    const vendIds = [...new Set((rows || []).map((r) => r.vendedor_id))];
    const vendById = new Map<string, any>();
    if (vendIds.length) {
        const { data: cons } = await supabaseAdmin.from('consultants_manos_crm').select('auth_id, name, email').in('auth_id', vendIds);
        for (const c of cons || []) vendById.set(c.auth_id, c);
    }

    let enviados = 0;
    const erros: string[] = [];
    const nowIso = () => new Date().toISOString();

    for (const a of rows || []) {
        const dhMs = new Date(a.data_hora).getTime();
        if (dhMs <= nowMs) continue;

        // 08:00 BRT do dia da visita, em UTC
        const brt = new Date(dhMs - 3 * 3600_000);
        const dayOf8h = Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 11, 0, 0);

        const due2h = !a.lembrete_2h_enviado_em && nowMs >= dhMs - 2 * 3600_000;
        const dueDia = !a.lembrete_dia_enviado_em && nowMs >= dayOf8h;
        const due24h = !a.lembrete_1d_enviado_em && nowMs >= dhMs - 24 * 3600_000;

        try {
            const v = vendById.get(a.vendedor_id);
            if (due2h) {
                await postAgendaWebhook(a, { evento: 'lembrete_visita', tipo_lembrete: '2h_antes' }, v);
                const patch: any = { lembrete_2h_enviado_em: nowIso() };
                if (!a.lembrete_dia_enviado_em) patch.lembrete_dia_enviado_em = nowIso();
                if (!a.lembrete_1d_enviado_em) patch.lembrete_1d_enviado_em = nowIso();
                await supabaseAdmin.from('agendamentos').update(patch).eq('id', a.id);
                enviados++;
            } else if (dueDia) {
                await postAgendaWebhook(a, { evento: 'lembrete_visita', tipo_lembrete: 'no_dia' }, v);
                const patch: any = { lembrete_dia_enviado_em: nowIso() };
                if (!a.lembrete_1d_enviado_em) patch.lembrete_1d_enviado_em = nowIso();
                await supabaseAdmin.from('agendamentos').update(patch).eq('id', a.id);
                enviados++;
            } else if (due24h) {
                await postAgendaWebhook(a, { evento: 'lembrete_visita', tipo_lembrete: '24h_antes' }, v);
                await supabaseAdmin.from('agendamentos').update({ lembrete_1d_enviado_em: nowIso() }).eq('id', a.id);
                enviados++;
            }
        } catch (e: any) {
            erros.push(`${a.id}: ${e?.message || e}`); // flag não gravada → retry no próximo ciclo
        }
    }

    return NextResponse.json({ success: erros.length === 0, enviados, candidatos: rows?.length || 0, erros, timestamp: new Date().toISOString() });
}
