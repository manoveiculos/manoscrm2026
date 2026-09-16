import { NextRequest, NextResponse } from 'next/server';
import { registrarRetiradaSocio, removerRetiradaSocio } from '@/lib/services/societarioService';
import { requireSocio } from '../_guard';

export async function POST(req: NextRequest) {
    const guard = await requireSocio();
    if (!guard.ok) return guard.res;

    try {
        const body = await req.json();
        const retirada = await registrarRetiradaSocio(body);
        return NextResponse.json({ success: true, retirada });
    } catch (error: any) {
        console.error('Erro na API /api/societario/retiradas:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Erro ao registrar retirada.' },
            { status: 500 }
        );
    }
}

export async function DELETE(req: NextRequest) {
    const guard = await requireSocio();
    if (!guard.ok) return guard.res;

    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
        return NextResponse.json({ success: false, error: 'Informe o id da retirada.' }, { status: 400 });
    }

    try {
        await removerRetiradaSocio(id);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Erro na API /api/societario/retiradas (DELETE):', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Erro ao excluir retirada.' },
            { status: 500 }
        );
    }
}
