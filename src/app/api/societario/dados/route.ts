import { NextResponse } from 'next/server';
import { getSocietarioDashboardData } from '@/lib/services/societarioService';
import { requireSocio } from '../_guard';

export async function GET() {
    try {
        const guard = await requireSocio();
        if (!guard.ok) return guard.res;

        const data = await getSocietarioDashboardData();
        return NextResponse.json({ success: true, socio: { email: guard.email, nome: guard.nome }, ...data });
    } catch (error: any) {
        console.error('Erro na API /api/societario/dados:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Erro ao carregar dados societários.' },
            { status: 500 }
        );
    }
}
