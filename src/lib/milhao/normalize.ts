/**
 * Normalização de veículos para o módulo Milhão.
 *
 * Dois mundos precisam falar a mesma língua para cruzar oferta × demanda:
 *   1. Estoque do fundo (milhao_veiculos) — marcas vêm sujas: "Fiat ", "CHEVROLET ",
 *      "Volkswagem", "Honda " (espaço no fim, caixa alta, grafia errada).
 *   2. Interesse dos leads (leads_*.interesse / vehicle_interest) — texto livre do
 *      cliente/anúncio: "Hyundai Sonata 2013", "C4 Cactus Shine Pack 2019", "Polo 1.6 MSI",
 *      misturado com lixo genérico ("compra", "Analisar Perfil", "Lead Google").
 *
 * A saída canônica é { brand, model, key } — key = "marca modelo" minúsculo, usado
 * como chave de agrupamento em rankings de demanda e no match com o estoque.
 */

const stripAccents = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export const norm = (s: string | null | undefined) =>
    stripAccents(String(s ?? '')).toLowerCase().replace(/\s+/g, ' ').trim();

// ── Marcas (alias sujo → canônico) ───────────────────────────────────
const BRAND_ALIASES: Record<string, string> = {
    volkswagen: 'Volkswagen', volkswagem: 'Volkswagen', vw: 'Volkswagen', wolks: 'Volkswagen',
    chevrolet: 'Chevrolet', gm: 'Chevrolet', chevrole: 'Chevrolet',
    fiat: 'Fiat', ford: 'Ford', honda: 'Honda', toyota: 'Toyota',
    hyundai: 'Hyundai', hiunday: 'Hyundai', renault: 'Renault', nissan: 'Nissan',
    jeep: 'Jeep', citroen: 'Citroën', peugeot: 'Peugeot', bmw: 'BMW',
    mercedes: 'Mercedes-Benz', audi: 'Audi', kia: 'Kia', mitsubishi: 'Mitsubishi',
    volvo: 'Volvo', chery: 'Chery', caoa: 'Chery', ram: 'RAM', suzuki: 'Suzuki',
    mini: 'Mini', land: 'Land Rover', dodge: 'Dodge', troller: 'Troller',
};

