import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getTableForLead, stripPrefix } from '@/lib/services/leadRouter';

/**
 * POST /api/lead/transfer
 *
 * Encaminha o lead para outro consultor responsável.
 * Redefine o status do lead para 'new' e limpa o atendimento para acionar as notificações
 * e permitir que o novo consultor assuma o atendimento clicando em "INICIAR ATENDIMENTO".
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { lead_id, lead_table, target_consultant_id } = body;

        if (!lead_id) {
            return NextResponse.json({ success: false, error: 'lead_id obrigatório' }, { status: 400 });
        }
        if (!target_consultant_id) {
            return NextResponse.json({ success: false, error: 'target_consultant_id obrigatório' }, { status: 400 });
        }

        // Pega consultor logado (remetente) pelo Supabase Auth
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
        
        // Dados do remetente
        const { data: remetente } = await admin
            .from('consultants_manos_crm')
            .select('id, name')
            .or(`user_id.eq.${user.id},auth_id.eq.${user.id}`)
            .maybeSingle();

        if (!remetente) {
            return NextResponse.json({ success: false, error: 'consultor remetente não encontrado' }, { status: 403 });
        }

        // Dados do destinatário
        const { data: destinatario } = await admin
            .from('consultants_manos_crm')
            .select('id, name')
            .eq('id', target_consultant_id)
            .maybeSingle();

        if (!destinatario) {
            return NextResponse.json({ success: false, error: 'consultor destinatário não encontrado' }, { status: 404 });
        }

        // Determina a tabela correta do lead
        const table = (lead_table && ['leads_compra', 'leads_manos_crm', 'leads_distribuicao_crm_26', 'leads_master'].includes(lead_table))
            ? lead_table
            : getTableForLead(lead_id);
        const cleanId = stripPrefix(lead_id);
        const realId: any = table === 'leads_distribuicao_crm_26' ? parseInt(cleanId) : cleanId;

        // Monta os updates para encaminhar o lead
        const updates: Record<string, any> = {
            assigned_consultant_id: destinatario.id,
            status: 'new', // Retorna para status 'new' para gerar a notificação sonora/sininho
            atendimento_iniciado_em: null, // Reseta o atendimento para o novo consultor iniciar
            atendimento_iniciado_por: null,
            ultima_interacao_humana: new Date().toISOString(),
        };

        // Sincroniza a coluna 'vendedor' de texto (se existir na tabela)
        if (table === 'leads_distribuicao_crm_26' || table === 'leads_master') {
            updates.vendedor = destinatario.name;
        }

        const { error: updateError } = await admin.from(table).update(updates).eq('id', realId);
        if (updateError) {
            console.error('[lead-transfer] update erro:', updateError);
            return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
        }

        // Audit Trail (interactions_manos_crm)
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(realId));
        await admin.from('interactions_manos_crm').insert({
            [isUUID ? 'lead_id' : 'lead_id_v1']: String(realId),
            type: 'lead_transferido',
            notes: `🔄 Lead encaminhado de ${remetente.name} para ${destinatario.name}`,
            user_name: remetente.name,
            created_at: new Date().toISOString(),
        }).then(null, (err) => {
            console.warn('[lead-transfer] audit error:', err?.message);
        });

        return NextResponse.json({
            success: true,
            message: 'Lead encaminhado com sucesso',
        });
    } catch (e: any) {
        console.error('[lead-transfer] exception:', e);
        return NextResponse.json({ success: false, error: e?.message || 'erro interno' }, { status: 500 });
    }
}
