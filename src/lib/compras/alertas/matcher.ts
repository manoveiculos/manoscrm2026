import { distance } from 'fastest-levenshtein';

/**
 * Motor de correspondência entre um carro que entrou no radar de compras
 * (tabela `repassecentral`) e os alertas cadastrados pelos vendedores
 * (tabela `alertas_clientes`).
 *
 * Regra de ouro: é melhor avisar a mais do que deixar de avisar. O vendedor
 * cadastra correndo, no meio do atendimento, e escreve o que vem na cabeça —
 * "HILLUX", "S-10", "tritton". O motor tem que entender assim mesmo.
 */

export interface AlertaMatch {
    id: string;
    nome_cliente: string;
    telefone_cliente: string;
    marca: string | null;
    modelo: string | null;
    cliente_final?: string | null;
    valor_minimo: number | null;
    valor_maximo: number | null;
    ano_minimo: number | null;
    ano_maximo: number | null;
    km_minimo: number | null;
    km_maximo: number | null;
    cor?: string | null;
    cambio?: string | null;
    combustivel?: string | null;
    criado_por?: string | null;
}

export interface VeiculoMatch {
    id?: string;
    marca?: string | null;
    modelo?: string | null;
    ano_modelo?: string | null;
    km?: number | string | null;
    preco_pedido?: number | string | null;
    preco_fipe?: number | string | null;
    detalhes_mecanica_estetica?: string | null;
    oferta_valida?: boolean | null;
}

export type MotivoRecusa =
    | 'marca'
    | 'modelo'
    | 'preco_minimo'
    | 'preco_maximo'
    | 'ano_minimo'
    | 'ano_maximo'
    | 'km_minimo'
    | 'km_maximo'
    | 'cambio';

export interface ResultadoMatch {
    match: boolean;
    motivo?: MotivoRecusa;
}

/**
 * Marcas reconhecidas. Se o vendedor digitou algo fora desta lista no campo
 * "marca", tratamos como palavra-chave livre e NÃO como filtro eliminatório —
 * é o caso clássico de escrever "TRITON" no campo da marca.
 */
const MARCAS_CONHECIDAS = new Set([
    'chevrolet', 'gm', 'fiat', 'ford', 'honda', 'hyundai', 'jeep', 'renault',
    'toyota', 'volkswagen', 'vw', 'nissan', 'mitsubishi', 'peugeot', 'citroen',
    'kia', 'mercedes', 'mercedes benz', 'bmw', 'audi', 'volvo', 'land rover',
    'ram', 'dodge', 'chery', 'caoa chery', 'byd', 'gwm', 'suzuki', 'subaru',
    'mini', 'porsche', 'jac', 'iveco', 'yamaha', 'troller', 'effa',
    'lifan', 'geely', 'ssangyong', 'chrysler',
]);

/** Sinônimos de marca que aparecem escritos de forma diferente nos grupos. */
const SINONIMOS_MARCA: Record<string, string> = {
    gm: 'chevrolet',
    vw: 'volkswagen',
    'caoa chery': 'chery',
    'mercedes benz': 'mercedes',
};

/** Valores que significam "qualquer marca serve". */
const CURINGAS = new Set([
    '', 'todas', 'todos', 'outros', 'outro', 'multimarcas', 'multimarca',
    'qualquer', 'qualquer marca', 'nao sei', 'na', 'n a', '-',
]);

