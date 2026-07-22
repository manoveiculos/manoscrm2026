import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { createClient as createAuthClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * POST /api/lead/update-info — edita nome do cliente e/ou veículo de interesse.
 * As 3 tabelas de lead usam nomes de coluna diferentes; mapeia aqui.
 * Qualquer consultor logado pode corrigir (facilita achar o cliente no funil).
 */
const COLMAP: Record<string, { name: string; vehicle?: string }> = {
    leads_manos_crm: { name: 'name', vehicle: 'vehicle_interest' },
    leads_distribuicao_crm_26: { name: 'nome', vehicle: 'interesse' },
    leads_compra: { name: 'nome' },
    leads_master: { name: 'nome' },
};

export async function POST(req: NextRequest) {
    try {
        const auth = await createAuthClient();
        const { data: { user } } = await auth.auth.getUser();
        if (!user) return NextResponse.json({ success: false, error: 'não autenticado' }, { status: 401 });

        const b = await req.json();
        const { lead_id, lead_table } = b;
        const map = COLMAP[lead_table];
        if (!lead_id || !map) return NextResponse.json({ success: false, error: 'lead_id/lead_table inválidos' }, { status: 400 });

        const patch: Record<string, any> = {};
        if (b.name !== undefined) {
            const nome = String(b.name).trim();
            if (!nome) return NextResponse.json({ success: false, error: 'nome não pode ficar vazio' }, { status: 400 });
            patch[map.name] = nome;
        }
        if (b.vehicle_interest !== undefined && map.vehicle) {
            patch[map.vehicle] = String(b.vehicle_interest).trim() || null;
        }
        if (Object.keys(patch).length === 0) return NextResponse.json({ success: false, error: 'nada para atualizar' }, { status: 400 });

        const realId: any = lead_table === 'leads_distribuicao_crm_26' ? parseInt(String(lead_id)) : lead_id;
        const admin = createAdminClient();
        const { error } = await admin.from(lead_table).update(patch).eq('id', realId);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || 'erro' }, { status: 500 });
    }
}
