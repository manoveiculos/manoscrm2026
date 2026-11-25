// src/lib/whatsapp/ia/followup.ts — follow-up da Laura para quem parou de responder
//
// Regras decididas pelo Alexandre (11/11/2026):
//   - a Laura envia sozinha, no horário da loja;
//   - toques em 1, 2, 4 e 10 dias contados do último recado da loja que ficou sem resposta;
//   - depois do 4º toque, para.
// Segurança: só conversa em "ia", nunca quem pediu para parar / já comprou / tem visita marcada,
// intervalo de 75 s entre envios (anti-ban), teto por rodada e por dia, para no primeiro erro.
//
// Este arquivo tem a DECISÃO pura (testada) e o prompt. A execução fica em followupRodada.ts.

import { ehSoConfirmacao } from './regras';

export const CADENCIA_DIAS = [1, 2, 4, 10] as const;
/** Um envio por rodada: o cron roda a cada poucos minutos, então o intervalo vem da pausa abaixo (anti-ban). */
export const MAX_POR_RODADA = 1;
export const ESPERA_ENTRE_ENVIOS_MS = 75_000;
/** Pausa mínima entre dois follow-ups: 8 min + sorteio de 0 a 4 min (nunca em intervalo certinho de robô). */
export const PAUSA_MIN_ENTRE_ENVIOS_MIN = 8;
export const PAUSA_SORTEIO_MIN = 4;

/** Pausa exigida desta vez, em ms (entre 8 e 12 min). `sorteio` é um número de 0 a 1 (Math.random). */
export function pausaEntreEnviosMs(sorteio: number): number {
    const s = Math.min(1, Math.max(0, Number.isFinite(sorteio) ? sorteio : 0));
    return Math.round((PAUSA_MIN_ENTRE_ENVIOS_MIN + PAUSA_SORTEIO_MIN * s) * 60_000);
}

/** Já passou a pausa desde o último follow-up enviado? `faltaMs` diz quanto ainda falta. */
export function podeEnviarAgora(ultimoEnvioEm: string | null | undefined, agora: Date, sorteio: number): { pode: boolean; faltaMs: number } {
    const ult = ultimoEnvioEm ? Date.parse(ultimoEnvioEm) : NaN;
    if (!Number.isFinite(ult)) return { pode: true, faltaMs: 0 };
    const falta = ult + pausaEntreEnviosMs(sorteio) - agora.getTime();
    return falta > 0 ? { pode: false, faltaMs: falta } : { pode: true, faltaMs: 0 };
}
export const LIMITE_DIA_PADRAO = 30;

/**
 * Ritmo do dia: o teto diário NÃO sai todo de uma vez. A cota liberada cresce em linha reta desde a abertura
 * da loja até 1 h antes de fechar (sobra a última hora para respostas); depois disso vale o teto inteiro.
 * Ex.: teto 30, loja 8h-18h → ~3 por hora; às 9h já pode ter 4, às 13h 16, a partir das 17h os 30.
 * Domingo (loja fechada) = 0.
 */
export function cotaAteAgora(teto: number, agora: Date, horas: { seg_sex: [number, number]; sab: [number, number] }): number {
    const sp = new Date(agora.getTime() - 3 * 3_600_000);   // Brasília, UTC-3 fixo (mesma premissa do slaEngine)
    const dia = sp.getUTCDay();
    if (dia === 0) return 0;
    const [abre, fecha] = dia === 6 ? horas.sab : horas.seg_sex;
    const duracaoMin = Math.max(60, (fecha - abre - 1) * 60);
    const passouMin = sp.getUTCHours() * 60 + sp.getUTCMinutes() - abre * 60;
    const fracao = Math.min(1, Math.max(0, passouMin / duracaoMin));
    return Math.min(teto, Math.ceil(teto * fracao));
}
/** Nunca dois toques em menos de 20 h, mesmo que a cadência permita. */
export const MIN_HORAS_ENTRE_TOQUES = 20;
/** Conversas mais antigas que isso não recebem follow-up (lead morto: fica para o gestor). */
export const MAX_DIAS_DESDE_ANCORA = 30;

/**
 * Data de corte: silêncio que começou ANTES disto nunca recebe follow-up. Sem isso, ao ligar o
 * follow-up as conversas antigas (44 paradas em 11/11/2026) receberiam toque de uma vez.
 * WA_FOLLOWUP_DESDE (ISO) troca a data; valor inválido cai no padrão.
 */
