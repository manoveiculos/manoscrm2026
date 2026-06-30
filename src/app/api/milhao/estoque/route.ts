import { NextResponse } from 'next/server';
import { getInventory } from '@/lib/services/altimusInventory';

export const dynamic = 'force-dynamic';

// Busca no estoque ao vivo do Altimus (feed XML em cache) para puxar um carro
// direto pro lançamento no Milhão, sem redigitar marca/modelo/ano/km/cor/preço.
const norm = (s: string) =>
    (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const q = (searchParams.get('q') || '').trim();
        const inventory = await getInventory();

        let list = inventory.filter((v) => v.marca && v.modelo);
        if (q) {
            const tokens = norm(q).split(/\s+/).filter(Boolean);
            list = list.filter((v) => {
                const hay = norm(`${v.marca} ${v.modelo} ${v.versao || ''} ${v.ano || ''}`);
                return tokens.every((t) => hay.includes(t));
            });
        }

        const veiculos = list.slice(0, 40).map((v) => ({
            id_externo: v.id_externo || null,
            marca: v.marca,
            modelo: v.modelo,
            versao: v.versao || null,
            ano: v.ano,
            preco: v.preco,
            km: v.km || null,
            cor: v.cor || null,
            link: v.link || null,
        }));

        return NextResponse.json({ success: true, total: list.length, veiculos });
    } catch (err: any) {
        console.error('[API Milhão estoque] erro:', err?.message);
        return NextResponse.json({ success: false, error: err?.message || 'erro' }, { status: 500 });
    }
}