// ── Catálogo de modelos populares (alias → { modelo, marca }) ────────
// Ordem: aliases mais específicos primeiro (match por inclusão, maior alias vence).
interface ModelDef { model: string; brand: string; aliases: string[]; }
const MODELS: ModelDef[] = [
    // Honda
    { model: 'HR-V', brand: 'Honda', aliases: ['hr-v', 'hrv', 'hr v'] },
    { model: 'Civic', brand: 'Honda', aliases: ['civic'] },
    { model: 'Fit', brand: 'Honda', aliases: ['fit'] },
    { model: 'City', brand: 'Honda', aliases: ['city'] },
    { model: 'WR-V', brand: 'Honda', aliases: ['wr-v', 'wrv'] },
    // Hyundai
    { model: 'HB20S', brand: 'Hyundai', aliases: ['hb20s', 'hb20 s', 'hb 20 s'] },
    { model: 'HB20', brand: 'Hyundai', aliases: ['hb20', 'hb 20'] },
    { model: 'Sonata', brand: 'Hyundai', aliases: ['sonata'] },
    { model: 'Creta', brand: 'Hyundai', aliases: ['creta'] },
    { model: 'Tucson', brand: 'Hyundai', aliases: ['tucson'] },
    { model: 'ix35', brand: 'Hyundai', aliases: ['ix35', 'ix 35'] },
    // Chevrolet
    { model: 'Onix Plus', brand: 'Chevrolet', aliases: ['onix plus'] },
    { model: 'Onix', brand: 'Chevrolet', aliases: ['onix'] },
    { model: 'Tracker', brand: 'Chevrolet', aliases: ['tracker'] },
    { model: 'Cruze', brand: 'Chevrolet', aliases: ['cruze'] },
    { model: 'S10', brand: 'Chevrolet', aliases: ['s10', 's-10', 's 10'] },
    { model: 'Spin', brand: 'Chevrolet', aliases: ['spin'] },
    { model: 'Cobalt', brand: 'Chevrolet', aliases: ['cobalt'] },
    { model: 'Prisma', brand: 'Chevrolet', aliases: ['prisma'] },
    { model: 'Montana', brand: 'Chevrolet', aliases: ['montana'] },
    { model: 'Celta', brand: 'Chevrolet', aliases: ['celta'] },
    { model: 'Astra', brand: 'Chevrolet', aliases: ['astra'] },
    { model: 'Vectra', brand: 'Chevrolet', aliases: ['vectra'] },
    { model: 'Corsa', brand: 'Chevrolet', aliases: ['corsa'] },
    { model: 'Meriva', brand: 'Chevrolet', aliases: ['meriva'] },
    { model: 'Classic', brand: 'Chevrolet', aliases: ['classic'] },
    { model: 'Equinox', brand: 'Chevrolet', aliases: ['equinox'] },
    // Volkswagen
    { model: 'Polo', brand: 'Volkswagen', aliases: ['polo'] },
    { model: 'Gol', brand: 'Volkswagen', aliases: ['gol'] },
    { model: 'Golf', brand: 'Volkswagen', aliases: ['golf'] },
    { model: 'T-Cross', brand: 'Volkswagen', aliases: ['t-cross', 't cross', 'tcross'] },
    { model: 'Nivus', brand: 'Volkswagen', aliases: ['nivus'] },
    { model: 'Virtus', brand: 'Volkswagen', aliases: ['virtus'] },
    { model: 'Jetta', brand: 'Volkswagen', aliases: ['jetta'] },
    { model: 'Saveiro', brand: 'Volkswagen', aliases: ['saveiro'] },
    { model: 'Voyage', brand: 'Volkswagen', aliases: ['voyage'] },
    { model: 'Fox', brand: 'Volkswagen', aliases: ['fox'] },
    { model: 'Up', brand: 'Volkswagen', aliases: ['up!', 'up '] },
    { model: 'Amarok', brand: 'Volkswagen', aliases: ['amarok'] },
    { model: 'Tiguan', brand: 'Volkswagen', aliases: ['tiguan'] },
    { model: 'Fusca', brand: 'Volkswagen', aliases: ['fusca'] },
    { model: 'Passat', brand: 'Volkswagen', aliases: ['passat'] },
    { model: 'Kombi', brand: 'Volkswagen', aliases: ['kombi'] },
    { model: 'Bora', brand: 'Volkswagen', aliases: ['bora'] },
    // Fiat
    { model: 'Argo', brand: 'Fiat', aliases: ['argo'] },
    { model: 'Toro', brand: 'Fiat', aliases: ['toro'] },
    { model: 'Mobi', brand: 'Fiat', aliases: ['mobi'] },
    { model: 'Cronos', brand: 'Fiat', aliases: ['cronos'] },
    { model: 'Pulse', brand: 'Fiat', aliases: ['pulse'] },
    { model: 'Strada', brand: 'Fiat', aliases: ['strada'] },
    { model: 'Uno', brand: 'Fiat', aliases: ['uno'] },
    { model: 'Palio', brand: 'Fiat', aliases: ['palio'] },
    { model: 'Punto', brand: 'Fiat', aliases: ['punto'] },
    { model: 'Fastback', brand: 'Fiat', aliases: ['fastback'] },
    { model: 'Siena', brand: 'Fiat', aliases: ['siena'] },
    { model: 'Idea', brand: 'Fiat', aliases: ['idea'] },
    { model: 'Linea', brand: 'Fiat', aliases: ['linea'] },
    { model: 'Doblo', brand: 'Fiat', aliases: ['doblo'] },
    { model: 'Palio', brand: 'Fiat', aliases: ['palio weekend'] },
    { model: 'Weekend', brand: 'Fiat', aliases: ['weekend'] },
    { model: '500', brand: 'Fiat', aliases: ['fiat 500'] },
    // Ford
    { model: 'Ka', brand: 'Ford', aliases: ['ka '] },
    { model: 'Fiesta', brand: 'Ford', aliases: ['fiesta'] },
    { model: 'EcoSport', brand: 'Ford', aliases: ['ecosport', 'eco sport'] },
    { model: 'Ranger', brand: 'Ford', aliases: ['ranger'] },
    { model: 'Focus', brand: 'Ford', aliases: ['focus'] },
    { model: 'Fusion', brand: 'Ford', aliases: ['fusion'] },
    { model: 'Territory', brand: 'Ford', aliases: ['territory'] },
    { model: 'Edge', brand: 'Ford', aliases: ['edge'] },
    // Toyota
    { model: 'Corolla Cross', brand: 'Toyota', aliases: ['corolla cross'] },
    { model: 'Corolla', brand: 'Toyota', aliases: ['corolla'] },
    { model: 'Yaris', brand: 'Toyota', aliases: ['yaris'] },
    { model: 'Hilux', brand: 'Toyota', aliases: ['hilux'] },
    { model: 'Etios', brand: 'Toyota', aliases: ['etios'] },
    { model: 'SW4', brand: 'Toyota', aliases: ['sw4', 'sw 4'] },
    // Renault
    { model: 'Kwid', brand: 'Renault', aliases: ['kwid'] },
    { model: 'Kardian', brand: 'Renault', aliases: ['kardian'] },
    { model: 'Sandero', brand: 'Renault', aliases: ['sandero'] },
    { model: 'Duster', brand: 'Renault', aliases: ['duster'] },
    { model: 'Logan', brand: 'Renault', aliases: ['logan'] },
    { model: 'Captur', brand: 'Renault', aliases: ['captur'] },
    { model: 'Oroch', brand: 'Renault', aliases: ['oroch'] },
    { model: 'Clio', brand: 'Renault', aliases: ['clio'] },
    { model: 'Megane', brand: 'Renault', aliases: ['megane'] },
    { model: 'Fluence', brand: 'Renault', aliases: ['fluence'] },
    { model: 'Stepway', brand: 'Renault', aliases: ['stepway'] },
    // Nissan
    { model: 'Kicks', brand: 'Nissan', aliases: ['kicks'] },
    { model: 'Versa', brand: 'Nissan', aliases: ['versa'] },
    { model: 'Frontier', brand: 'Nissan', aliases: ['frontier'] },
    { model: 'March', brand: 'Nissan', aliases: ['march'] },
    // Jeep
    { model: 'Renegade', brand: 'Jeep', aliases: ['renegade'] },
    { model: 'Compass', brand: 'Jeep', aliases: ['compass'] },
    { model: 'Commander', brand: 'Jeep', aliases: ['commander'] },
    // Citroën
    { model: 'C4 Cactus', brand: 'Citroën', aliases: ['c4 cactus', 'cactus'] },
    { model: 'C3', brand: 'Citroën', aliases: ['c3'] },
    { model: 'Aircross', brand: 'Citroën', aliases: ['aircross'] },
    // Peugeot
    { model: '208', brand: 'Peugeot', aliases: ['208'] },
    { model: '2008', brand: 'Peugeot', aliases: ['2008'] },
    { model: '3008', brand: 'Peugeot', aliases: ['3008'] },
    // Outros comuns
    { model: 'Mustang', brand: 'Ford', aliases: ['mustang'] },
    { model: 'Corolla', brand: 'Toyota', aliases: ['corola'] },
];