/** Remove acentos, pontuação e caixa. "Hilux SW4 4x4" -> "hilux sw4 4x4" */
export function normalizar(texto: string | null | undefined): string {
    return (texto || '')
        .toString()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/** Corrige erros de digitação previsíveis antes de comparar. */
function canonico(texto: string): string {
    return normalizar(texto)
        .replace(/([a-z])\1+/g, '$1')   // hillux -> hilux, tritton -> triton
        .replace(/\s+/g, ' ')
        .trim();
}

/** Um termo bate com o texto do anúncio? Aceita erro de 1 letra em palavras longas. */
export function termoBate(termo: string, alvo: string): boolean {
    const t = canonico(termo);
    const a = canonico(alvo);
    if (!t || !a) return false;

    // 1. Substring direta ("hilux" dentro de "hilux cd sr")
    if (a.includes(t)) return true;
    if (t.includes(a) && a.length >= 4) return true;

    // 2. Palavra a palavra, tolerando letra trocada em termos longos
    const palavrasAlvo = a.split(' ').filter(Boolean);
    const palavrasTermo = t.split(' ').filter(Boolean);
    if (palavrasTermo.length === 0 || palavrasAlvo.length === 0) return false;

    return palavrasTermo.every(pt => {
        if (pt.length <= 3) return palavrasAlvo.includes(pt);
        return palavrasAlvo.some(pa => {
            if (pa.includes(pt)) return true;
            // Só aceita o caminho inverso com palavra de peso: senão o "X" de
            // "Etios X" casa com o "x" de "hilux" e o vendedor recebe lixo.
            if (pa.length >= 4 && pt.includes(pa)) return true;
            const tolerancia = pt.length >= 7 ? 2 : 1;
            return distance(pa, pt) <= tolerancia;
        });
    });
}

function numeroOuNulo(valor: unknown): number | null {
    if (valor === null || valor === undefined || valor === '') return null;
    const limpo = typeof valor === 'number'
        ? valor
        : Number(String(valor).replace(/[^\d.,-]/g, '').replace(',', '.'));
    return Number.isFinite(limpo) ? limpo : null;
}

export function extrairAno(anoModelo: string | null | undefined): number | null {
    const m = anoModelo ? String(anoModelo).match(/\d{4}/) : null;
    return m ? parseInt(m[0], 10) : null;
}

/** Decide se o carro que chegou serve para o alerta do vendedor. */
export function avaliarMatch(alerta: AlertaMatch, veiculo: VeiculoMatch): ResultadoMatch {
    const marcaAlertaBruta = normalizar(alerta.marca);
    const marcaVeiculo = normalizar(veiculo.marca);
    const modeloVeiculo = normalizar(veiculo.modelo);
    const textoVeiculo = `${marcaVeiculo} ${modeloVeiculo} ${normalizar(veiculo.detalhes_mecanica_estetica)}`.trim();

    // ── A. Marca ────────────────────────────────────────────────────────────
    // Só vira filtro eliminatório quando o vendedor digitou uma marca de verdade.
    // "TRITON" no campo marca é palavra-chave, não filtro.
    if (!CURINGAS.has(marcaAlertaBruta)) {
        const marcaAlerta = SINONIMOS_MARCA[marcaAlertaBruta] || marcaAlertaBruta;
        const marcaCarro = SINONIMOS_MARCA[marcaVeiculo] || marcaVeiculo;

        if (MARCAS_CONHECIDAS.has(marcaAlerta)) {
            if (!termoBate(marcaAlerta, marcaCarro)) {
                return { match: false, motivo: 'marca' };
            }
        } else if (!termoBate(marcaAlertaBruta, textoVeiculo)) {
            // Não é marca conhecida: tem que aparecer em algum lugar do anúncio
            return { match: false, motivo: 'marca' };
        }
    }

    // ── B. Modelo / palavras-chave (separadas por vírgula) ───────────────────
    const termos = (alerta.modelo || '').split(',').map(t => t.trim()).filter(Boolean);
    if (termos.length > 0 && !termos.some(t => termoBate(t, `${modeloVeiculo} ${marcaVeiculo}`))) {
        return { match: false, motivo: 'modelo' };
    }

    // ── C. Preço ────────────────────────────────────────────────────────────
    const preco = numeroOuNulo(veiculo.preco_pedido);
    if (preco !== null && preco > 0) {
        if (alerta.valor_minimo && preco < Number(alerta.valor_minimo)) return { match: false, motivo: 'preco_minimo' };
        if (alerta.valor_maximo && preco > Number(alerta.valor_maximo)) return { match: false, motivo: 'preco_maximo' };
    }

    // ── D. Ano ──────────────────────────────────────────────────────────────
    const ano = extrairAno(veiculo.ano_modelo);
    if (ano) {
        if (alerta.ano_minimo && ano < Number(alerta.ano_minimo)) return { match: false, motivo: 'ano_minimo' };
        if (alerta.ano_maximo && ano > Number(alerta.ano_maximo)) return { match: false, motivo: 'ano_maximo' };
    }

    // ── E. Quilometragem ────────────────────────────────────────────────────
    const km = numeroOuNulo(veiculo.km);
    if (km !== null && km > 0) {
        if (alerta.km_minimo && km < Number(alerta.km_minimo)) return { match: false, motivo: 'km_minimo' };
        if (alerta.km_maximo && km > Number(alerta.km_maximo)) return { match: false, motivo: 'km_maximo' };
    }

    // ── F. Câmbio ───────────────────────────────────────────────────────────
    if (normalizar(alerta.cambio) === 'automatico') {
        const pareceAuto = /\baut|\bcvt|automatic|tiptronic|dsg/.test(textoVeiculo);
        if (!pareceAuto) return { match: false, motivo: 'cambio' };
    }

    // Cor e combustível ficam fora do corte: o anúncio dos grupos quase nunca
    // traz esses dados e barrar por eles é o caminho mais curto pra perder venda.
    return { match: true };
}
