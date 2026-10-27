import { NextRequest, NextResponse } from 'next/server';
import { requireFinanceiro } from '../_guard';
import { CONTAS_PADRAO, CATEGORIAS_PADRAO } from '@/lib/financeiro/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const guard = await requireFinanceiro(req);
    if (!guard.ok) return guard.res;

    const { adminClient, effectiveOwner, userEmail, isAlexandre } = guard;

    try {
        // 1. Contas
        let { data: contas } = await adminClient
            .from('fin_contas')
            .select('*')
            .eq('owner_email', effectiveOwner)
            .order('ordem', { ascending: true });

        if (!contas || contas.length === 0) {
            const defaultRows = CONTAS_PADRAO.map(c => ({
                ...c,
                owner_email: effectiveOwner,
                saldo_inicial: 0,
                ativa: true,
            }));
            const inserted = await adminClient.from('fin_contas').insert(defaultRows).select();
            contas = inserted.data || [];
        }

        // 2. Categorias
        let { data: categorias } = await adminClient
            .from('fin_categorias')
            .select('*')
            .eq('owner_email', effectiveOwner)
            .order('nome', { ascending: true });

        if (!categorias || categorias.length === 0) {
            const defaultCats = CATEGORIAS_PADRAO.map(c => ({
                ...c,
                owner_email: effectiveOwner,
                ativa: true,
            }));
            const insertedCats = await adminClient.from('fin_categorias').insert(defaultCats).select();
            categorias = insertedCats.data || [];
        }

        return NextResponse.json({
            success: true,
            userEmail,
            effectiveOwner,
            isAlexandre,
            contas,
            categorias,
        });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
    }
}