export const CORTE_PADRAO = '2026-11-12T03:00:00.000Z'; // 12/11/2026 00:00 em Brasília

export function dataDeCorte(env: string | null | undefined): string {
    const v = (env || '').trim();
    const ms = v ? Date.parse(v) : NaN;
    return Number.isFinite(ms) ? new Date(ms).toISOString() : CORTE_PADRAO;
}

const DIA_MS = 86_400_000;

export interface MsgFollowup {
    autor: 'cliente' | 'laura' | 'vendedor' | string;
    texto?: string | null;
    transcricao?: string | null;
    criadaEm: string;
}

/**
 * Âncora do silêncio: a primeira mensagem da loja depois da última do cliente.
 * Retorna null quando o cliente ainda espera resposta (quem responde é a Laura normal),
 * quando ele nunca falou, ou quando a conversa está vazia.
 */
export function ancoraDoSilencio(msgs: MsgFollowup[], iniciadaPelaLoja = false): string | null {
    const o = msgs.slice().sort((a, b) => a.criadaEm.localeCompare(b.criadaEm));
    let ultCliente = -1;
    o.forEach((m, i) => { if (m.autor === 'cliente') ultCliente = i; });
    // Conversa que a Laura puxou (lead de anúncio) e o cliente nunca respondeu: a âncora é a 1ª mensagem da loja.
    if (ultCliente < 0) return iniciadaPelaLoja ? (o.find(m => m.autor === 'laura')?.criadaEm ?? null) : null;
    const depois = o.slice(ultCliente + 1).find(m => m.autor === 'laura' || m.autor === 'vendedor');
    return depois ? depois.criadaEm : null;
}

// 25/11/2026: "Não obrigado 👍🏼" (Diogenes) e "Já deu certo obrigado" (Diego) recebiam toque mesmo assim.
const PARAR = /\b(n[aã]o\s+(quero|tenho\s+interesse|preciso|precisa|vou\s+querer)|n[aã]o[,!.]?\s+obrigad[oa]|sem\s+interesse|para(r)?\s+de\s+(mandar|enviar|me\s+chamar)|pare\b|me\s+tir[ae]|n[aã]o\s+me\s+(chame|mande|envie)|j[aá]\s+(comprei|fechei|adquiri|resolvi|consegui|achei|encontrei|arrumei|peguei)|j[aá]\s+deu\s+certo|comprei\s+(outro|um|o|uma|a)|desisti|cancela(r)?)\b/i;

/** "Quando tiver me avisa", "fico no aguardo do Soul": o cliente espera o carro entrar (a lista de espera avisa). */
const PEDIU_AVISO = /\b(quando\s+(tiver|chegar|entrar|aparecer|tiverem)|me\s+avis[ae]|pode\s+me\s+avisar|fico\s+no\s+aguardo|aguardo\s+(o|a|seu|teu|voc[eê]s|contato|retorno|aviso)|me\s+chama\s+quando)\b/i;

export function pediuAviso(msgs: MsgFollowup[], ultimas = 6): boolean {
    return msgs.filter(m => m.autor === 'cliente').sort((a, b) => a.criadaEm.localeCompare(b.criadaEm)).slice(-ultimas)
        .some(m => PEDIU_AVISO.test(`${m.transcricao || ''} ${m.texto || ''}`));
}

const DESPEDIDA = /\b(at[eé]( mais| logo| breve)?|tchau|abra[cç]o|igualmente|bom final de semana|boa semana|fica com deus|valeu)\b/i;

/**
 * Conversa que já terminou: a última fala do cliente é só agradecimento/despedida e a loja respondeu sem perguntar nada.
 * ("Igualmente!! / Até" → "Até, Élida! Qualquer coisa é só chamar." → toque "ficou alguma dúvida sobre o Compass?" não faz sentido.)
 */
