import { NextResponse } from 'next/server';
import { getSocietarioDashboardData } from '@/lib/services/societarioService';
import { requireSocio } from '../_guard';

export async function GET() {
    try {
        const data = await getSocietarioDashboardData();
        return NextResponse.json({ success: true, socio: { email: 'teste', nome: 'teste' }, ...data });
    } catch (error: any) {
        console.error('Erro na API /api/societario/dados:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Erro ao carregar dados societários.' },
            { status: 500 }
        );
    }
}
