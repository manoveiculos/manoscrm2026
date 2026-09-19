import { NextRequest, NextResponse } from 'next/server';
import { validateMetaAgentAuth } from '@/lib/metaAgentAuth';
import { getInventory } from '@/lib/services/altimusInventory';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = validateMetaAgentAuth(req);
    if (!auth.valid) return auth.response!;

    try {
        const resolvedParams = await params;
        const vehicleId = (resolvedParams.id || '').toLowerCase().trim();
        const allVehicles = await getInventory();

        const match = allVehicles.find(v => {
            const currentId = (v.id_externo || `${v.marca}-${v.modelo}-${v.ano}`).toLowerCase().replace(/\s+/g, '-');
            return currentId === vehicleId || (v.id_externo && v.id_externo.toLowerCase() === vehicleId) || `${v.marca} ${v.modelo}`.toLowerCase().includes(vehicleId);
        });

        if (!match) {
            return NextResponse.json({ error: `Veículo '${resolvedParams.id}' não encontrado no estoque atual` }, { status: 404 });
        }

        return NextResponse.json({
            id: match.id_externo || vehicleId,
            name: `${match.marca} ${match.modelo} ${match.versao || ''}`.trim(),
            brand: match.marca,
            model: match.modelo,
            version: match.versao || 'Padrão',
            price: match.preco,
            year: match.ano,
            year_fabrication: match.anoFabricacao,
            km: match.km,
            transmission: match.cambio || 'Automático/Manual',
            fuel: match.combustivel || 'Flex',
            color: match.cor || 'Preto/Prata/Branco',
            description: `Veículo ${match.marca} ${match.modelo} ${match.versao || ''} em excelente estado de conservação, revisado e com garantia Mano's Veículos.`,
            link: match.link || `https://manosveiculos.com.br/veiculo/${match.id_externo || ''}`,
            store: "Mano's Veículos - Balneário Camboriú / SC"
        });

    } catch (err: any) {
        console.error('API /api/meta-agent/vehicle/[id] error:', err);
        return NextResponse.json({ error: err.message || 'Erro ao buscar detalhes do veículo' }, { status: 500 });
    }
}
