import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabaseAdmin = createClient();

const WEBHOOK = process.env.AGENDA_WEBHOOK_URL
    || 'https://n8n.drivvoo.com/webhook/b25e1146-a59b-45b2-ba3c-8a1872bff1ab';

// Formata um instante como ISO com offset de Brasília (-03:00), como a spec pede.
function brtIso(d: Date): string {
    const b = new Date(d.getTime() - 3 * 3600_000);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${b.getUTCFullYear()}-${p(b.getUTCMonth() + 1)}-${p(b.getUTCDate())}T${p(b.getUTCHours())}:${p(b.getUTCMinutes())}:${p(b.getUTCSeconds())}-03:00`;
}
const digits = (s?: string | null) => (s || '').replace(/\D/g, '') || null;

/**
 * Dispara lembretes de visita ao webhook do n8n.
 *   • 1 dia antes  → a partir das 18:00 (BRT) do dia anterior
 *   • no dia       → a partir das 08:00 (BRT), e nunca depois da hora da visita
 * Idempotente: só dispara se a flag correspondente estiver null; grava o
 * timestamp após 2xx. Chamado pelo fifteen-min-scheduler.
 */
export async function GET(req: NextRequest) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const nowMs = Date.now();
    // Candidatos: visitas ativas, futuras, dentro dos próximos 3 dias, com algum lembrete pendente
    const { data: rows, error } = await supabaseAdmin
        .from('agendamentos')
        .select('*')
        .in('status', ['agendado', 'confirmado'])
        .gte('data_hora', new Date(nowMs).toISOString())
        .lte('data_hora', new Date(nowMs + 3 * 86400_000).toISOString())
        .or('lembrete_1d_enviado_em.is.null,lembrete_dia_enviado_em.is.null');

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

    const post = async (a: any, tipoLembrete: '1_dia_antes' | 'no_dia') => {
        const v = vendById.get(a.vendedor_id) || {};
        const payload = {
            evento: 'lembrete_visita',
            tipo_lembrete: tipoLembrete,
            enviado_em: brtIso(new Date()),
            agendamento: {
                id: a.id,
                data_hora: brtIso(new Date(a.data_hora)),
                tipo: a.tipo,
                endereco: a.endereco || null,
                veiculo_interesse: a.veiculo_interesse || null,
                status: a.status,
                observacoes: a.observacoes || null,
            },
            vendedor: {
                id: a.vendedor_id,
                nome: v.name || null,
                email: v.email || null,
                telefone: null,
                whatsapp: null,
            },
            cliente: {
                nome: a.cliente_nome,
                telefone: digits(a.cliente_telefone),
                whatsapp: digits(a.cliente_whatsapp) || digits(a.cliente_telefone),
                lead_id: a.lead_uid || null,
            },
        };
        const res = await fetch(WEBHOOK, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`webhook ${res.status}`);
    };

    for (const a of rows || []) {
        const dh = new Date(a.data_hora);
        const brt = new Date(dh.getTime() - 3 * 3600_000);
        const y = brt.getUTCFullYear(), m = brt.getUTCMonth(), day = brt.getUTCDate();
        const dayBefore18h = Date.UTC(y, m, day - 1, 21, 0, 0); // 18:00 BRT
        const dayOf8h = Date.UTC(y, m, day, 11, 0, 0);          // 08:00 BRT
        const dhMs = dh.getTime();

        const noDiaDue = !a.lembrete_dia_enviado_em && nowMs >= dayOf8h && nowMs < dhMs;
        const umDiaDue = !a.lembrete_1d_enviado_em && nowMs >= dayBefore18h && nowMs < dhMs;

        try {
            if (noDiaDue) {
                await post(a, 'no_dia');
                const patch: any = { lembrete_dia_enviado_em: new Date().toISOString() };
                if (!a.lembrete_1d_enviado_em) patch.lembrete_1d_enviado_em = new Date().toISOString(); // suprime o 1-dia atrasado
                await supabaseAdmin.from('agendamentos').update(patch).eq('id', a.id);
                enviados++;
            } else if (umDiaDue) {
                await post(a, '1_dia_antes');
                await supabaseAdmin.from('agendamentos').update({ lembrete_1d_enviado_em: new Date().toISOString() }).eq('id', a.id);
                enviados++;
            }
        } catch (e: any) {
            erros.push(`${a.id}: ${e?.message || e}`); // não grava flag → tenta de novo no próximo ciclo
        }
    }

    return NextResponse.json({ success: erros.length === 0, enviados, candidatos: rows?.length || 0, erros, timestamp: new Date().toISOString() });
}
