// src/lib/whatsapp/ia/regras.ts — regras da Laura no CRM (etapa B: ensaio)
//
// Funções PURAS (sem banco, rede ou SDK): rodam nos testes
// (npm run test:laura) e no servidor.

import { parseValorBR } from '@/lib/qualificacao';

// ---------------------------------------------------------------------------
// Modo da IA
// ---------------------------------------------------------------------------

export type ModoIa = 'desligada' | 'ensaio' | 'envia';

/**
 * Modo que vale de verdade. Três travas, nesta ordem:
 *  1. WA_IA_ATIVA=true no servidor (desliga tudo sem deploy);
 *  2. o botão do admin (wa_ia_config.modo);
 *  3. "envia" só com WA_IA_ENVIO_LIBERADO=true — bloqueado até a etapa C ser aprovada.
 */
export function modoEfetivo(p: { ativaEnv?: string | null; envioLiberadoEnv?: string | null; modoConfig?: string | null }): { modo: ModoIa; motivo: string | null } {
    if ((p.ativaEnv || '').trim() !== 'true') return { modo: 'desligada', motivo: 'WA_IA_ATIVA não está ligada no servidor' };
    const m = p.modoConfig;
    if (m === 'envia') {
        if ((p.envioLiberadoEnv || '').trim() === 'true') return { modo: 'envia', motivo: null };
        return { modo: 'ensaio', motivo: 'envio ao cliente bloqueado até a etapa C' };
    }
    if (m === 'ensaio') return { modo: 'ensaio', motivo: null };
    return { modo: 'desligada', motivo: 'IA desligada pelo admin' };
}

/**
 * A Laura pode responder nesta conversa? Mesma regra de wa_ia_pode_responder()
 * no banco: conversa com humano só volta para a IA quando o silêncio vence.
 */
export function iaPodeResponder(c: { status: string | null; iaSilenciadaAte: string | null }, agora = new Date()): boolean {
    if (c.status === 'encerrada') return false;
    if (c.status === 'humano') {
        if (!c.iaSilenciadaAte) return false;
        return new Date(c.iaSilenciadaAte).getTime() <= agora.getTime();
    }
    return true;
}

/** Limite diário de rodadas (WA_IA_LIMITE_DIA). Padrão 300; 0 ou inválido = padrão. */
export function limiteDiario(env: string | null | undefined, padrao = 300): number {
    const n = Number((env || '').trim());
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : padrao;
}

/** 00:00 de hoje em Rio do Sul (UTC-3 fixo, mesma premissa do slaEngine), em UTC. */
export function inicioDoDiaSP(agora = new Date()): Date {
    const sp = new Date(agora.getTime() - 3 * 3600_000);
    return new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate(), 3, 0, 0));
}

// ---------------------------------------------------------------------------
// Nome do cliente
// ---------------------------------------------------------------------------

const GENERICOS: RegExp[] = [
    /^lead\b/i,                  // "Lead Google...", "Lead WhatsApp"
    /analisar\s+perfil/i,
    /^novo\s+lead/i,
    /^cliente\b/i,
    /^sem\s+nome/i,
    /^desconhecid/i,
    /^contato\b/i,
    /whats\s*app/i,
    /^teste$/i,
];

