// Updated: 2026-09-14
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/inbox/pesca
 *
 * Retorna a Fila Geral (Pesca) do Inbox:
 * Leads ATIVOS sem consultor atribuído (assigned_consultant_id IS NULL)
 * e sem atendimento iniciado (atendimento_iniciado_em IS NULL).
 *
 * Usa service_role server-side para contornar RLS de leitura.
 */
export async function GET(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const ssr = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
        );
        const { data: { user } } = await ssr.auth.getUser();
        if (!user) return NextResponse.json({ success: false, error: 'não autenticado' }, { status: 401 });

        const admin = createClient();
        const { data: cons } = await admin
            .from('consultants_manos_crm')
            .select('id, is_active, role')
            .or(`user_id.eq.${user.id},auth_id.eq.${user.id}`)
            .maybeSingle();

        if (!cons?.id || cons.is_active === false) {
            return NextResponse.json({ success: true, leads: [] });
        }

        const { searchParams } = new URL(req.url);
        const filter = searchParams.get('filter') || 'priority';

        let query = admin
            .from('leads_unified_active')
            .select('uid, table_name, native_id, name, phone, vehicle_interest, source, ai_score, ai_classification, status, updated_at, created_at, proxima_acao, first_contact_at, first_contact_channel, assigned_consultant_id, atendimento_iniciado_em, atendimento_iniciado_por, flagged_reversao, ultima_interacao_humana, descarte_financeiro, diagnostico_atendimento')
            .is('assigned_consultant_id', null)
            .is('atendimento_iniciado_em', null)
            .neq('descarte_financeiro', true)
            .limit(300);

        if (filter === 'today') {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            query = query.gte('created_at', todayStart.toISOString());
        }

        query = query
            .order('flagged_reversao', { ascending: false })
            .order('created_at', { ascending: false });

        const { data, error } = await query;
        if (error) {
            console.error('[inbox/pesca] error:', error);
            return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        const rawLeads = data || [];

        // Buscar veículo_interesse real e dados de formulário das tabelas base
        const crm26Ids = rawLeads.filter((l: any) => l.table_name === 'leads_distribuicao_crm_26').map((l: any) => parseInt(l.native_id, 10)).filter((id: number) => !isNaN(id));
        const manosIds = rawLeads.filter((l: any) => l.table_name === 'leads_manos_crm').map((l: any) => l.native_id);
        const compraIds = rawLeads.filter((l: any) => l.table_name === 'leads_compra').map((l: any) => l.native_id);
        const fbIds = rawLeads.filter((l: any) => l.table_name === 'leadsfacebook').map((l: any) => l.native_id);

        const promises: Promise<any>[] = [];
        if (crm26Ids.length > 0) promises.push(Promise.resolve(admin.from('leads_distribuicao_crm_26').select('id, interesse, carro_troca').in('id', crm26Ids)));
        if (manosIds.length > 0) promises.push(Promise.resolve(admin.from('leads_manos_crm').select('id, vehicle_interest, carro_troca').in('id', manosIds)));
        if (compraIds.length > 0) promises.push(Promise.resolve(admin.from('leads_compra').select('id, veiculo_original, carro_troca').in('id', compraIds)));
        if (fbIds.length > 0) promises.push(Promise.resolve(admin.from('leadsfacebook').select('id, vehicle_interest, cidade, momento_compra, forma_pagamento, observacoes').in('id', fbIds)));

        if (promises.length > 0) {
            const results = await Promise.all(promises);
            const infoMap = new Map<string, any>();
            let idx = 0;
            if (crm26Ids.length > 0) {
                const res = results[idx++];
                if (res.data) res.data.forEach((item: any) => infoMap.set(`leads_distribuicao_crm_26:${item.id}`, { interest: item.interesse, troca: item.carro_troca }));
            }
            if (manosIds.length > 0) {
                const res = results[idx++];
                if (res.data) res.data.forEach((item: any) => infoMap.set(`leads_manos_crm:${item.id}`, { interest: item.vehicle_interest, troca: item.carro_troca }));
            }
            if (compraIds.length > 0) {
                const res = results[idx++];
                if (res.data) res.data.forEach((item: any) => infoMap.set(`leads_compra:${item.id}`, { interest: item.veiculo_original, troca: item.carro_troca }));
            }
            if (fbIds.length > 0) {
                const res = results[idx++];
                if (res.data) res.data.forEach((item: any) => infoMap.set(`leadsfacebook:${item.id}`, { interest: item.vehicle_interest, cidade: item.cidade, momento: item.momento_compra, pagamento: item.forma_pagamento, obs: item.observacoes }));
            }

            rawLeads.forEach((l: any) => {
                const info = infoMap.get(`${l.table_name}:${l.native_id}`);
                if (info) {
                    if (info.interest) l.vehicle_interest = info.interest;
                    if (info.troca) l.carro_troca = info.troca;
                    if (info.cidade) l.cidade = info.cidade;
                    if (info.momento) l.momento_compra = info.momento;
                    if (info.pagamento) l.forma_pagamento = info.pagamento;
                    if (info.obs) l.observacoes = info.obs;
                }
            });
        }

        return NextResponse.json({ success: true, leads: rawLeads });
    } catch (e: any) {
        console.error('[inbox/pesca] exception:', e);
        return NextResponse.json({ success: false, error: e?.message || 'erro' }, { status: 500 });
    }
}
