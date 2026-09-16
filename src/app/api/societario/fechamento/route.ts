import { NextRequest, NextResponse } from 'next/server';
import { 
    cadastrarCompraVeiculo,
    cadastrarVendaVeiculo,
    ajustarApuracaoVeiculo
} from '@/lib/services/societarioService';
import { requireSocio } from '../_guard';

export async function POST(req: NextRequest) {
    const guard = await requireSocio();
    if (!guard.ok) return guard.res;

    try {
        const body = await req.json();
        const { ação, ...payload } = body;

        if (ação === 'compra') {
            const result = await cadastrarCompraVeiculo(payload);
            return NextResponse.json({ success: true, ...result });
        } 
        
        if (ação === 'venda') {
            const result = await cadastrarVendaVeiculo(payload);
            return NextResponse.json({ success: true, ...result });
        }

        // Gastos, comissão, imposto e partilha — inclusive de venda já finalizada
        if (ação === 'ajustar') {
            const result = await ajustarApuracaoVeiculo(payload);
            return NextResponse.json({ success: true, ...result });
        }

        return NextResponse.json(
            { success: false, error: 'Ação inválida. Utilize "compra", "venda" ou "ajustar".' },
            { status: 400 }
        );
    } catch (error: any) {
        console.error('Erro na API /api/societario/fechamento:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Erro ao processar operação.' },
            { status: 500 }
        );
    }
}
