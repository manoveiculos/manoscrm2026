/**
 * altimusInventory — fonte da verdade do estoque pra IA não alucinar.
 *
 * Lê o feed XML público da Altimus e expõe:
 *   - getInventory()           → lista normalizada
 *   - findMatch(interest)      → tenta achar veículo com base no vehicle_interest do lead
 *   - getRecentForPrompt(n)    → top N pra injetar no prompt do LLM
 *
 * Comportamento defensivo:
 *   - Cache in-memory 30min (evita martelar Altimus em rajadas de cron)
 *   - Timeout 8s no fetch
 *   - Se Altimus cair, retorna lista vazia — caller decide fallback (genérico)
 *   - Se XML mudar formato, parser ignora silenciosamente (mantém vida)
 */

const ALTIMUS_URL = process.env.ALTIMUS_XML_URL ||
    'https://estoque.altimus.com.br/api/estoquexml?estoque=997c9e91-40d7-4bec-95cb-68e18a2668a3';

const CACHE_TTL_MS = 30 * 60 * 1000; // 30min

export interface AltimusVehicle {
    marca: string;
    modelo: string;
    versao?: string;
    ano: number | null;
    anoFabricacao?: number | null;
    preco: number | null;
    km?: number | null;
    cambio?: string;
    combustivel?: string;
    cor?: string;
    link?: string;
}

interface CacheEntry {
    vehicles: AltimusVehicle[];
    fetchedAt: number;
    error?: string;
}

let cache: CacheEntry | null = null;
let inflightFetch: Promise<AltimusVehicle[]> | null = null;

/* ----------------------------- PARSING ---------------------------- */

