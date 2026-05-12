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
        const { lead_id } = body;

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

        const table = getTableForLead(lead_id);
        const cleanId = stripPrefix(lead_id);
        const realId = table === 'leads_distribuicao_crm_26' ? parseInt(cleanId) : cleanId;

        const updates: Record<string, any> = {
            atendimento_iniciado_em: new Date().toISOString(),
            atendimento_iniciado_por: consultant.id,
        };

        // Lê estado atual do lead pra decidir o que fazer
        const { data: leadRow } = await admin
            .from(table)
            .select('assigned_consultant_id, atendimento_iniciado_em, atendimento_iniciado_por')
            .eq('id', realId)
            .maybeSingle();

        // BLOQUEIO: já iniciado por OUTRO consultor → não permite ataque
        if (leadRow?.atendimento_iniciado_em && leadRow.atendimento_iniciado_por && leadRow.atendimento_iniciado_por !== consultant.id) {
            // Busca nome do dono pra mostrar mensagem clara
            const { data: dono } = await admin
                .from('consultants_manos_crm')
                .select('name')
                .eq('id', leadRow.atendimento_iniciado_por)
                .maybeSingle();
            const donoName = dono?.name || 'outro vendedor';
            return NextResponse.json({
                success: false,
                locked: true,
                locked_by: donoName,
                error: `Lead já está sendo atendido por ${donoName.split(' ')[0]}.`,
            }, { status: 409 });
        }

        // Já iniciado por VOCÊ → idempotente, retorna sem mudar nada
        if (leadRow?.atendimento_iniciado_em && leadRow.atendimento_iniciado_por === consultant.id) {
            return NextResponse.json({
                success: true,
                already_started: true,
                started_at: leadRow.atendimento_iniciado_em,
            });
        }

        // Atribui ao consultor que iniciou (mesmo se já tinha outro dono sem atendimento iniciado)
        // — é "quem chega primeiro e clica leva". Isso protege contra distribuição automática
        // que não foi seguida na prática.
        updates.assigned_consultant_id = consultant.id;

        const { error } = await admin.from(table).update(updates).eq('id', realId);
        if (error) {
            console.error('[start-atendimento] update erro:', error);
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        // Audit trail
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(realId));
        await admin.from('interactions_manos_crm').insert({
            [isUUID ? 'lead_id' : 'lead_id_v1']: String(realId),
            type: 'atendimento_iniciado',
            notes: `🤝 ${consultant.name} iniciou atendimento`,
            user_name: consultant.name,
            created_at: new Date().toISOString(),
        }).then(null, () => {});

        return NextResponse.json({
            success: true,
            consultant_id: consultant.id,
            consultant_name: consultant.name,
            started_at: updates.atendimento_iniciado_em,
        });
    } catch (e: any) {
        console.error('[start-atendimento] exception:', e);
        return NextResponse.json({ success: false, error: e?.message || 'erro' }, { status: 500 });
    }
}
