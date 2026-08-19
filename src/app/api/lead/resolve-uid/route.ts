import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getTableForLead, stripPrefix } from '@/lib/services/leadRouter';

export const dynamic = 'force-dynamic';

/**
 * GET /api/lead/resolve-uid?id=<id da listagem>
 *
 * Devolve o uid canônico ("<tabela>:<id>") que a tela /lead/:uid entende.
 *
 * Por que existe: a listagem (/leads, /pipeline) lê da view `leads`, que serve
 * leads_master — um ESPELHO deduplicado por telefone, alimentado por trigger.
 * A tela do lead lê de leads_unified, que só cobre as 3 tabelas operacionais.
 * Mandar "leads_master:<uuid>" pra lá dá "Lead não encontrado".
 *
 * leads_master não guarda o id de origem: a única ligação com o lead real é o
 * telefone. Por isso o espelho é resolvido via find_lead_by_phone, a mesma RPC
 * que o webhook do WhatsApp usa pra casar mensagem com lead.
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
        if (!user) {
            return NextResponse.json({ success: false, error: 'não autenticado' }, { status: 401 });
        }

        const rawId = req.nextUrl.searchParams.get('id') || '';
        if (!rawId) {
            return NextResponse.json({ success: false, error: 'id obrigatório' }, { status: 400 });
        }

        const admin = createClient();
        const table = getTableForLead(rawId);
        const nativeId = stripPrefix(rawId);

        // Caminho normal: já é uma das 3 tabelas operacionais.
        if (table !== 'leads_master') {
            const { data } = await admin
                .from('leads_unified')
                .select('uid')
                .eq('table_name', table)
                .eq('native_id', String(nativeId))
                .maybeSingle();
            if (data?.uid) {
                return NextResponse.json({ success: true, uid: data.uid });
            }
            // Não achou na unified — cai no lookup por telefone abaixo.
        }

        // Espelho (ou id órfão): resolve pelo telefone.
        const { data: master } = await admin
            .from('leads_master')
            .select('phone, name')
            .eq('id', nativeId)
            .maybeSingle();

        const phone = master?.phone;
        if (!phone) {
            return NextResponse.json({
                success: false,
                error: 'não foi possível localizar este lead nas tabelas de atendimento',
            }, { status: 404 });
        }

        const { data: match } = await admin
            .rpc('find_lead_by_phone', { p_phone: phone })
            .maybeSingle();

        // ATENÇÃO: o campo `uid` da RPC vem no formato LEGADO ("dist_2966"), que
        // o parseUid da tela não decodifica (vira leads_manos_crm com id errado).
        // O uid canônico se monta com table_name + native_id.
        const achado = match as any;
        if (!achado?.table_name || !achado?.native_id) {
            return NextResponse.json({
                success: false,
                error: `${master?.name || 'Este lead'} só existe no espelho (leads_master) — não há atendimento aberto pra abrir.`,
            }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            uid: `${achado.table_name}:${achado.native_id}`,
        });
    } catch (e: any) {
        console.error('[resolve-uid] erro:', e);
        return NextResponse.json({ success: false, error: e?.message || 'erro interno' }, { status: 500 });
    }
}
