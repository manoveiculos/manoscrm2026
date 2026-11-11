// src/lib/identificacao/nome.ts — reconhece o NOME do cliente na conversa (PURO)
//
// Pedido do Alexandre (06/11/2026): quando o CRM descobrir o nome do cliente,
// corrigir sozinho o lead ("Lead WhatsApp", nome errado). Especificação:
// docs/growth360/nome-e-interesse-automaticos.md (na pasta do Growth 360).
//
// Duas formas de achar o nome:
//   1. FRASE do cliente: "meu nome é…", "me chamo…", "sou o/a…", "aqui é o/a…",
//      "pode me chamar de…", "é o/a…" (no começo da mensagem).
//   2. RESPOSTA ao pedido de nome: a mensagem anterior da loja (Laura do n8n,
//      Laura do CRM ou vendedor) pediu o nome, e o 1º trecho da resposta é um nome.
// Calibrado com respostas reais da memória do n8n (06/11): "Bom dia\nGlauci",
// "Cleide\nOnde fica a loja", "Prof. Jayme da Costa Filho.", "Me chamo Talyson"…

/** Origem do nome, da mais forte para a mais fraca (mesma ordem do banco). */
export type OrigemNome = 'manual' | 'cliente_disse' | 'formulario' | 'perfil_whatsapp' | 'generico';

export const PRIORIDADE_NOME: Record<OrigemNome, number> = {
    manual: 1, cliente_disse: 2, formulario: 3, perfil_whatsapp: 4, generico: 5,
};

export interface NomeAchado {
    nome: string;
    regra: 'frase' | 'resposta_ao_pedido';
    /** Trecho da mensagem que justifica (vai para o histórico). */
    trecho: string;
}

const norm = (s: string | null | undefined) =>
    (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'del']);
const TITULOS = /^(prof|professor|professora|dr|dra|doutor|doutora|sr|sra|srta|senhor|senhora|pastor|pastora|eng|me)\.?$/i;

// Palavras que nunca são nome: saudação, resposta curta, pergunta, verbo comum,
// termo de loja de carro. Comparação sem acento e em minúsculo.
const NAO_E_NOME = new Set([
    'oi', 'oie', 'oii', 'oiee', 'ola', 'opa', 'eae', 'eai', 'e ai', 'salve', 'hey', 'alo',
    'bom', 'boa', 'dia', 'tarde', 'noite', 'tudo', 'bem', 'beleza', 'blz', 'ok', 'okay', 'certo', 'claro',
    'sim', 'nao', 'talvez', 'obrigado', 'obrigada', 'obg', 'valeu', 'vlw', 'show', 'top', 'legal', 'perfeito', 'otimo',
    'qual', 'quais', 'quanto', 'quanta', 'quantos', 'onde', 'como', 'quando', 'que', 'quem', 'porque', 'pq', 'qto',
    'quero', 'queria', 'gostaria', 'tenho', 'tem', 'temos', 'vi', 'vou', 'estou', 'to', 'tou', 'sou', 'era', 'seria',
    'ser', 'saber', 'ver', 'olhar', 'pode', 'posso', 'podia', 'preciso', 'procuro', 'procurando', 'interessado',
    'interessada', 'interesse', 'ainda', 'mais', 'menos', 'muito', 'pouco', 'aqui', 'ai', 'la', 'isso', 'esse', 'essa',
    'este', 'esta', 'ele', 'ela', 'eu', 'voce', 'vc', 'vcs', 'nos', 'meu', 'minha', 'seu', 'sua', 'mesmo', 'mesma',
    'preco', 'valor', 'carro', 'carros', 'moto', 'veiculo', 'financiamento', 'financiar', 'entrada', 'parcela',
    'parcelas', 'troca', 'vista', 'loja', 'anuncio', 'informacao', 'informacoes', 'info', 'disponivel', 'cliente',
    'lead', 'whatsapp', 'zap', 'teste', 'contato', 'atendimento', 'vendedor', 'consultor', 'dono', 'proprietario',
    'gerente', 'pai', 'mae', 'filho', 'filha', 'esposa', 'marido', 'amigo', 'amiga', 'sobrinho', 'sobrinha',
    'completo', 'usado', 'novo', 'seminovo', 'automatico', 'manual', 'flex', 'diesel', 'cidade', 'rua', 'centro',
    'kkk', 'kkkk', 'rs', 'haha', 'hehe', 'favor', 'por', 'pra', 'para', 'com', 'sem', 'um', 'uma', 'o', 'a', 'os', 'as',
]);