export function conversaEncerrada(msgs: MsgFollowup[]): boolean {
    const o = msgs.slice().sort((a, b) => a.criadaEm.localeCompare(b.criadaEm));
    let ultCliente = -1;
    o.forEach((m, i) => { if (m.autor === 'cliente') ultCliente = i; });
    if (ultCliente < 0) return false;
    const falaCliente = `${o[ultCliente].transcricao || ''} ${o[ultCliente].texto || ''}`.trim();
    // Só despedida/agradecimento: tirando as palavras de despedida não sobra assunto ("Valeu, vou pensar" sobra → continua)
    const resto = falaCliente.replace(new RegExp(DESPEDIDA.source, 'gi'), ' ').trim();
    const soDespedida = DESPEDIDA.test(falaCliente) && (!/[a-z0-9]/i.test(resto) || ehSoConfirmacao(resto));
    if (!ehSoConfirmacao(falaCliente) && !soDespedida) return false;
    const daLoja = o.slice(ultCliente + 1).filter(m => m.autor === 'laura' || m.autor === 'vendedor');
    if (!daLoja.length) return false;
    return !daLoja.some(m => (m.texto || '').includes('?'));
}

/** O cliente pediu para parar ou disse que já resolveu? Olha as últimas mensagens dele. */
export function pediuParar(msgs: MsgFollowup[], ultimas = 5): boolean {
    return msgs
        .filter(m => m.autor === 'cliente')
        .sort((a, b) => a.criadaEm.localeCompare(b.criadaEm))
        .slice(-ultimas)
        .some(m => PARAR.test(`${m.transcricao || ''} ${m.texto || ''}`));
}

export type Decisao =
    | { acao: 'enviar'; etapa: number }
    | { acao: 'pular'; motivo: string };

export interface EntradaDecisao {
    status: string | null;
    iaSilenciadaAte: string | null;
    /** Mensagens da conversa (qualquer ordem). */
    msgs: MsgFollowup[];
    /** Toques JÁ ENVIADOS (status 'enviado') depois da âncora atual. */
    enviadosDepoisDaAncora: string[];
    /** Rascunho (ensaio) da etapa devida já existe depois da âncora? */
    rascunhoDaEtapaExiste?: (etapa: number) => boolean;
    leadFechado: boolean;
    temVisitaMarcada: boolean;
    /** O lead já foi entregue a um consultor pela triagem: quem chama agora é ele, não a Laura. */
    entregueAoConsultor?: boolean;
    /** A Laura puxou a conversa (triagem de lead de anúncio): vale mesmo sem mensagem do cliente. */
    iniciadaPelaLoja?: boolean;
    /** Cliente na lista de espera de um carro (carro_espera aguardando): quem chama é o aviso de entrada, não o follow-up. */
    naListaDeEspera?: boolean;
    lojaAberta: boolean;
    agora: Date;
    /** Silêncio que começou antes desta data (ISO) não recebe follow-up. */
    corte?: string | null;
}

export function decidirFollowup(e: EntradaDecisao): Decisao {
    const pula = (motivo: string): Decisao => ({ acao: 'pular', motivo });
    if (e.status !== 'ia') return pula('conversa não está com a Laura');
    if (e.iaSilenciadaAte && new Date(e.iaSilenciadaAte).getTime() > e.agora.getTime()) return pula('Laura silenciada');
    if (e.leadFechado) return pula('lead vendido, perdido ou arquivado');
    if (e.temVisitaMarcada) return pula('visita marcada');
    if (e.entregueAoConsultor) return pula('lead já entregue ao consultor');
    const ancora = ancoraDoSilencio(e.msgs, e.iniciadaPelaLoja);
    if (!ancora) return pula('cliente aguardando resposta ou sem histórico');
    if (e.corte && Date.parse(ancora) < Date.parse(e.corte)) return pula('silêncio anterior ao início do follow-up');
    if (pediuParar(e.msgs)) return pula('cliente pediu para parar ou já resolveu');
    if (conversaEncerrada(e.msgs)) return pula('conversa encerrada com despedida');
    if (e.naListaDeEspera && pediuAviso(e.msgs)) return pula('cliente aguarda o carro entrar (lista de espera)');

    const desdeAncora = e.agora.getTime() - Date.parse(ancora);
    if (desdeAncora > MAX_DIAS_DESDE_ANCORA * DIA_MS) return pula('silêncio longo demais');
    const n = e.enviadosDepoisDaAncora.length;
    if (n >= CADENCIA_DIAS.length) return pula('cadência completa');
    if (desdeAncora < CADENCIA_DIAS[n] * DIA_MS) return pula('ainda não é a hora');
    const ultimo = e.enviadosDepoisDaAncora.slice().sort().pop();
    if (ultimo && e.agora.getTime() - Date.parse(ultimo) < MIN_HORAS_ENTRE_TOQUES * 3_600_000) return pula('toque recente');
    if (!e.lojaAberta) return pula('fora do horário da loja');
    const etapa = n + 1;
    if (e.rascunhoDaEtapaExiste?.(etapa)) return pula('rascunho desta etapa já existe');
    return { acao: 'enviar', etapa };
}