// Frases genéricas / lixo que NÃO representam um modelo procurável.
const JUNK = new Set([
    'analisar perfil', 'lead google - nao especificado', 'lead google nao especificado',
    'compra', 'comprar um carro', 'comprar_um_carro', 'comprar carro',
    'troca', 'trocar meu carro', 'duvida', 'duvidas', 'financiamento', 'consorcio',
    'ainda nao decidi, quero ver o estoque', 'ainda nao decidi quero ver o estoque',
    'sedan (conforto e familia)', 'sedan conforto e familia', 'nao especificado',
    'outro', 'outros', 'sedan', 'suv', 'hatch', 'picape', 'carro', 'veiculo',
    'primeiro carro', 'nao sei', 'qualquer', 'venda', 'vender', 'orcamento',
]);

export interface CanonVehicle {
    brand: string | null;
    model: string | null;
    key: string;        // chave de agrupamento ("honda hr-v"); '' quando irreconhecível
    label: string;      // exibição ("Honda HR-V")
}

function longestAliasFirst(a: string, b: string) { return b.length - a.length; }

/**
 * Normaliza um texto livre de interesse em um veículo canônico.
 * Retorna key='' quando é lixo/genérico (não deve entrar no ranking de demanda).
 */
export function canonVehicle(raw: string | null | undefined): CanonVehicle {
    const n = norm(raw);
    if (!n || JUNK.has(n)) return { brand: null, model: null, key: '', label: '' };

    // 1) Match direto no catálogo de modelos (alias mais longo vence).
    let best: ModelDef | null = null;
    let bestAlias = '';
    for (const def of MODELS) {
        for (const a of def.aliases) {
            if (n.includes(a) && a.length > bestAlias.length) { best = def; bestAlias = a; }
        }
    }
    if (best) {
        const brand = best.brand;
        const model = best.model;
        return { brand, model, key: `${norm(brand)} ${norm(model)}`, label: `${brand} ${model}` };
    }

    // 2) Sem modelo no catálogo: se tiver marca conhecida, usa marca + próximo token.
    const tokens = n.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    const brandToken = tokens.find((t) => BRAND_ALIASES[t]);
    if (brandToken) {
        const brand = BRAND_ALIASES[brandToken];
        const idx = tokens.indexOf(brandToken);
        const next = tokens.slice(idx + 1).find((t) => t.length >= 2 && !/^\d+$/.test(t));
        if (next) {
            const model = next.charAt(0).toUpperCase() + next.slice(1);
            return { brand, model, key: `${norm(brand)} ${next}`, label: `${brand} ${model}` };
        }
        // só marca (ex.: "quero uma Honda") — fraco, mas melhor que lixo
        return { brand, model: null, key: norm(brand), label: brand };
    }

    return { brand: null, model: null, key: '', label: '' };
}

/**
 * Normaliza um veículo do fundo (marca/modelo já separados, porém sujos).
 * Sempre retorna uma key utilizável (não passa pelo filtro de lixo).
 */
export function canonFundVehicle(marca?: string | null, modelo?: string | null): CanonVehicle {
    const combined = canonVehicle(`${marca ?? ''} ${modelo ?? ''}`);
    if (combined.key) return combined;
    // Fallback: limpa o que veio do banco mesmo sem estar no catálogo.
    const brandRaw = norm(marca).split(' ')[0];
    const brand = BRAND_ALIASES[brandRaw] || (marca ? String(marca).trim() : null);
    const model = modelo ? String(modelo).trim() : null;
    const key = `${norm(brand)} ${norm(model)}`.trim();
    return { brand, model, key, label: [brand, model].filter(Boolean).join(' ') };
}