// Marcas e modelos: nome de carro nunca vira nome de cliente ("Onix", "Compass").
export const MARCAS = [
    'chevrolet', 'gm', 'volkswagen', 'vw', 'fiat', 'ford', 'renault', 'toyota', 'honda', 'hyundai', 'nissan', 'jeep',
    'peugeot', 'citroen', 'mitsubishi', 'kia', 'bmw', 'mercedes', 'audi', 'volvo', 'byd', 'caoa', 'chery', 'jac',
    'land rover', 'ram', 'dodge', 'suzuki', 'subaru', 'porsche', 'mini', 'gwm', 'haval', 'yamaha', 'kawasaki', 'dafra',
];
export const MODELOS = [
    'onix', 'prisma', 'cruze', 'tracker', 'spin', 's10', 'montana', 'celta', 'corsa', 'agile', 'cobalt', 'equinox',
    'trailblazer', 'astra', 'vectra', 'classic', 'gol', 'voyage', 'polo', 'virtus', 't-cross', 'tcross', 'nivus',
    'taos', 'saveiro', 'amarok', 'fox', 'up', 'jetta', 'tiguan', 'golf', 'crossfox', 'spacefox', 'uno', 'palio',
    'siena', 'strada', 'toro', 'mobi', 'argo', 'cronos', 'pulse', 'fastback', 'fiorino', 'ducato', 'idea', 'punto',
    'grand siena', 'ka', 'fiesta', 'focus', 'ecosport', 'ranger', 'territory', 'maverick', 'fusion', 'sandero',
    'logan', 'duster', 'kwid', 'oroch', 'captur', 'stepway', 'clio', 'corolla', 'hilux', 'yaris', 'etios', 'sw4',
    'rav4', 'civic', 'city', 'fit', 'hr-v', 'hrv', 'wr-v', 'wrv', 'cr-v', 'crv', 'hb20', 'hb20s', 'creta', 'tucson',
    'ix35', 'azera', 'kicks', 'versa', 'march', 'sentra', 'frontier', 'livina', 'compass', 'renegade', 'commander',
    'wrangler', '208', '2008', '3008', 'c3', 'c4', 'aircross', 'l200', 'outlander', 'asx', 'pajero', 'eclipse',
    'sportage', 'cerato', 'picanto', 'soul', 'sorento', 'dolphin', 'seal', 'song', 'yuan', 'tiggo', 'arrizo', 'x1',
    'x3', 'x5', 'z4', 'a3', 'a4', 'q3', 'q5', 'ex30', 'xc40', 'xc60', 'jimny', 'vitara', 'biz', 'cg', 'titan', 'fan',
    'fazer', 'xre', 'pcx', 'nmax', 'factor', 'bros', 'lander', 'cb', 'mt-03', 'xj6',
];
const CARROS = new Set([...MARCAS, ...MODELOS].map(norm));

const EMOJI = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}]/gu;
const SAUDACAO_INICIO = /^(?:(?:oi+e*|ol[aá]|opa|e\s*a[ií]|eae|salve|hey|al[oô]|bom\s+dia|boa\s+tarde|boa\s+noite|tudo\s+bem|td\s+bem|blz|beleza)[\s,!.;:-]*)+/i;