const OBJETIVO: Record<number, string> = {
    1: 'Passou 1 dia. Retome o ÚLTIMO assunto da conversa de forma leve (o carro, as fotos, a pergunta que ficou sem resposta). Nada de pressão.',
    2: 'Passaram 2 dias. Mostre que está à disposição e pergunte, de um jeito diferente do toque anterior, se o cliente ainda procura o carro ou quer ver outra opção.',
    3: 'Passaram 4 dias. Pergunte de forma direta e simpática se ainda tem interesse e diga que a visita é sem compromisso. Não use "franqueza", "sinceridade" nem "com todo respeito".',
    4: 'Último toque (10 dias). Despeça-se com gentileza: diga que vai deixar o atendimento por aqui para não incomodar e que ele pode chamar quando quiser. Sem pergunta.',
};

/** Lead de anúncio que NUNCA respondeu: não existe "dúvida" nem "assunto"; só convite curto para dizer o que procura. */
const OBJETIVO_SEM_RESPOSTA: Record<number, string> = {
    1: 'O cliente ainda não respondeu à primeira mensagem. Pergunte de forma leve se ele ainda procura carro e qual modelo ou tipo. NÃO pergunte se "ficou alguma dúvida" (ele nunca falou nada).',
    2: 'Ele segue sem responder. Mande algo curto e diferente: ofereça mandar opções do estoque se ele disser o tipo de carro (SUV, sedã, hatch, picape) ou a faixa de valor. Sem "ficou alguma dúvida".',
    3: 'Ele nunca respondeu. Pergunte numa frase se ainda tem interesse em trocar de carro. Sem "franqueza", sem "sinceridade".',
    4: 'Último toque. Diga numa frase que vai deixar por aqui para não incomodar e que ele pode chamar quando quiser. Sem pergunta.',
};

/** Instrução do toque, que vai no fim da conversa (a Laura segue o prompt de sempre como sistema). */
export function instrucaoDoToque(p: {
    etapa: number; nome: string | null; carro: string | null; contexto: string;
    /** O cliente nunca escreveu nada (lead de anúncio que a Laura chamou). */
    semRespostaDoCliente?: boolean;
    /** Carro(s) do interesse que ESTÃO no estoque agora, já no formato "Modelo ano · cor · km · preço". */
    noEstoqueAgora?: string[];
    /** Textos dos toques anteriores (para não repetir). */
    toquesAnteriores?: string[];
}): string {
    const objetivo = (p.semRespostaDoCliente ? OBJETIVO_SEM_RESPOSTA : OBJETIVO)[p.etapa] || OBJETIVO[1];
    const estoque = p.noEstoqueAgora?.length
        ? `No estoque AGORA (conferido pelo sistema): ${p.noEstoqueAgora.join(' | ')}. Se a conversa disse que não tinha esse carro, ofereça este com naturalidade, sem dizer que houve engano.`
        : '';
    const anteriores = p.toquesAnteriores?.length
        ? `Toques que você já mandou (não repita a abertura nem a pergunta): ${p.toquesAnteriores.map(t => `"${t.slice(0, 90)}"`).join(' / ')}.`
        : '';
    return [
        '<tarefa_do_crm>',
        'O cliente parou de responder. Escreva UMA mensagem curta de follow-up para o WhatsApp, no seu jeito de sempre.',
        objetivo,
        p.nome ? `Nome do cliente: ${p.nome}.` : 'Você ainda não sabe o nome do cliente: não invente.',
        p.carro ? `Carro de interesse: ${p.carro}.` : '',
        estoque,
        anteriores,
        'Regras: no máximo 2 frases; não comece com "Oi! Passando só pra saber"; não repita o que a loja já disse; não cite preço, parcela nem carro que não apareça na conversa ou na linha "No estoque AGORA"; não prometa nada; não diga "sujeito a análise de crédito"; no máximo 1 emoji.',
        'Responda só com o texto da mensagem, sem explicar.',
        p.contexto,
        '</tarefa_do_crm>',
    ].filter(Boolean).join('\n');
}
