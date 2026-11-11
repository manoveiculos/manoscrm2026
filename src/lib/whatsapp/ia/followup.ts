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

export const CADENCIA_DIAS = [1, 2, 4, 10] as const;
export const MAX_POR_RODADA = 3;
export const ESPERA_ENTRE_ENVIOS_MS = 75_000;
export const LIMITE_DIA_PADRAO = 30;
/** Nunca dois toques em menos de 20 h, mesmo que a cadência permita. */
export const MIN_HORAS_ENTRE_TOQUES = 20;
/** Conversas mais antigas que isso não recebem follow-up (lead morto: fica para o gestor). */
export const MAX_DIAS_DESDE_ANCORA = 30;

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
export function ancoraDoSilencio(msgs: MsgFollowup[]): string | null {
    const o = msgs.slice().sort((a, b) => a.criadaEm.localeCompare(b.criadaEm));
    let ultCliente = -1;
    o.forEach((m, i) => { if (m.autor === 'cliente') ultCliente = i; });
    if (ultCliente < 0) return null;
    const depois = o.slice(ultCliente + 1).find(m => m.autor === 'laura' || m.autor === 'vendedor');
    return depois ? depois.criadaEm : null;
}

const PARAR = /\b(n[aã]o\s+(quero|tenho\s+interesse|preciso)|sem\s+interesse|para(r)?\s+de\s+(mandar|enviar|me\s+chamar)|pare\b|me\s+tir[ae]|n[aã]o\s+me\s+(chame|mande|envie)|j[aá]\s+(comprei|fechei|adquiri)|comprei\s+(outro|um|o)|desisti|cancela(r)?)\b/i;

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
    lojaAberta: boolean;
    agora: Date;
}

export function decidirFollowup(e: EntradaDecisao): Decisao {
    const pula = (motivo: string): Decisao => ({ acao: 'pular', motivo });
    if (e.status !== 'ia') return pula('conversa não está com a Laura');
    if (e.iaSilenciadaAte && new Date(e.iaSilenciadaAte).getTime() > e.agora.getTime()) return pula('Laura silenciada');
    if (e.leadFechado) return pula('lead vendido, perdido ou arquivado');
    if (e.temVisitaMarcada) return pula('visita marcada');
    const ancora = ancoraDoSilencio(e.msgs);
    if (!ancora) return pula('cliente aguardando resposta ou sem histórico');
    if (pediuParar(e.msgs)) return pula('cliente pediu para parar ou já resolveu');

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
    1: 'Passou 1 dia. Retome o assunto de forma leve e simpática, perguntando se ficou alguma dúvida. Nada de pressão.',
    2: 'Passaram 2 dias. Mostre que está à disposição e pergunte, de um jeito diferente do toque anterior, se o cliente ainda procura o carro ou prefere ver outras opções.',
    3: 'Passaram 4 dias. Pergunte com educação e franqueza se ainda tem interesse, e diga que a visita é sem compromisso.',
    4: 'Último toque (10 dias). Despeça-se com gentileza: diga que vai deixar o atendimento por aqui para não incomodar e que ele pode chamar quando quiser. Sem pergunta.',
};

/** Instrução do toque, que vai no fim da conversa (a Laura segue o prompt de sempre como sistema). */
export function instrucaoDoToque(p: { etapa: number; nome: string | null; carro: string | null; contexto: string }): string {
    return [
        '<tarefa_do_crm>',
        'O cliente parou de responder. Escreva UMA mensagem curta de follow-up para o WhatsApp, no seu jeito de sempre.',
        OBJETIVO[p.etapa] || OBJETIVO[1],
        p.nome ? `Nome do cliente: ${p.nome}.` : 'Você ainda não sabe o nome do cliente: não invente.',
        p.carro ? `Carro de interesse: ${p.carro}.` : '',
        'Regras: no máximo 2 frases; não repita o que a loja já disse; não cite preço, parcela nem carro que não apareça na conversa; não prometa nada; não diga "sujeito a análise de crédito"; no máximo 1 emoji.',
        'Responda só com o texto da mensagem, sem explicar.',
        p.contexto,
        '</tarefa_do_crm>',
    ].filter(Boolean).join('\n');
}