/** Tira emoji, título ("Prof."), pontuação nas pontas e espaços repetidos. */
function limparTrecho(s: string): string {
    return s.replace(EMOJI, ' ')
        .replace(/[“”"'`´]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[\s,.;:!?\-–—]+|[\s,.;:!?\-–—]+$/g, '')
        .trim();
}

/** "maicon DE oliveira" → "Maicon de Oliveira". */
export function capitalizarNome(s: string): string {
    return s.split(' ').filter(Boolean).map((p, i) => {
        const m = p.toLowerCase();
        if (i > 0 && PARTICULAS.has(norm(m))) return m;
        return m.split('-').map(x => x.charAt(0).toUpperCase() + x.slice(1)).join('-');
    }).join(' ');
}

/**
 * O texto (já sem saudação) é um nome de pessoa? Devolve o nome limpo ou null.
 * Regras: só letras; até 3 palavras significativas (fora de/da/do…), no máximo 5
 * no total; nenhuma palavra de saudação, pergunta, verbo comum ou nome de carro.
 */
export function validarNome(bruto: string | null | undefined): string | null {
    let s = limparTrecho(bruto || '');
    if (!s || /[\d?@#/\\:]/.test(s) || /https?|www\./i.test(s)) return null;
    let palavras = s.split(' ');
    while (palavras.length && TITULOS.test(palavras[0])) palavras = palavras.slice(1);
    if (!palavras.length) return null;
    if (!palavras.every(p => /^[\p{L}][\p{L}'-]*$/u.test(p))) return null;
    const significativas = palavras.filter(p => !PARTICULAS.has(norm(p)));
    if (!significativas.length || significativas.length > 3 || palavras.length > 5) return null;
    if (significativas.some(p => norm(p).length < 2)) return null;
    if (palavras.some(p => NAO_E_NOME.has(norm(p)) || CARROS.has(norm(p)))) return null;
    s = capitalizarNome(palavras.join(' '));
    return s.length <= 60 ? s : null;
}

const LUGARES = new Set(['sao', 'santa', 'santo', 'rio', 'porto', 'balneario', 'jaragua', 'blumenau', 'joinville', 'itajai', 'curitiba',
    'florianopolis', 'brusque', 'gaspar', 'indaial', 'timbo', 'pomerode', 'ibirama', 'lontras', 'camboriu', 'sul', 'norte', 'centro']);

/** Nome com 2+ palavras que não parece cidade (usado quando o nome vem na 2ª linha da mensagem). */
function nomeCompletoSemLugar(nome: string): boolean {
    const p = nome.split(' ').filter(x => !PARTICULAS.has(norm(x)));
    return p.length >= 2 && !p.some(x => LUGARES.has(norm(x)));
}

/** A mensagem da loja pediu o nome do cliente? */
export function pediuNome(textoDaLoja: string | null | undefined): boolean {
    const t = norm(textoDaLoja);
    return /(qual (e |eh )?(o )?(seu|teu) nome|seu nome[,!?]|seu nome (por favor|pra|para)|com quem (eu )?(falo|estou falando|to falando|tenho o prazer)|como (voce|vc|o senhor|a senhora) se chama|como (posso|devo) (te|lhe) chamar|me (diz|fala|informa|conta|passa) (o )?seu nome|me conta seu nome|pode me dizer seu nome)/.test(t);
}

// Frase com o nome. Grupo 1 = o que vem depois da expressão.
const FRASES: RegExp[] = [
    /\bmeu\s+nome\s+(?:[eé]|eh)\s+(?:o\s+|a\s+)?(.+)/i,
    /\bme\s+chamo\s+(.+)/i,
    /\bpode\s+me\s+chamar\s+de\s+(.+)/i,
    /\baqui\s+(?:[eé]|eh|quem\s+fala\s+[eé])\s+(?:o|a)\s+(.+)/i,
    /\bquem\s+fala\s+(?:[eé]\s+)?(?:o|a)\s+(.+)/i,
    /(?:^|[\s,.!])sou\s+(?:o|a)\s+(.+)/i,
];
// "é a Marta" só no começo da mensagem (depois da saudação): "é a mesma coisa" não é nome.
const E_O_A_INICIO = /^(?:[eé]|eh)\s+(?:o|a)\s+(.+)/i;

/** Corta o que vem depois do nome: vírgula, ponto, "e", "de <cidade>"… e testa 3, 2 e 1 palavras. */
function nomeNoComecoDe(resto: string): string | null {
    const ate = resto.split(/[,.;!?\n]| e | aqui | de (?=[A-ZÁÉÍÓÚ][a-záéíóú]+\b(?!\s+(?:da|de|do|dos|das)\b))/)[0] || '';
    const palavras = limparTrecho(ate).split(' ').filter(Boolean).slice(0, 5);
    for (let n = Math.min(palavras.length, 5); n >= 1; n--) {
        const v = validarNome(palavras.slice(0, n).join(' '));
        if (v) return v;
    }
    return null;
}

/**
 * Procura o nome numa mensagem do cliente.
 * @param texto            mensagem do cliente (texto ou transcrição de áudio)
 * @param ultimaDaLoja     última mensagem da loja ANTES desta (Laura do n8n, Laura do CRM ou vendedor)
 */
export function extrairNome(texto: string | null | undefined, ultimaDaLoja?: string | null): NomeAchado | null {
    const bruto = (texto || '').trim();
    if (!bruto || bruto.length > 600) return null;

    // 1. Frase explícita, em qualquer linha.
    for (const linha of bruto.split(/\n+/).slice(0, 6)) {
        const semSaudacao = limparTrecho(linha.replace(EMOJI, ' ')).replace(SAUDACAO_INICIO, '');
        for (const rx of [...FRASES, E_O_A_INICIO]) {
            const alvo = rx === E_O_A_INICIO ? semSaudacao : linha;
            const m = alvo.match(rx);
            if (!m) continue;
            const nome = nomeNoComecoDe(m[1]);
            if (nome) return { nome, regra: 'frase', trecho: limparTrecho(linha).slice(0, 160) };
        }
    }

    // 2. Resposta curta ao pedido de nome: o 1º trecho com conteúdo tem de ser o nome.
    if (!pediuNome(ultimaDaLoja)) return null;
    // "Prof. Jayme…": o ponto do título não fecha a frase
    const semTitulo = bruto.replace(/(^|\n)\s*(prof|profa|dr|dra|sr|sra|srta|eng)\.\s+/gi, '$1');
    const trechos = semTitulo.split(/\n+|(?<=[.!?])\s+/).map(t => limparTrecho(t.replace(EMOJI, ' ')).replace(SAUDACAO_INICIO, '').trim());
    let primeiro = true;
    for (const t of trechos.slice(0, 4)) {
        if (!t) continue; // trecho que era só saudação/emoji
        const nome = validarNome(t);
        if (nome && (primeiro || nomeCompletoSemLugar(nome))) return { nome, regra: 'resposta_ao_pedido', trecho: t.slice(0, 160) };
        // 1ª linha que não é nome ("Gostaria de financiar um carrinho"): o nome pode vir na linha seguinte,
        // mas só se for nome COMPLETO (2+ palavras e que não seja cidade): "São Paulo" ou "Rio do Sul" não valem.
        if (primeiro && nome === null && t.split(' ').length <= 12 && !t.includes('?')) { primeiro = false; continue; }
        return null;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Nome do perfil do WhatsApp (pushName): só provisório
// ---------------------------------------------------------------------------

const EMPRESA = /\b(auto|autos|automoveis|veiculos|motors?|multimarcas|comercio|ltda|eireli|mei|loja|store|oficina|mecanica|transportes?|construtora|imoveis|seguros|estetica|studio|boutique|materiais|distribuidora|agro|agropecuaria|restaurante|lanchonete|pizzaria|academia|clinica|consultoria|servicos|solucoes|tech|grupo|cia|company|shop|garagem|despachante|financeira|banco|cred|promotora)\b/i;

/**
 * Nome do perfil do WhatsApp que pode entrar como provisório. Recusa vazio, só
 * emoji, número e nome de empresa. Aceita apelido ("Papai ❤️" → "Papai").
 */
export function nomeDoPerfilAceito(pushName: string | null | undefined): string | null {
    const s = limparTrecho((pushName || '').replace(EMOJI, ' '));
    if (!s || /\d/.test(s) || EMPRESA.test(norm(s))) return null;
    const palavras = s.split(' ').filter(Boolean);
    if (palavras.length > 4 || !palavras.every(p => /^[\p{L}][\p{L}'.-]*$/u.test(p))) return null;
    if (palavras.some(p => CARROS.has(norm(p)))) return null;
    const nome = capitalizarNome(palavras.join(' '));
    return nome.length >= 2 ? nome : null;
}

/** "Lead WhatsApp", "Lead W.", "Analisar Perfil", só telefone ou vazio. */
export function nomeGenerico(nome: string | null | undefined): boolean {
    const t = norm(nome);
    if (!t || t === '---') return true;
    if ((t.match(/\d/g) || []).length >= 6) return true;
    if (!/[a-z]{2}/.test(t)) return true;
    return /^(lead\b|analisar perfil|novo lead|sem nome|cliente\b|contato\b|desconhecid|whats ?app|teste$)/.test(t);
}

export function mesmoNome(a: string | null | undefined, b: string | null | undefined): boolean {
    const x = norm(a).replace(/\s+/g, ' '), y = norm(b).replace(/\s+/g, ' ');
    return !!x && x === y;
}

/**
 * O nome novo pode substituir o atual? (A função do banco aplica a mesma regra;
 * esta é a versão em código para os testes e para a ferramenta da Laura.)
 */
export function podeTrocarNome(p: {
    atual: string | null; origemAtual: OrigemNome; novo: string; origemNova: OrigemNome;
}): { troca: boolean; motivo: string } {
    if (mesmoNome(p.atual, p.novo)) return { troca: false, motivo: 'mesmo nome' };
    if (p.origemAtual === 'manual') return { troca: false, motivo: 'editado por consultor' };
    // mesma pessoa e nome mais curto: não troca "Maria Silva" por "Maria"
    const pa = norm(p.atual).split(/\s+/), pn = norm(p.novo).split(/\s+/);
    if (p.origemAtual !== 'generico' && pa[0] === pn[0] && pn.length < pa.length) return { troca: false, motivo: 'nome atual mais completo' };
    if (PRIORIDADE_NOME[p.origemNova] < PRIORIDADE_NOME[p.origemAtual]) return { troca: true, motivo: 'origem mais forte' };
    if (p.origemNova === 'cliente_disse' && p.origemAtual === 'cliente_disse') return { troca: true, motivo: 'cliente se corrigiu' };
    return { troca: false, motivo: 'origem mais fraca' };
}
