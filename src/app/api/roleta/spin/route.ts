import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { createClient as createAdminSupabase } from '@/lib/supabase/admin';

/**
 * Roleta de Prêmios — endpoint autoritativo.
 *
 * SEGURANÇA (anti-fraude):
 *  - O PRÊMIO É SORTEADO AQUI, no servidor. O cliente nunca escolhe o valor —
 *    apenas anima a roleta até o índice que devolvemos. Não dá pra "grudar" no R$500.
 *  - 1 giro por veículo: checagem prévia + UNIQUE(veiculo_id) garante atomicidade
 *    mesmo com dois cliques/abas simultâneos (idempotente: devolve o prêmio existente).
 *  - O WEBHOOK do n8n dispara AQUI (server-side), no mesmo passo do registro. Assim
 *    ele sobe exatamente 1x, não é spoofável, e não se perde se o vendedor fechar a
 *    aba durante a animação. (A UI só faz a comemoração visual.)
 *  - A identidade do consultor vem da SESSÃO (cookies), não do corpo do request.
 */

export const runtime = 'nodejs';

// Fatias da roleta (R$). Iguais na UI. Server-authoritative.
const PRIZES = [50, 100, 150, 200, 300, 500] as const;

// Pesos opcionais p/ proteger a verba de comissão (mesmo tamanho de PRIZES).
// null = sorteio uniforme. Ex.: [30,25,20,13,8,4] enviesa pros valores baixos.
const PRIZE_WEIGHTS: number[] | null = null;

const N8N_WEBHOOK_URL =
    process.env.N8N_ROLETA_WEBHOOK_URL ||
    'https://n8n.drivvoo.com/webhook/adf3bdba-5213-4e79-ab3b-63546fe90763';

function drawPrizeIndex(): number {
    if (!PRIZE_WEIGHTS || PRIZE_WEIGHTS.length !== PRIZES.length) {
        return Math.floor(Math.random() * PRIZES.length);
    }
    const total = PRIZE_WEIGHTS.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < PRIZE_WEIGHTS.length; i++) {
        r -= PRIZE_WEIGHTS[i];
        if (r < 0) return i;
    }
    return PRIZES.length - 1;
}

async function getSessionConsultant() {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const admin = createAdminSupabase();
    const { data: consultant } = await admin
        .from('consultants_manos_crm')
        .select('id, name, email, phone')
        .or(`user_id.eq.${user.id},auth_id.eq.${user.id}`)
        .maybeSingle();

    return consultant || null;
}

/**
 * GET /api/roleta/spin?veiculo_id=...
 * Devolve dados do consultor (pré-preenchimento) + se o veículo já foi girado.
 */
export async function GET(req: NextRequest) {
    const consultant = await getSessionConsultant();
    if (!consultant) {
        return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
    }

    const veiculoId = req.nextUrl.searchParams.get('veiculo_id');
    if (!veiculoId) {
        return NextResponse.json({ error: 'veiculo_id obrigatório' }, { status: 400 });
    }

    const admin = createAdminSupabase();
    const { data: existing } = await admin
        .from('roletas_rodadas')
        .select('premio_ganho, created_at')
        .eq('veiculo_id', veiculoId)
        .maybeSingle();

    const premio = existing ? Number(existing.premio_ganho) : null;

    return NextResponse.json({
        consultor: {
            nome: consultant.name ?? '',
            email: consultant.email ?? '',
            celular: consultant.phone ?? '',
        },
        alreadySpun: !!existing,
        premio,
        index: premio != null ? PRIZES.indexOf(premio as (typeof PRIZES)[number]) : null,
    });
}

/**
 * POST /api/roleta/spin
 * body: { veiculo_id: string, veiculo_modelo?: string }
 * Sorteia, registra (com trava), dispara webhook, devolve { premio, index }.
 */
export async function POST(req: NextRequest) {
    const consultant = await getSessionConsultant();
    if (!consultant) {
        return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const veiculoId = String(body?.veiculo_id ?? '').trim();
    const veiculoModelo = body?.veiculo_modelo ? String(body.veiculo_modelo).slice(0, 200) : null;
    if (!veiculoId) {
        return NextResponse.json({ error: 'veiculo_id obrigatório' }, { status: 400 });
    }

    const admin = createAdminSupabase();

    // Trava (1): já girou? Idempotente — devolve o prêmio existente, sem re-disparar webhook.
    const { data: existing } = await admin
        .from('roletas_rodadas')
        .select('premio_ganho')
        .eq('veiculo_id', veiculoId)
        .maybeSingle();
    if (existing) {
        const premio = Number(existing.premio_ganho);
        return NextResponse.json({
            alreadySpun: true,
            premio,
            index: PRIZES.indexOf(premio as (typeof PRIZES)[number]),
        });
    }

    // Sorteio server-side.
    const index = drawPrizeIndex();
    const premio = PRIZES[index];

    // Trava (2): UNIQUE(veiculo_id) resolve corrida atômica.
    const { data: inserted, error: insErr } = await admin
        .from('roletas_rodadas')
        .insert({
            consultor_id: consultant.id,
            consultor_nome: consultant.name,
            consultor_email: consultant.email,
            veiculo_id: veiculoId,
            veiculo_modelo: veiculoModelo,
            premio_ganho: premio,
        })
        .select('id')
        .single();

    if (insErr) {
        // 23505 = unique_violation → outra aba/clique ganhou. Devolve o registrado.
        if ((insErr as { code?: string }).code === '23505') {
            const { data: race } = await admin
                .from('roletas_rodadas')
                .select('premio_ganho')
                .eq('veiculo_id', veiculoId)
                .maybeSingle();
            const premioExist = race ? Number(race.premio_ganho) : premio;
            return NextResponse.json({
                alreadySpun: true,
                premio: premioExist,
                index: PRIZES.indexOf(premioExist as (typeof PRIZES)[number]),
            });
        }
        console.error('[roleta/spin] insert falhou:', insErr.message);
        return NextResponse.json({ error: 'falha ao registrar a rodada' }, { status: 500 });
    }

    // Webhook n8n — server-side, garante 1 disparo e não bloqueia o prêmio já gravado.
    try {
        await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event: 'veiculo_vendido',
                consultor_nome: consultant.name,
                veiculo_modelo: veiculoModelo,
                premio_ganho: premio,
                data_hora: new Date().toISOString(),
            }),
        });
    } catch (webhookErr) {
        // Prêmio já está registrado; webhook é best-effort (relatórios/comemoração).
        console.error('[roleta/spin] webhook n8n falhou (prêmio já registrado):', webhookErr);
    }

    return NextResponse.json({ alreadySpun: false, premio, index, rodadaId: inserted?.id });
}