function decodeXmlEntities(s: string): string {
    return s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Extrai 1ª ocorrência de <tag>...</tag> dentro de um bloco. */
function tag(block: string, name: string): string | null {
    const re = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i');
    const m = block.match(re);
    if (!m) return null;
    let content = m[1].trim();
    // Remove CDATA se presente
    const cdata = content.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
    if (cdata) content = cdata[1];
    return decodeXmlEntities(content).trim();
}

function asNumber(s: string | null): number | null {
    if (!s) return null;
    // Aceita "67.900,00" / "67900" / "67900.50"
    const cleaned = s.replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function asInt(s: string | null): number | null {
    if (!s) return null;
    const m = s.match(/\d+/);
    if (!m) return null;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : null;
}

/**
 * Parse defensivo: aceita variações de tag (anuncio, veiculo, item, etc.)
 * e variantes de nome de campo. Se nada bater, retorna [].
 */
function parseAltimusXml(xml: string): AltimusVehicle[] {
    if (!xml || xml.length < 50) return [];

    // Tenta detectar bloco do veículo. Altimus geralmente usa <veiculo>...
    // mas alguns feeds usam <anuncio> ou <ad>.
    const blockNames = ['veiculo', 'veículo', 'anuncio', 'anúncio', 'ad', 'item'];
    let blocks: string[] = [];
    for (const name of blockNames) {
        const re = new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}>`, 'gi');
        const found = xml.match(re);
        if (found && found.length > 0) {
            blocks = found;
            break;
        }
    }
    if (blocks.length === 0) return [];

    const out: AltimusVehicle[] = [];
    for (const block of blocks) {
        const marca = tag(block, 'marca') || tag(block, 'fabricante') || '';
        const modelo = tag(block, 'modelo') || tag(block, 'nome') || '';
        if (!marca && !modelo) continue;

        const versao = tag(block, 'versao') || tag(block, 'versão') || undefined;
        const anoStr = tag(block, 'ano') || tag(block, 'anoModelo');
        const anoFabStr = tag(block, 'anoFabricacao') || tag(block, 'ano_fabricacao');
        const preco = asNumber(tag(block, 'preco') || tag(block, 'preço') || tag(block, 'valor'));
        const km = asInt(tag(block, 'km') || tag(block, 'quilometragem'));
        const cambio = tag(block, 'cambio') || tag(block, 'câmbio') || undefined;
        const combustivel = tag(block, 'combustivel') || tag(block, 'combustível') || undefined;
        const cor = tag(block, 'cor') || undefined;
        const link = tag(block, 'link') || tag(block, 'url') || undefined;

        out.push({
            marca: marca.trim(),
            modelo: modelo.trim(),
            versao: versao || undefined,
            ano: asInt(anoStr) || null,
            anoFabricacao: asInt(anoFabStr) || null,
            preco,
            km: km || null,
            cambio: cambio || undefined,
            combustivel: combustivel || undefined,
            cor: cor || undefined,
            link: link || undefined,
        });
    }
    return out;
}

/* ----------------------------- FETCH ----------------------------- */

async function fetchAltimus(): Promise<AltimusVehicle[]> {
    try {
        const res = await fetch(ALTIMUS_URL, {
            signal: AbortSignal.timeout(8000),
            headers: { 'Accept': 'application/xml, text/xml, */*' },
        });
        if (!res.ok) {
            console.warn(`[altimus] HTTP ${res.status} no fetch — usando lista vazia`);
            return [];
        }
        const xml = await res.text();
        const vehicles = parseAltimusXml(xml);
        if (vehicles.length === 0) {
            console.warn(`[altimus] Parse retornou 0 veículos. XML head: ${xml.slice(0, 200)}`);
        }
        return vehicles;
    } catch (e: any) {
        console.warn('[altimus] fetch falhou:', e?.message || e);
        return [];
    }
}

/**
 * Cache layer com proteção contra concurrent fetches.
 */
export async function getInventory(forceRefresh = false): Promise<AltimusVehicle[]> {
    const now = Date.now();
    if (!forceRefresh && cache && now - cache.fetchedAt < CACHE_TTL_MS) {
        return cache.vehicles;
    }
    if (inflightFetch) return inflightFetch;
    inflightFetch = fetchAltimus().then(vehicles => {
        cache = { vehicles, fetchedAt: now };
        inflightFetch = null;
        return vehicles;
    }).catch(() => {
        inflightFetch = null;
        return [];
    });
    return inflightFetch;
}

/* ----------------------------- MATCH ----------------------------- */

const STOPWORDS = new Set([
    'um', 'uma', 'o', 'a', 'os', 'as', 'de', 'da', 'do', 'e', 'ou',
    'qualquer', 'algum', 'meu', 'meus', 'pra', 'para', 'por', 'com',
    'novo', 'usado', 'seminovo', 'carro', 'veiculo', 'veículo', 'auto',
]);

function tokenize(s: string): string[] {
    return (s || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

function scoreMatch(v: AltimusVehicle, tokens: string[]): number {
    if (tokens.length === 0) return 0;
    const haystack = `${v.marca} ${v.modelo} ${v.versao || ''}`.toLowerCase();
    let s = 0;
    for (const t of tokens) {
        if (haystack.includes(t)) s += 2;
    }
    if (v.ano) s += Math.max(0, (v.ano - 2015) / 10);
    return s;
}

/**
 * Tenta achar o veículo ATUAL no estoque que mais bate com o que o lead disse.
 * Retorna null se Altimus está fora ou se não há match decente (score >= 2).
 */
export async function findMatch(vehicleInterest: string | null | undefined): Promise<AltimusVehicle | null> {
    if (!vehicleInterest) return null;
    const inventory = await getInventory();
    if (inventory.length === 0) return null;
    const tokens = tokenize(vehicleInterest);
    if (tokens.length === 0) return null;
    const ranked = inventory
        .map(v => ({ v, score: scoreMatch(v, tokens) }))
        .filter(x => x.score >= 2)
        .sort((a, b) => b.score - a.score);
    return ranked[0]?.v || null;
}

/**
 * Top N veículos pra injetar no prompt como "estoque disponível".
 * Por enquanto retorna os primeiros N (Altimus já entrega ordenado).
 * Filtra os que têm pelo menos marca + modelo + preço.
 */
export async function getRecentForPrompt(limit = 10): Promise<AltimusVehicle[]> {
    const inventory = await getInventory();
    return inventory
        .filter(v => v.marca && v.modelo && v.preco)
        .slice(0, limit);
}

/**
 * Formata um veículo pra texto curto usável em prompt OU mensagem WhatsApp.
 */
export function formatVehicle(v: AltimusVehicle): string {
    const parts: string[] = [];
    const head = [v.marca, v.modelo, v.versao].filter(Boolean).join(' ').trim();
    if (head) parts.push(head);
    if (v.ano) parts.push(String(v.ano));
    if (v.preco) parts.push(`R$ ${v.preco.toLocaleString('pt-BR')}`);
    if (v.km) parts.push(`${v.km.toLocaleString('pt-BR')}km`);
    return parts.join(' · ');
}

/**
 * Diagnostic helper — usado pelo /admin/health pra ver se Altimus está vivo.
 */
export async function altimusStatus() {
    const inventory = await getInventory();
    return {
        ok: inventory.length > 0,
        count: inventory.length,
        cachedAt: cache?.fetchedAt || null,
        cacheAgeMin: cache ? Math.floor((Date.now() - cache.fetchedAt) / 60000) : null,
        sample: inventory.slice(0, 3).map(formatVehicle),
    };
}
