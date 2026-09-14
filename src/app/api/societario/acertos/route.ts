import { NextRequest, NextResponse } from 'next/server';
import { registrarAcertoEmpresas, removerAcertoEmpresas } from '@/lib/services/societarioService';
import { requireSocio } from '../_guard';

export async function POST(req: NextRequest) {
    const guard = await requireSocio();
    if (!guard.ok) return guard.res;

    try {
        const body = await req.json();
        const acerto = await registrarAcertoEmpresas({ ...body, registrado_por: guard.email });
        return NextResponse.json({ success: true, acerto });
    } catch (error: any) {
        console.error('Erro na API /api/societario/acertos:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Erro ao registrar acerto.' },
            { status: 500 }
        );
    }
}

export async function DELETE(req: NextRequest) {
    const guard = await requireSocio();
    if (!guard.ok) return guard.res;

    const id = req.nextUrl.searchParams.get('id');
    if (!id) {
        return NextResponse.json({ success: false, error: 'Informe o id do acerto.' }, { status: 400 });
    }

    try {
        await removerAcertoEmpresas(id);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Erro na API /api/societario/acertos (DELETE):', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Erro ao excluir acerto.' },
            { status: 500 }
        );
    }
}