const normalizar = (s: string | null | undefined) =>
    (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export function mesmoNome(a: string | null | undefined, b: string | null | undefined): boolean {
    const na = normalizar(a), nb = normalizar(b);
    return !!na && na === nb;
}

/** Nome vazio, genérico, telefone ou o nome do perfil do WhatsApp (provisório). */
export function nomeEhGenerico(nome: string | null | undefined, nomePerfilWhatsapp?: string | null): boolean {
    const n = (nome || '').trim();
    if (!n) return true;
    if ((n.match(/\d/g) || []).length >= 6) return true; // telefone
    if (!/[a-zà-ú]{2}/i.test(n)) return true;
    if (GENERICOS.some(rx => rx.test(n))) return true;
    if (nomePerfilWhatsapp && mesmoNome(n, nomePerfilWhatsapp)) return true;
    return false;
}

const MINUSCULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

/** "  joão  DA silva 😊" → "João da Silva". Devolve null se não parecer nome de pessoa. */
export function limparNome(bruto: string | null | undefined): string | null {
    const s = (bruto || '')
        .replace(/[^\p{L}\s'-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60);
    if (!/\p{L}{2}/u.test(s)) return null;
    const palavras = s.split(' ').slice(0, 5);
    const nome = palavras.map((p, i) => {
        const min = p.toLowerCase();
        if (i > 0 && MINUSCULAS.has(min)) return min;
        return min.charAt(0).toUpperCase() + min.slice(1);
    }).join(' ');
    return nomeEhGenerico(nome) ? null : nome;
}

/**
 * A IA pode gravar o nome no lead? Só se o nome atual estiver vazio/genérico
 * ou se for o mesmo que a própria IA gravou antes. Se um consultor trocou o
 * nome à mão, ele fica (decisão do Alexandre, 06/11).
 */
export function podeGravarNomeNoLead(p: { nomeAtual: string | null | undefined; nomePerfilWhatsapp?: string | null; ultimoNomeDaIa?: string | null }): boolean {
    if (nomeEhGenerico(p.nomeAtual, p.nomePerfilWhatsapp)) return true;
    return !!p.ultimoNomeDaIa && mesmoNome(p.nomeAtual, p.ultimoNomeDaIa);
}

/**
 * Trava contra nome inventado: o primeiro nome tem de aparecer, como palavra,
 * em alguma mensagem do cliente. Sem isso a IA poderia "promover" o nome do
 * perfil do WhatsApp a nome confirmado.
 */
export function nomeDitoPeloCliente(nome: string | null | undefined, textosDoCliente: string[]): boolean {
    const primeiro = normalizar(nome).split(' ')[0];
    if (!primeiro || primeiro.length < 2) return false;
    const rx = new RegExp(`(^|[^a-z])${primeiro.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z])`);
    return textosDoCliente.some(t => rx.test(normalizar(t)));
}

/**
 * Valores em R$ que o próprio cliente citou ("tenho 20 mil de entrada"): o
 * filtro deixa a Laura repetir esses números sem acusar "preço fora do anúncio".
 */
export function valoresCitados(textos: string[]): number[] {
    const out: number[] = [];
    for (const t of textos) {
        const achados = (t || '').match(/r\$\s*[\d.,]+(\s*(mil|k)\b)?|\b\d+([.,]\d+)?\s*(mil|k)\b|\b\d{1,3}(\.\d{3})+(,\d+)?\b|\b\d{4,7}\b/gi) || [];
        for (const a of achados) {
            const v = parseValorBR(a);
            if (v != null && v >= 1000) out.push(v);
        }
    }
    return [...new Set(out)];
}

// ---------------------------------------------------------------------------
// Ficha que a Laura prepara para o consultor
// ---------------------------------------------------------------------------

export type FormaPagamento = 'a_vista' | 'financiado' | 'troca' | 'nao_sabe';

export interface FichaTroca {
    marca?: string | null;
    modelo?: string | null;
    ano?: string | null;
    km?: string | null;
    cor?: string | null;
    estado?: string | null;
}

export interface FichaLaura {
    nome?: string | null;
    cidade?: string | null;
    carro_interesse?: string | null;
    /** id do carro no feed da Altimus, quando confirmado no estoque */
    veiculo_id?: string | null;
    forma_pagamento?: FormaPagamento | null;
    entrada?: string | null;
    tem_troca?: boolean | null;
    troca?: FichaTroca | null;
    prazo?: string | null;
}

export type CampoFicha = 'nome' | 'carro_interesse' | 'forma_pagamento' | 'entrada' | 'troca' | 'prazo' | 'cidade';

const vazio = (v: unknown) => v == null || (typeof v === 'string' && !v.trim());

/** O que falta, na ordem em que a Laura pergunta. */
export function faltandoNaFicha(f: FichaLaura): CampoFicha[] {
    const out: CampoFicha[] = [];
    if (vazio(f.nome)) out.push('nome');
    if (vazio(f.carro_interesse)) out.push('carro_interesse');
    if (vazio(f.forma_pagamento)) out.push('forma_pagamento');
    // à vista não tem entrada
    if (f.forma_pagamento !== 'a_vista' && vazio(f.entrada)) out.push('entrada');
    if (f.tem_troca == null && vazio(f.troca?.modelo)) out.push('troca');
    else if (f.tem_troca === true && (vazio(f.troca?.modelo) || vazio(f.troca?.ano))) out.push('troca');
    if (vazio(f.prazo)) out.push('prazo');
    if (vazio(f.cidade)) out.push('cidade');
    return out;
}

/** Junta o que a IA acabou de anotar com a ficha que já existia (nunca apaga com vazio). */
export function mesclarFicha(atual: FichaLaura, nova: FichaLaura): FichaLaura {
    const out: FichaLaura = { ...atual };
    for (const [k, v] of Object.entries(nova) as [keyof FichaLaura, unknown][]) {
        if (k === 'troca') continue;
        if (!vazio(v)) (out as Record<string, unknown>)[k] = typeof v === 'string' ? v.trim() : v;
    }
    if (nova.troca && typeof nova.troca === 'object') {
        const t: FichaTroca = { ...(atual.troca || {}) };
        for (const [k, v] of Object.entries(nova.troca) as [keyof FichaTroca, unknown][]) {
            if (!vazio(v)) t[k] = String(v).trim();
        }
        out.troca = t;
        if (out.tem_troca == null && !vazio(t.modelo)) out.tem_troca = true;
    }
    return out;
}

export const ROTULO_CAMPO: Record<CampoFicha, string> = {
    nome: 'nome',
    carro_interesse: 'carro de interesse',
    forma_pagamento: 'forma de pagamento (à vista, financiado ou troca)',
    entrada: 'entrada em R$',
    troca: 'carro na troca (marca, modelo, ano, km, cor e estado)',
    prazo: 'prazo de compra',
    cidade: 'cidade',
};

// ---------------------------------------------------------------------------
// Histórico da conversa para o modelo
// ---------------------------------------------------------------------------

export interface MensagemParaIa {
    autor: 'cliente' | 'laura' | 'vendedor' | 'sistema';
    tipo: string;
    texto: string | null;
    legenda: string | null;
    transcricao: string | null;
    midiaNome: string | null;
    apagadaEm: string | null;
    criadaEm: string;
    /** O que a IA enxergou na foto do cliente (visao.ts). null = ainda não olhou ou não conseguiu. */
    descricaoImagem?: string | null;
}

export interface TurnoTexto {
    role: 'user' | 'assistant';
    content: string;
}

/** Como cada mensagem aparece para a Laura (mídia vira descrição em colchetes). */
export function textoParaIa(m: MensagemParaIa): string | null {
    if (m.apagadaEm) return '[mensagem apagada]';
    const leg = m.legenda ? ` ${m.legenda}` : '';
    switch (m.tipo) {
        case 'imagem': return `[foto]${m.descricaoImagem ? ` ${m.descricaoImagem}` : ''}${leg}`;
        case 'video': return `[vídeo]${leg}`;
        case 'audio': return m.transcricao ? `[áudio] ${m.transcricao}` : '[áudio sem transcrição]';
        case 'documento': return `[documento: ${m.midiaNome || 'arquivo'}]${leg}`;
        case 'figurinha': return '[figurinha]';
        case 'localizacao': return `[localização: ${m.texto || 'enviada'}]`;
        case 'contato': return `[contato: ${m.texto || 'enviado'}]`;
        case 'reacao': return m.texto ? `[reagiu ${m.texto}]` : null;
        default: {
            const t = (m.texto || '').trim();
            // O Evolution não conseguiu abrir (ex.: secretEncryptedMessage): a Laura não pode fingir que leu.
            if (m.autor === 'cliente' && MENSAGEM_NAO_ABERTA.test(t)) return '[mensagem que não consegui abrir]';
            return t || null;
        }
    }
}

/** Texto que o parser grava para tipos que o CRM não desenha: "[mensagem do tipo secretEncryptedMessage]". */
const MENSAGEM_NAO_ABERTA = /^\[mensagem do tipo [^\]]+\]$/i;

/**
 * Resposta automática de outra empresa ("Agradecemos sua mensagem. Não estamos disponíveis..."):
 * a Laura não responde, senão duas máquinas ficam trocando mensagem.
 */
export function ehRespostaAutomatica(texto: string | null | undefined): boolean {
    const t = (texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!t) return false;
    return /\b(resposta|mensagem) automatica\b/.test(t)
        || /\bagradecemos (a |sua )?(mensagem|contato)\b.*\b(nao estamos|retornaremos|responderemos|em breve|assim que possivel)/.test(t)
        || /\bnao (estamos|estou) disponivel\b.*\b(responderemos|retornaremos|retorno|assim que possivel)/.test(t)
        || /\bfora do horario de atendimento\b.*\b(retornaremos|responderemos|retorno)/.test(t);
}

const semAcento = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Só confirmação/agradecimento ("👍", "Ok", "Obrigado", "Blz", "Certo", "Valeu"): não pede resposta.
 * A Laura respondia "👍" com mais uma despedida (22/11, Jesaías: 3 mensagens de "está tudo anotado").
 */
export function ehSoConfirmacao(texto: string | null | undefined): boolean {
    const t = semAcento((texto || '').trim());
    if (!t) return false;
    // só emoji/pontuação (👍, 🙏, 😉, "!", "...")
    if (!/[a-z0-9]/.test(t)) return true;
    const palavras = t.replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
    if (!palavras.length || palavras.length > 6) return false;
    const OK = new Set(['ok', 'okay', 'oki', 'okk', 'blz', 'beleza', 'certo', 'certinho', 'combinado', 'show', 'valeu', 'vlw', 'obrigado', 'obrigada',
        'obg', 'brigado', 'brigada', 'agradeco', 'grato', 'grata', 'ta', 'tah', 'ss', 'sim', 'entendi', 'perfeito', 'otimo', 'top', 'joia', 'massa',
        'tranquilo', 'de', 'nada', 'muito', 'pela', 'atencao', 'por', 'enquanto', 'boa', 'bom', 'fico', 'no', 'aguardo', 'aguardando', 'tudo', 'bem', 'e', 'pra', 'voce', 'vc', 'tb', 'tambem']);
    return palavras.every(p => OK.has(p));
}

/** O cliente pediu uma pessoa (consultor, atendente, ligação)? Laura TEM de passar ao consultor. */
export function pediuHumano(texto: string | null | undefined): boolean {
    const t = semAcento(texto || '');
    if (!t.trim()) return false;
    return /\b(falar|conversar|tratar|negociar)\s+(direto\s+)?com\s+(um|uma|o|a|algum|alguma|alguem|seu|teu)?\s*(vendedor|consultor|atendente|pessoa|humano|gerente|dono|responsavel|alguem)/.test(t)
        || /\b(atendente|atendimento humano|pessoa de verdade|pessoa real|voce e (um )?robo|e (um )?robo|falar com (um )?humano)\b/.test(t)
        || /\b(me liga|me ligue|me ligar|pode(ria)? me ligar|posso (te |lhe )?ligar|liga pra mim|ligar pra (voces|loja|voce|vc)|numero (do|de um|de algum) (vendedor|consultor))\b/.test(t)
        || /\b(quero|preciso|gostaria de) (falar|conversar) com (alguem|o vendedor|um vendedor|o consultor|um consultor)\b/.test(t);
}

/**
 * Monta os turnos para o modelo: cliente = user; Laura/vendedor = assistant;
 * aviso do CRM a vendedor fica de fora. Junta mensagens seguidas do mesmo lado,
 * começa no cliente e termina no cliente (a mensagem que disparou a rodada).
 */
export function montarHistorico(msgs: MensagemParaIa[], limite = 40): TurnoTexto[] {
    const ordenadas = [...msgs].sort((a, b) => (a.criadaEm < b.criadaEm ? -1 : a.criadaEm > b.criadaEm ? 1 : 0));
    const turnos: TurnoTexto[] = [];
    for (const m of ordenadas.slice(-limite)) {
        if (m.autor === 'sistema') continue;
        const t = textoParaIa(m);
        if (!t) continue;
        const role: TurnoTexto['role'] = m.autor === 'cliente' ? 'user' : 'assistant';
        const ultimo = turnos[turnos.length - 1];
        if (ultimo && ultimo.role === role) ultimo.content += `\n${t}`;
        else turnos.push({ role, content: t });
    }
    while (turnos.length && turnos[0].role !== 'user') turnos.shift();
    while (turnos.length && turnos[turnos.length - 1].role !== 'user') turnos.pop();
    return turnos;
}

// ---------------------------------------------------------------------------
// Custo
// ---------------------------------------------------------------------------

/** US$ por milhão de tokens — Claude Sonnet 5.5, preço de tabela em 06/11/2026. */
export const PRECO_SONNET_55 = { entrada: 2, saida: 10, cacheLeitura: 0.2, cacheEscrita: 2.5 };
/** Haiku 5.5: US$ 0,10 / 0,50 por milhão (prompt até 100 mil tokens). Cache: 10% e 125% da entrada (estimativa). */
export const PRECO_HAIKU_55 = { entrada: 0.1, saida: 0.5, cacheLeitura: 0.01, cacheEscrita: 0.125 };

export interface UsoTokens {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
}

export function somarUso(a: UsoTokens, b: Partial<UsoTokens> | null | undefined): UsoTokens {
    return {
        input_tokens: a.input_tokens + (b?.input_tokens || 0),
        output_tokens: a.output_tokens + (b?.output_tokens || 0),
        cache_read_input_tokens: (a.cache_read_input_tokens || 0) + (b?.cache_read_input_tokens || 0),
        cache_creation_input_tokens: (a.cache_creation_input_tokens || 0) + (b?.cache_creation_input_tokens || 0),
    };
}

export function custoUsd(u: UsoTokens, preco = PRECO_SONNET_55): number {
    const v = (u.input_tokens * preco.entrada
        + u.output_tokens * preco.saida
        + (u.cache_read_input_tokens || 0) * preco.cacheLeitura
        + (u.cache_creation_input_tokens || 0) * preco.cacheEscrita) / 1_000_000;
    return Math.round(v * 1_000_000) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Ensaio: a resposta que de fato foi enviada (n8n) para comparar com o rascunho
// ---------------------------------------------------------------------------

export interface MensagemComparavel {
    id: string;
    autor: 'cliente' | 'laura' | 'vendedor' | 'sistema';
    criadaEm: string;
}

/**
 * Respostas reais a uma rodada: mensagens da loja (Laura do n8n ou vendedor)
 * depois da mensagem que disparou a rodada e antes da próxima do cliente.
 */
export function respostasReais<T extends MensagemComparavel>(gatilhoEm: string, msgs: T[]): T[] {
    const ordenadas = [...msgs].sort((a, b) => (a.criadaEm < b.criadaEm ? -1 : a.criadaEm > b.criadaEm ? 1 : 0));
    const out: T[] = [];
    for (const m of ordenadas) {
        if (m.criadaEm <= gatilhoEm) continue;
        if (m.autor === 'cliente') break;
        if (m.autor === 'laura' || m.autor === 'vendedor') out.push(m);
    }
    return out;
}

// ---------------------------------------------------------------------------
// Repetição (ensaio de 11/11: a Laura repetia a mesma pergunta e o mesmo carro)
// ---------------------------------------------------------------------------

const PALAVRAS_VAZIAS = new Set(['de', 'da', 'do', 'e', 'o', 'a', 'os', 'as', 'um', 'uma', 'que', 'com', 'pra', 'para', 'por', 'em', 'no', 'na', 'te', 'me', 'se', 'ou', 'voce', 'vc', 'tem', 'sim']);

function palavrasChave(s: string): Set<string> {
    return new Set(
        (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/).filter(p => p.length >= 3 && !PALAVRAS_VAZIAS.has(p)),
    );
}

/** Quanto do texto novo já foi dito antes: 0 a 1 (palavras do menor que aparecem no outro). */
export function semelhanca(novo: string, anterior: string): number {
    const n = palavrasChave(novo), a = palavrasChave(anterior);
    if (!n.size || !a.size) return 0;
    let comum = 0;
    for (const p of n) if (a.has(p)) comum++;
    return comum / Math.min(n.size, a.size);
}

/** Pergunta final da mensagem (última frase com "?"), ou null. */
export function perguntaFinal(texto: string): string | null {
    const frases = (texto || '').split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean);
    for (let i = frases.length - 1; i >= 0; i--) if (frases[i].includes('?')) return frases[i];
    return null;
}

/**
 * A resposta repete uma das últimas mensagens da loja? Repete se for muito parecida com
 * alguma delas (70% ou mais das palavras) ou se termina com a mesma pergunta.
 */
export function repeteMensagemAnterior(texto: string, anteriores: string[]): boolean {
    const pergunta = perguntaFinal(texto);
    for (const a of anteriores) {
        if (!a) continue;
        if (semelhanca(texto, a) >= 0.7 && palavrasChave(texto).size >= 6) return true;
        const pa = perguntaFinal(a);
        if (pergunta && pa && semelhanca(pergunta, pa) >= 0.8 && palavrasChave(pergunta).size >= 3) return true;
    }
    return false;
}

// ---------------------------------------------------------------------------
// Comentário sobre o atendimento anterior (caso "Canoas", 11/11/2026)
// ---------------------------------------------------------------------------

const RX_COMENTA_ANTERIOR = new RegExp([
    'corrigindo\\s*:',
    '(mensagem|informa[cç][aã]o|resposta|endere[cç]o)\\s+(anterior|de antes|passad[ao])[^.!?\\n]{0,60}(errad|incorret|equivocad)',
    'estava\\s+(errad|incorret|equivocad)',
    'foi\\s+(um\\s+)?(engano|erro)\\s+(noss|meu|da loja|do atendente)',
    'te\\s+(passaram|informaram|falaram)\\s+errado',
    'desculp[ea][^.!?\\n]{0,40}(informa[cç][aã]o|mensagem)\\s+errad',
].join('|'), 'i');

/** A resposta aponta erro do atendimento anterior? (a Laura deve só dar a informação certa) */
export function comentaAtendimentoAnterior(texto: string): boolean {
    return RX_COMENTA_ANTERIOR.test(texto || '');
}

// ---------------------------------------------------------------------------
// Resposta longa demais (pedido do Alexandre, 13/11/2026: sempre curta e objetiva)
// ---------------------------------------------------------------------------

/** Linha de carro de uma lista: "Modelo ano · cor · km · preço". */
const LINHA_DE_CARRO = /·.*·/;

export const LIMITE_RESPOSTA = 280;
export const LIMITE_RESPOSTA_COM_LISTA = 480;

/** A resposta passou do tamanho? Lista de até 3 carros ganha mais espaço. */
export function respostaLonga(texto: string): boolean {
    const t = (texto || '').trim();
    const comLista = t.split('\n').filter(l => LINHA_DE_CARRO.test(l)).length >= 2;
    return t.length > (comLista ? LIMITE_RESPOSTA_COM_LISTA : LIMITE_RESPOSTA);
}
