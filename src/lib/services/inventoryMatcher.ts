import { createClient } from '@/lib/supabase/admin';

/**
 * inventoryMatcher — encontra os melhores veículos do estoque para um lead.
 *
 * Heurística simples + barata:
 *   1. Tokeniza vehicleInterest, descarta stopwords
 *   2. ILIKE em marca, modelo, versão pra cada token
 *   3. Score por # de tokens batidos + preço dentro da faixa do lead (se houver)
 *   4. Top N (default 3) com status != vendido/reservado
 */

export interface InventoryItem {
    id: string;
    marca: string | null;
    modelo: string | null;
    ano: number | null;
    preco: number | null;
    km: number | null;
    cambio: string | null;
    combustivel: string | null;
    status: string | null;
}

export interface MatchedItem extends InventoryItem {
    score: number;
}

const STOPWORDS = new Set([
    'um', 'uma', 'o', 'a', 'os', 'as', 'de', 'da', 'do', 'e', 'ou',
    'qualquer', 'algum', 'meu', 'meus', 'pra', 'para', 'por', 'com',
    'novo', 'usado', 'seminovo', 'carro', 'veiculo', 'veículo', 'auto',
    'preto', 'branco', 'prata', 'cinza', 'vermelho', 'azul',
    'manual', 'automatico', 'automático', 'flex', 'gasolina', 'diesel', 'hibrido',
]);

function tokenize(s: string): string[] {
    return (s || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

function score(item: InventoryItem, tokens: string[], priceRange?: { min?: number; max?: number }): number {
    const text = `${item.marca || ''} ${item.modelo || ''}`.toLowerCase();
    let s = 0;
    for (const t of tokens) {
        if (text.includes(t)) s += 2;
    }
    if (item.ano) s += Math.max(0, (item.ano - 2015) / 10);
    if (priceRange && item.preco) {
        const p = item.preco;
        if (priceRange.min && p < priceRange.min) s -= 0.5;
        if (priceRange.max && p > priceRange.max) s -= 1;
        if (priceRange.min && priceRange.max && p >= priceRange.min && p <= priceRange.max) s += 1;
    }
    return s;
}

/**
 * Busca top N do estoque que melhor batem com o interesse do lead.
 * Se não houver token útil ou nada bater, retorna lista vazia (caller decide fallback).
 */
export async function matchInventoryForInterest(
    vehicleInterest: string | null | undefined,
    options: { limit?: number; priceRange?: { min?: number; max?: number } } = {}
): Promise<MatchedItem[]> {
    const tokens = tokenize(vehicleInterest || '');
    const limit = options.limit ?? 3;
    if (tokens.length === 0) return [];

    const admin = createClient();

    // ILIKE por OR entre tokens — barato, sem fuzzy DB.
    const orClause = tokens.flatMap(t => [`marca.ilike.%${t}%`, `modelo.ilike.%${t}%`]).join(',');

    const { data } = await admin
        .from('inventory_manos_crm')
        .select('id, marca, modelo, ano, preco, km, cambio, combustivel, status')
        .or(orClause)
        .not('status', 'in', '("vendido","reservado")')
        .limit(40);

    const items = (data || []) as InventoryItem[];
    const ranked = items
        .map(i => ({ ...i, score: score(i, tokens, options.priceRange) }))
        .filter(i => i.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    return ranked;
}

/**
 * Formata um item pra texto curto e legível (1 linha).
 * Usado tanto em prompts de IA quanto em UI.
 */
export function formatInventoryLine(item: InventoryItem): string {
    const parts: string[] = [];
    const head = [item.marca, item.modelo].filter(Boolean).join(' ').trim();
    if (head) parts.push(head);
    if (item.ano) parts.push(String(item.ano));
    if (item.preco) parts.push(`R$ ${Number(item.preco).toLocaleString('pt-BR')}`);
    if (item.km) parts.push(`${Number(item.km).toLocaleString('pt-BR')}km`);
    return parts.join(' · ');
}
