import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getTableForLead, stripPrefix } from '@/lib/services/leadRouter';

/**
 * POST /api/lead/start-atendimento
 *
 * Vendedor clicou "INICIAR ATENDIMENTO" na tela /lead/:id.
 * Marca atendimento_iniciado_em + atendimento_iniciado_por com o consultor
 * logado. SLA Watcher usa esse timestamp pra cobrar (2h, 4h, 24h).
 *
 * Idempotente: se já iniciou, retorna 200 sem mudar nada.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { lead_id, lead_table } = body;

        if (!lead_id) {
            return NextResponse.json({ success: false, error: 'lead_id obrigatório' }, { status: 400 });
        }

        // Pega consultor logado pelo Supabase Auth
        const cookieStore = await cookies();
        const supabaseSSR = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll: () => cookieStore.getAll(),
                    setAll: () => {},
                },
            }
        );
        const { data: { user } } = await supabaseSSR.auth.getUser();
        if (!user) {
            return NextResponse.json({ success: false, error: 'não autenticado' }, { status: 401 });
        }

        const admin = createClient();
        const { data: consultant } = await admin
            .from('consultants_manos_crm')
            .select('id, name')
            .or(`user_id.eq.${user.id},auth_id.eq.${user.id}`)
            .maybeSingle();

        if (!consultant) {
            return NextResponse.json({ success: false, error: 'consultor não encontrado' }, { status: 403 });
        }

        // Prioriza lead_table explícito (frontend mais novo passa esse campo).
        // Cai no leadRouter pra retro-compatibilidade com chamadas antigas.
        const table = (lead_table && ['leads_compra', 'leads_manos_crm', 'leads_distribuicao_crm_26', 'leads_master'].includes(lead_table))
            ? lead_table
            : getTableForLead(lead_id);
        const cleanId = stripPrefix(lead_id);
        const realId: any = table === 'leads_distribuicao_crm_26' ? parseInt(cleanId) : cleanId;

        const nowIso = new Date().toISOString();
        // leads_master é espelho e NÃO tem colunas de atendimento — trata à parte.
        const hasAtendimento = table !== 'leads_master';

        const updates: Record<string, any> = {
            status: 'attempt', // V4: Move para atendimento para ativar cobranças
            assigned_consultant_id: consultant.id, // "quem clica leva"
            ultima_interacao_humana: nowIso,
        };
        if (hasAtendimento) {
            updates.atendimento_iniciado_em = nowIso;
            updates.atendimento_iniciado_por = consultant.id;
        }
        // Sincroniza a coluna de texto 'vendedor' (evita inconsistência de dados)
        if (table === 'leads_distribuicao_crm_26' || table === 'leads_master') {
            updates.vendedor = consultant.name;
        }

        if (hasAtendimento) {
            // ── CLAIM ATÔMICO (anti-race) ────────────────────────────────────
            // Reivindica SÓ se ninguém iniciou. UPDATE ... WHERE é atômico: sob
            // concorrência, quem commita primeiro ganha; o 2º re-avalia o WHERE
            // contra a linha já reivindicada (READ COMMITTED) → 0 linhas afetadas.
            const { data: claimed, error: claimErr } = await admin
                .from(table)
                .update(updates)
                .eq('id', realId)
                .is('atendimento_iniciado_por', null)
                .select('id');

            if (claimErr) {
                console.error('[start-atendimento] claim erro:', claimErr);
                return NextResponse.json({ success: false, error: claimErr.message }, { status: 500 });
            }

            if (!claimed || claimed.length === 0) {
                // Não reivindiquei → ou o lead não existe, ou já tem dono.
                const { data: leadRow } = await admin
                    .from(table)
                    .select('atendimento_iniciado_por, atendimento_iniciado_em')
                    .eq('id', realId)
                    .maybeSingle();

                if (!leadRow) {
                    return NextResponse.json({ success: false, error: 'lead não encontrado' }, { status: 404 });
                }
                // Já é seu → idempotente (não reseta o timer)
                if (leadRow.atendimento_iniciado_por === consultant.id) {
                    return NextResponse.json({ success: true, already_started: true, started_at: leadRow.atendimento_iniciado_em });
                }
                // Outro vendedor chegou primeiro → 409 com o nome do dono
                const { data: dono } = await admin
                    .from('consultants_manos_crm').select('name').eq('id', leadRow.atendimento_iniciado_por).maybeSingle();
                const donoName = dono?.name || 'outro vendedor';
                return NextResponse.json({
                    success: false,
                    locked: true,
                    locked_by: donoName,
                    error: `Lead já capturado por ${donoName.split(' ')[0]}.`,
                }, { status: 409 });
            }
        } else {
            // leads_master (raro no fluxo de pesca): best-effort, sem lock de atendimento.
            const { error } = await admin.from(table).update(updates).eq('id', realId);
            if (error) {
                console.error('[start-atendimento] update master erro:', error);
                return NextResponse.json({ success: false, error: error.message }, { status: 500 });
            }
        }

        // Audit trail (só chega aqui quem reivindicou de fato)
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(realId));
        await admin.from('interactions_manos_crm').insert({
            [isUUID ? 'lead_id' : 'lead_id_v1']: String(realId),
            type: 'atendimento_iniciado',
            notes: `🤝 ${consultant.name} iniciou atendimento`,
            user_name: consultant.name,
            created_at: nowIso,
        }).then(null, () => {});

        return NextResponse.json({
            success: true,
            consultant_id: consultant.id,
            consultant_name: consultant.name,
            started_at: nowIso,
        });
    } catch (e: any) {
        console.error('[start-atendimento] exception:', e);
        return NextResponse.json({ success: false, error: e?.message || 'erro' }, { status: 500 });
    }
}
