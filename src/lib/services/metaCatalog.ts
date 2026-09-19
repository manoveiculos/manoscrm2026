/**
 * metaCatalog — ponte entre o veiculo e o ID que o Facebook conhece.
 *
 * REGRA DE OURO (nao quebrar):
 *   content_ids enviado na Conversions API === retailer_id do feed do catalogo.
 *
 * Onde isso foi conferido (catalogo "Altimus_Veiculos", id 712583511204994):
 *   XML Altimus  <id>3563862</id>   <valor>219900.0</valor>
 *   Catalogo FB  retailer_id "3563862"   price 219900.00 BRL
 * Ou seja: o `id_externo` que o altimusInventory ja parseia do <id> E o
 * retailer_id. Nao existe conversao, nao existe prefixo, nao inventar ID.
 *
 * Se nao der pra provar qual e o retailer_id, este modulo devolve null e o
 * evento vai SEM content_ids. Mandar o ID errado e pior que nao mandar:
 * suja o catalogo e quebra o remarketing dinamico.
 */

import { getInventory, AltimusVehicle } from '@/lib/services/altimusInventory';

export interface ResolvedCatalogVehicle {
    /** retailer_id do feed — vai direto em content_ids. */
    retailerId: string;
    /** Preco do feed (fallback pro `value` quando o caller nao informa). */
    price: number | null;
    /** Nome legivel, so pra log/auditoria. */
    name: string;
    /** Como chegamos nesse ID — util pra debugar match ruim. */
    matchedBy: 'explicit_id' | 'interest_match';
    /** false = ID informado pelo caller que nao esta no feed atual (ex: carro ja vendido). */
    inLiveFeed: boolean;
}

function vehicleLabel(v: AltimusVehicle): string {
    return [v.marca, v.modelo, v.versao].filter(Boolean).join(' ').trim();
}

/** minusculo, sem acento, so alfanumerico. */
function norm(s: string): string {
    return (s || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenSet(s: string): Set<string> {
    return new Set(norm(s).split(' ').filter(Boolean));
}

/**
 * Match ESTRITO de texto livre -> veiculo do feed.
 *
 * Por que nao usar o findMatch do altimusInventory: ele e proposital-mente
 * frouxo (score por substring) porque serve pra sugerir estoque no WhatsApp —
 * "sei la, algum carro" casa com um Corolla porque "la" esta dentro de
 * "corolla". Pra content_ids isso seria fatal: manda um retailer_id errado e
 * suja o catalogo. Aqui a regra e o contrario: so devolve ID se der pra provar.
 *
 * Exige:
 *   - TODOS os tokens da marca presentes no texto (token inteiro, nao substring);
 *   - o token do modelo presente no texto;
 *   - vencedor UNICO — se dois carros do estoque servem (ex: dois Corolla),
 *     e ambiguo e devolvemos null.
 */
function strictMatch(interest: string, inventory: AltimusVehicle[]): AltimusVehicle | null {
    const tokens = tokenSet(interest);
    if (tokens.size === 0) return null;

    const candidates = inventory.filter(v => {
        if (!v.id_externo || !v.marca || !v.modelo) return false;

        // Marca: todos os tokens (cobre "Land Rover", "Mercedes Benz")
        const marcaTokens = norm(v.marca).split(' ').filter(Boolean);
        if (marcaTokens.length === 0 || !marcaTokens.every(t => tokens.has(t))) return false;

        // Modelo: pelo menos um token do modelo presente
        const modeloTokens = norm(v.modelo).split(' ').filter(Boolean);
        if (modeloTokens.length === 0 || !modeloTokens.some(t => tokens.has(t))) return false;

        return true;
    });

    if (candidates.length === 1) return candidates[0];
    if (candidates.length === 0) return null;

    // Empate: tenta desempatar por ano e/ou versao citados no texto.
    const refinados = candidates.filter(v => {
        const anoOk = v.ano ? tokens.has(String(v.ano)) : false;
        const versaoTokens = v.versao ? norm(v.versao).split(' ').filter(Boolean) : [];
        const versaoOk = versaoTokens.length > 0 && versaoTokens.some(t => t.length >= 3 && tokens.has(t));
        return anoOk || versaoOk;
    });

    // Ainda ambiguo -> null. Nao chutar.
    return refinados.length === 1 ? refinados[0] : null;
}

/** Aceita "3563862", 3563862 ou a URL da pagina (.../algo-3563862). */
export function extractRetailerId(raw: string | number | null | undefined): string | null {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    if (!s) return null;

    // ID puro
    if (/^\d{4,}$/.test(s)) return s;

    // Slug/URL da Altimus termina no retailer_id: .../bmw-z4-...-2014-2015-3563862
    const tail = s.match(/(\d{4,})(?:[/?#].*)?$/);
    if (tail) return tail[1];

    return null;
}

/** Busca no feed vivo pelo retailer_id. Null se Altimus caiu ou o carro saiu do estoque. */
export async function findVehicleByRetailerId(retailerId: string): Promise<AltimusVehicle | null> {
    const id = extractRetailerId(retailerId);
    if (!id) return null;
    const inventory = await getInventory();
    return inventory.find(v => v.id_externo && String(v.id_externo) === id) || null;
}

/**
 * Descobre o retailer_id pra usar em content_ids.
 *
 * Ordem de confianca:
 *   1. vehicleId explicito do caller — ele JA e o retailer_id, so enriquecemos
 *      preco/nome com o feed quando o carro ainda esta no estoque.
 *   2. texto livre (vehicle_interest tipo "BMW X6") — match ESTRITO no feed
 *      (marca + modelo, vencedor unico). Ambiguo ou fraco = null.
 *   3. nada → null (evento sai sem content_ids, de proposito).
 */
export async function resolveCatalogVehicle(input: {
    vehicleId?: string | number | null;
    vehicleInterest?: string | null;
}): Promise<ResolvedCatalogVehicle | null> {
    const explicitId = extractRetailerId(input.vehicleId);

    if (explicitId) {
        const live = await findVehicleByRetailerId(explicitId);
        return {
            retailerId: explicitId,
            price: live?.preco ?? null,
            name: live ? vehicleLabel(live) : '',
            matchedBy: 'explicit_id',
            inLiveFeed: Boolean(live),
        };
    }

    if (input.vehicleInterest) {
        const inventory = await getInventory();
        const match = strictMatch(input.vehicleInterest, inventory);
        // Sem id_externo nao ha retailer_id provavel — aborta em vez de chutar.
        if (match?.id_externo) {
            return {
                retailerId: String(match.id_externo),
                price: match.preco ?? null,
                name: vehicleLabel(match),
                matchedBy: 'interest_match',
                inLiveFeed: true,
            };
        }
    }

    return null;
}
