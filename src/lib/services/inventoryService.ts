import { cacheGet, cacheSet, TTL } from './cacheLayer';
import { InventoryItem } from '@/lib/types';
import { veiculosDoEstoque } from '@/lib/estoque';

/**
 * SERVIÇO DE ESTOQUE (INVENTORY)
 * Lê o feed da Altimus pela função única de estoque (src/lib/estoque).
 * A tabela `estoque` do Supabase está OBSOLETA e não é mais fonte.
 */

export async function getInventory() {
    const cacheKey = 'inventory_all';
    const cached = cacheGet<InventoryItem[]>(cacheKey);
    if (cached) return cached;

    const veiculos = await veiculosDoEstoque();
    const items = veiculos.map((v, i): InventoryItem => ({
        id: Number(v.id_externo) || i + 1,
        marca: v.marca,
        modelo: v.modelo,
        ano: v.ano ?? '',
        cor: v.cor ?? '',
        preco: v.preco,
        km: v.km ?? null,
        cambio: v.cambio,
        combustivel: v.combustivel,
        status: 'available',
        descricao: [v.marca, v.modelo, v.versao].filter(Boolean).join(' '),
        imagem_url: v.fotos?.[0],
    }));
    // lista vazia (Altimus nunca respondeu) não fica em cache: a próxima chamada tenta de novo
    if (items.length) cacheSet(cacheKey, items, TTL.INVENTORY);
    return items;
}
