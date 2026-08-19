import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getTableForLead, stripPrefix } from '@/lib/services/leadRouter';

/**
 * POST /api/lead/transfer
 *
 * Encaminha o lead para outro consultor responsável — é o ÚNICO caminho de troca
 * de dono no app (ConsultantBadge e lista de leads chamam esta rota).
 *
 * Redefine o status do lead para 'new' e limpa o atendimento para acionar as
 * notificações e permitir que o novo consultor assuma clicando em "INICIAR
 * ATENDIMENTO".
 *
 * Marca lead_distribuicao como 'manual': transferência feita por gente sai do
 * rodízio automático. Sem isso o tick via o dono ANTIGO com o SLA estourado e
 * repassava o lead pra outra pessoa, desfazendo a decisão do gestor.
 *
 * Permissão: admin transfere qualquer lead; vendedor só transfere lead que é
 * dele (senão a transferência vira caminho pra pegar lead do colega).
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
            .select('id, name, role')
            .or(`user_id.eq.${user.id},auth_id.eq.${user.id}`)
            .maybeSingle();

        if (!remetente) {
            return NextResponse.json({ success: false, error: 'consultor remetente não encontrado' }, { status: 403 });
        }

        // Dados do destinatário
        const { data: destinatario } = await admin
            .from('consultants_manos_crm')
            .select('id, name, is_active')
            .eq('id', target_consultant_id)
            .maybeSingle();

        if (!destinatario) {
            return NextResponse.json({ success: false, error: 'consultor destinatário não encontrado' }, { status: 404 });
        }
        if (destinatario.is_active === false) {
            return NextResponse.json({ success: false, error: `${destinatario.name} está inativo e não pode receber leads.` }, { status: 400 });
        }
        if (destinatario.id === remetente.id) {
            return NextResponse.json({ success: false, error: 'esse lead já é seu' }, { status: 400 });
        }

        // Determina a tabela correta do lead
        const table = (lead_table && ['leads_compra', 'leads_manos_crm', 'leads_distribuicao_crm_26', 'leads_master'].includes(lead_table))
            ? lead_table
            : getTableForLead(lead_id);
        const cleanId = stripPrefix(lead_id);
        const realId: any = table === 'leads_distribuicao_crm_26' ? parseInt(cleanId) : cleanId;

        const isAdmin = remetente.role === 'admin' || user.email === 'alexandre_gorges@hotmail.com';

        // Vendedor só passa adiante o lead que é dele. Admin passa qualquer um.
        if (!isAdmin) {
            const { data: atual } = await admin
                .from(table)
                .select('assigned_consultant_id, atendimento_iniciado_por')
                .eq('id', realId)
                .maybeSingle();
            if (!atual) {
                return NextResponse.json({ success: false, error: 'lead não encontrado' }, { status: 404 });
            }
            const meu = atual.assigned_consultant_id === remetente.id
                     || atual.atendimento_iniciado_por === remetente.id;
            if (!meu) {
                return NextResponse.json({ success: false, error: 'esse lead não é seu — peça pra gerência transferir.' }, { status: 403 });
            }
        }

        // Monta os updates para encaminhar o lead
        const nowIso = new Date().toISOString();
        const updates: Record<string, any> = {
            assigned_consultant_id: destinatario.id,
            status: 'new', // Retorna para status 'new' para gerar a notificação sonora/sininho
            atendimento_iniciado_em: null, // Reseta o atendimento para o novo consultor iniciar
            atendimento_iniciado_por: null,
            ultima_interacao_humana: nowIso,
        };

        // Sincroniza a coluna 'vendedor' de texto (se existir na tabela)
        if (table === 'leads_distribuicao_crm_26' || table === 'leads_master') {
            updates.vendedor = destinatario.name;
        }

        // O .select() é obrigatório: sem ele um UPDATE que não pegou linha
        // nenhuma (id errado, tabela errada) volta como sucesso e a
        // transferência some sem ninguém perceber — foi o bug do badge.
        const { data: updated, error: updateError } = await admin
            .from(table).update(updates).eq('id', realId).select('id');
        if (updateError) {
            console.error('[lead-transfer] update erro:', updateError);
            return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
        }
        if (!updated || updated.length === 0) {
            return NextResponse.json(
                { success: false, error: `lead ${realId} não encontrado em ${table}` },
                { status: 404 }
            );
        }

        // Roleta: dono novo + fora do rodízio automático ('manual'). Sem isso o
        // tick vê o dono antigo com SLA estourado e repassa pra outro.
        await admin.from('lead_distribuicao').upsert({
            lead_uid: `${table}:${cleanId}`,
            table_name: table,
            native_id: String(cleanId),
            status: 'manual',
            assigned_consultant_id: destinatario.id,
            distribuido_em: nowIso,
            atendido_em: null,
            atualizado_em: nowIso,
        }, { onConflict: 'lead_uid' }).then(null, (err: any) => {
            console.warn('[lead-transfer] lead_distribuicao:', err?.message);
        });

        // Audit Trail (interactions_manos_crm)
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(String(realId));
        await admin.from('interactions_manos_crm').insert({
            [isUUID ? 'lead_id' : 'lead_id_v1']: String(realId),
            type: 'lead_transferido',
            notes: `🔄 Lead encaminhado de ${remetente.name} para ${destinatario.name}`,
            user_name: remetente.name,
            created_at: nowIso,
        }).then(null, (err) => {
            console.warn('[lead-transfer] audit error:', err?.message);
        });

        return NextResponse.json({
            success: true,
            message: `Lead encaminhado para ${destinatario.name}`,
            consultant_id: destinatario.id,
            consultant_name: destinatario.name,
        });
    } catch (e: any) {
        console.error('[lead-transfer] exception:', e);
        return NextResponse.json({ success: false, error: e?.message || 'erro interno' }, { status: 500 });
    }
}
