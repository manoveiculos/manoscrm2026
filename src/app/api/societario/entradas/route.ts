import { NextRequest, NextResponse } from 'next/server';
import { registrarEntradaCompra, removerEntradaCompra } from '@/lib/services/societarioService';
import { requireSocio } from '../_guard';

// Entrada de compra: de qual caixa saiu o dinheiro de um carro (pode ser dividido entre Manos e V3)
export async function POST(req: NextRequest) {
    const guard = await requireSocio();
    if (!guard.ok) return guard.res;

    try {
        const body = await req.json();
        const entrada = await registrarEntradaCompra({ ...body, registrado_por: guard.email });
        return NextResponse.json({ success: true, entrada });
    } catch (error: any) {
        console.error('Erro na API /api/societario/entradas:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Erro ao lançar entrada de compra.' },
            { status: 500 }
        );
    }
}

export async function DELETE(req: NextRequest) {
    const guard = await requireSocio();
    if (!guard.ok) return guard.res;

    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
        return NextResponse.json({ success: false, error: 'Informe o id da entrada.' }, { status: 400 });
    }

    try {
        await removerEntradaCompra(id);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Erro na API /api/societario/entradas (DELETE):', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Erro ao remover entrada de compra.' },
            { status: 500 }
        );
    }
}
