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

/**
 * Parse de número que detecta formato BR vs US.
 *   BR:  "67.900,00"  → ponto = milhar, vírgula = decimal
 *   US:  "93900.0"    → ponto = decimal (Altimus usa esse)
 *   Bug histórico: replace(/\./g, '') destruía decimal US transformando 93900.0 em 939000.
 */
function asNumber(s: string | null): number | null {
    if (!s) return null;
    const trimmed = s.trim();
    if (!trimmed) return null;

    // Remove tudo que não é dígito, ponto, vírgula ou sinal
    const cleaned = trimmed.replace(/[^\d.,\-]/g, '');
    if (!cleaned) return null;

    const hasComma = cleaned.includes(',');
    const dotCount = (cleaned.match(/\./g) || []).length;

    let normalized: string;
    if (hasComma) {
        // Formato BR: pontos são milhar, vírgula é decimal → remove pontos, vírgula vira ponto
        normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else if (dotCount === 1) {
        // 1 ponto sem vírgula:
        //   "93900.0"   → US decimal (mantém)
        //   "12.500"    → BR sem decimais explícitos (3 dígitos depois) → milhar (multiplica por 1)
        // Heurística: se há 3 dígitos APÓS o ponto, é separador de milhar (formato BR);
        //             senão é decimal US/internacional.
        const afterDot = cleaned.split('.')[1] || '';
        if (afterDot.length === 3 && /^\d+$/.test(afterDot)) {
            normalized = cleaned.replace(/\./g, ''); // BR milhar
        } else {
            normalized = cleaned; // US decimal — mantém o ponto
        }
    } else if (dotCount >= 2) {
        // Múltiplos pontos = separadores de milhar (BR sem vírgula)
        normalized = cleaned.replace(/\./g, '');
    } else {
        normalized = cleaned;
    }

    const n = Number(normalized);
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
 * Parse do feed XML específico da Altimus.
 *
 * Formato real (descoberto inspecionando o feed):
 *   <veiculo>
 *     <marca>28</marca>          ← ID numérico (NÃO É O NOME)
 *     <modelo>2533</modelo>       ← ID numérico
 *     <versao>7631</versao>       ← ID numérico
 *     <valor>219900.0</valor>     ← preço (não <preco>)
 *     <ano>2015</ano>
 *     <descricao>BMW Z4 Roadster sDRIVE 20i 2.0 16V 2p Aut. - Preta - 2014/2015</descricao>
 *     <km>60000</km>
 *     <cor>Preto</cor>
 *     <combustivel>Gasolina</combustivel>
 *   </veiculo>
 *
 * Estratégia: <descricao> é a fonte da verdade do nome do veículo.
 * Formato comum: "MARCA MODELO VERSÃO - COR - ANO_FAB/ANO_MOD"
 */
function parseDescription(desc: string): { marca: string; modelo: string; versao?: string } {
    if (!desc) return { marca: '', modelo: '' };

    // Tira a parte de cor/ano (após o primeiro " - ")
    const mainPart = desc.split(/\s+-\s+/)[0].trim();
    const tokens = mainPart.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return { marca: '', modelo: '' };

    // 1ª palavra = marca; 2ª = modelo (ou primeiras 2 se for marca composta tipo "Land Rover")
    const COMPOUND_BRANDS = ['land', 'mercedes', 'alfa', 'aston'];
    let marcaTokens = 1;
    if (tokens.length >= 2 && COMPOUND_BRANDS.includes(tokens[0].toLowerCase())) {
        marcaTokens = 2;
    }
    const marca = tokens.slice(0, marcaTokens).join(' ');
    const modelo = tokens[marcaTokens] || '';
    const versao = tokens.slice(marcaTokens + 1).join(' ') || undefined;
    return { marca, modelo, versao };
}

function parseAltimusXml(xml: string): AltimusVehicle[] {
    if (!xml || xml.length < 50) return [];

    const blockRe = /<veiculo\b[^>]*>[\s\S]*?<\/veiculo>/gi;
    const blocks = xml.match(blockRe) || [];
    if (blocks.length === 0) return [];

    const out: AltimusVehicle[] = [];
    for (const block of blocks) {
        // Tag <descricao> é a fonte da verdade do nome
        const descricao = tag(block, 'descricao') || '';
        const { marca, modelo, versao } = parseDescription(descricao);

        // Se nem da descrição conseguimos extrair, pula (lead vazio é pior do que sem lead)
        if (!marca || !modelo) continue;

        const anoStr = tag(block, 'ano') || tag(block, 'anoModelo');
        const anoFabStr = tag(block, 'anoFabricacao') || tag(block, 'ano_fabricacao');
        // Altimus usa <valor>, não <preco>
        const preco = asNumber(tag(block, 'valor') || tag(block, 'preco') || tag(block, 'preço'));
        const km = asInt(tag(block, 'km') || tag(block, 'quilometragem'));
        const cambio = tag(block, 'cambio') || tag(block, 'câmbio') || undefined;
        const combustivel = tag(block, 'combustivel') || tag(block, 'combustível') || undefined;
        const cor = tag(block, 'cor') || undefined;
        // Altimus normalmente não traz link no feed, mas mantemos como opcional
        const link = tag(block, 'link') || tag(block, 'url') || undefined;
        // ID interno pra compor link Altimus se quisermos no futuro
        const idInterno = tag(block, 'id');

        out.push({
            marca,
            modelo,
            versao,
            ano: asInt(anoStr) || null,
            anoFabricacao: asInt(anoFabStr) || null,
            preco,
            km: km || null,
            cambio: cambio || undefined,
            combustivel: combustivel || undefined,
            cor: cor || undefined,
            link: link || (idInterno ? `https://manosveiculos.com.br/veiculo/${idInterno}` : undefined),
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
