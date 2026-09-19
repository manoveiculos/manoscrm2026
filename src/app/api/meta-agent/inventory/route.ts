import { NextRequest, NextResponse } from 'next/server';
import { validateMetaAgentAuth } from '@/lib/metaAgentAuth';
import { getInventory, AltimusVehicle, formatVehicle } from '@/lib/services/altimusInventory';

export async function GET(req: NextRequest) {
    const auth = validateMetaAgentAuth(req);
    if (!auth.valid) return auth.response!;

    try {
        const { searchParams } = new URL(req.url);
        const query = (searchParams.get('query') || '').toLowerCase().trim();
        const maxPrice = searchParams.get('max_price') ? parseFloat(searchParams.get('max_price')!) : null;
        const minYear = searchParams.get('min_year') ? parseInt(searchParams.get('min_year')!, 10) : null;
        const transmission = (searchParams.get('transmission') || '').toLowerCase().trim();

        const allVehicles = await getInventory();

        const filtered = allVehicles.filter(v => {
            const fullText = `${v.marca} ${v.modelo} ${v.versao || ''} ${v.cor || ''} ${v.combustivel || ''}`.toLowerCase();

            if (query && !fullText.includes(query)) {
                // Tenta divisão em tokens para busca flexível
                const queryTokens = query.split(/\s+/).filter(Boolean);
                const matchesTokens = queryTokens.every(token => fullText.includes(token));
                if (!matchesTokens) return false;
            }

            if (maxPrice && v.preco && v.preco > maxPrice) return false;
            if (minYear && v.ano && v.ano < minYear) return false;
            if (transmission && v.cambio && !v.cambio.toLowerCase().includes(transmission)) return false;

            return true;
        });

        // Limita a 10 melhores resultados para o contexto do agente de IA
        const topResults = filtered.slice(0, 10).map(v => ({
            id: v.id_externo || `${v.marca}-${v.modelo}-${v.ano}`.toLowerCase().replace(/\s+/g, '-'),
            name: `${v.marca} ${v.modelo} ${v.versao || ''}`.trim(),
            brand: v.marca,
            model: v.modelo,
            price: v.preco,
            year: v.ano,
            km: v.km,
            transmission: v.cambio || 'Não informado',
            fuel: v.combustivel || 'Flex',
            color: v.cor || 'Não informada',
            summary: formatVehicle(v),
            link: v.link
        }));

        return NextResponse.json({
            total: filtered.length,
            showing: topResults.length,
            vehicles: topResults
        });

    } catch (err: any) {
        console.error('API /api/meta-agent/inventory error:', err);
        return NextResponse.json({ error: err.message || 'Erro ao consultar estoque Altimus' }, { status: 500 });
    }
}
