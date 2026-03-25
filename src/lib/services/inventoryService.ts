import { supabase } from './supabaseClients';
import { cacheGet, cacheSet, TTL } from './cacheLayer';
import { InventoryItem } from '@/lib/types';

/**
 * SERVIÇO DE ESTOQUE (INVENTORY)
 * Utiliza a tabela 'estoque' no Supabase.
 */

export async function getInventory() {
    const cacheKey = 'inventory_all';
    const cached = cacheGet<InventoryItem[]>(cacheKey);
    if (cached) return cached;

    const { data, error } = await supabase
        .from('estoque')
        .select('*');

    if (error) {
        console.error("Supabase error fetching inventory:", error);
        throw error;
    }
    
    const items = (data || []) as InventoryItem[];
    cacheSet(cacheKey, items, TTL.INVENTORY);
    return items;
}
