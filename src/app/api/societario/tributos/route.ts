import { NextRequest, NextResponse } from 'next/server';
import { calcularApuracaoTributariaNF } from '@/lib/services/tributosService';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const valorNfeSaida = Number(body.valor_nfe_saida ?? body.valorNfeSaida ?? 0);
        const valorNfeEntrada = Number(body.valor_nfe_entrada ?? body.valorNfeEntrada ?? 0);

        if (isNaN(valorNfeSaida) || isNaN(valorNfeEntrada)) {
            return NextResponse.json(
                { success: false, error: 'Valores de NFe de Saída e Entrada precisam ser numéricos.' },
                { status: 400 }
            );
        }

        const resultado = calcularApuracaoTributariaNF(valorNfeSaida, valorNfeEntrada);

        return NextResponse.json({
            success: true,
            data: resultado
        });
    } catch (error: any) {
        console.error('Erro na API /api/societario/tributos:', error);
        return NextResponse.json(
            { success: false, error: error.message || 'Erro ao calcular apuração tributária.' },
            { status: 500 }
        );
    }
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const valorNfeSaida = Number(searchParams.get('valor_nfe_saida') || searchParams.get('saida') || 0);
        const valorNfeEntrada = Number(searchParams.get('valor_nfe_entrada') || searchParams.get('entrada') || 0);

        const resultado = calcularApuracaoTributariaNF(valorNfeSaida, valorNfeEntrada);

        return NextResponse.json({
            success: true,
            data: resultado
        });
    } catch (error: any) {
        return NextResponse.json(
            { success: false, error: error.message || 'Erro ao calcular apuração tributária.' },
            { status: 500 }
        );
    }
}
