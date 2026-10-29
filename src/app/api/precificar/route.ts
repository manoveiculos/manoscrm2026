import { NextResponse } from 'next/server';

const FIPE_BASE_URL = 'https://parallelum.com.br/fipe/api/v1';
const FIPE_V2_BASE_URL = 'https://fipe.parallelum.com.br/api/v2';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const vehicleType = searchParams.get('tipo') || 'carros'; // carros, motos, caminhoes
    const brandId = searchParams.get('marca');
    const modelId = searchParams.get('modelo');
    const yearId = searchParams.get('ano');
    const fipeCode = searchParams.get('codigoFipe');
    const history = searchParams.get('historico') === 'true';

    try {
        // Se pedir histórico pelo código FIPE + anoId
        if (history && fipeCode && yearId) {
            const v2Type = vehicleType === 'motos' ? 'motorcycles' : vehicleType === 'caminhoes' ? 'trucks' : 'cars';
            const endpoint = `${FIPE_V2_BASE_URL}/${v2Type}/${fipeCode}/years/${yearId}/history`;

            const res = await fetch(endpoint, {
                next: { revalidate: 86400 }
            });

            if (!res.ok) {
                return NextResponse.json(
                    { error: 'Falha ao buscar histórico FIPE' },
                    { status: res.status }
                );
            }

            const data = await res.json();
            return NextResponse.json(data);
        }

        // Fluxo padrão v1 (Marcas -> Modelos -> Anos -> Preço atual)
        let endpoint = `${FIPE_BASE_URL}/${vehicleType}/marcas`;

        if (brandId && modelId && yearId) {
            endpoint = `${FIPE_BASE_URL}/${vehicleType}/marcas/${brandId}/modelos/${modelId}/anos/${yearId}`;
        } else if (brandId && modelId) {
            endpoint = `${FIPE_BASE_URL}/${vehicleType}/marcas/${brandId}/modelos/${modelId}/anos`;
        } else if (brandId) {
            endpoint = `${FIPE_BASE_URL}/${vehicleType}/marcas/${brandId}/modelos`;
        }

        const res = await fetch(endpoint, {
            next: { revalidate: 86400 } // Cache por 24 horas
        });

        if (!res.ok) {
            return NextResponse.json(
                { error: 'Falha ao buscar dados na base FIPE' },
                { status: res.status }
            );
        }

        const data = await res.json();
        return NextResponse.json(data);
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || 'Erro interno no servidor de precificação' },
            { status: 500 }
        );
    }
}
