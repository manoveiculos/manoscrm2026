// src/lib/whatsapp/ia/analista.ts — Analista de contexto (PURO)
//
// Segundo agente do atendimento (plano de 11/11/2026). Ele NÃO fala com o cliente: lê a
// conversa quando ela para e registra a SITUAÇÃO em wa_conversas.situacao. Quem usa:
//   - o briefing da ficha ("onde esse cliente está agora");
//   - o especialista em follow-up (Fase 2), para escolher o tipo de mensagem
//     (ex.: consultor levou para o particular → perguntar como foi o atendimento).
//
// Aqui ficam os tipos, o prompt e a leitura segura da resposta do modelo.

export const SITUACOES = [
    'laura_aguardando_cliente',        // a Laura respondeu/perguntou e o cliente sumiu
    'cliente_aguardando_loja',         // o cliente falou por último e ninguém respondeu
    'passou_para_consultor',           // a Laura passou; o consultor ainda não falou
    'consultor_levou_para_particular', // o consultor disse que chamaria no número/WhatsApp dele
    'consultor_negociando',            // consultor e cliente conversando por aqui
    'visita_marcada',
    'visita_realizada',
    'cliente_pediu_tempo',             // "vou pensar", "mês que vem", "depois do dia 20"
    'cliente_recusou',                 // não quer mais, pediu para parar
    'cliente_comprou',                 // comprou (aqui ou em outro lugar)
    'quer_vender_carro',               // quer vender/avaliar o carro dele, não comprar
    'indefinida',
] as const;

export type CodigoSituacao = typeof SITUACOES[number];

export interface Situacao {
    situacao: CodigoSituacao;
    /** Uma frase: onde o cliente está agora. */
    resumo: string;
    /** O que a loja deve fazer em seguida (ou "nada"). */
    proximaAcao: string;
    /** Data que o cliente citou para voltar / da visita (AAAA-MM-DD), se houver. */
    quando: string | null;
    confianca: 'alta' | 'media' | 'baixa';
}

export const ROTULO_SITUACAO: Record<CodigoSituacao, string> = {
    laura_aguardando_cliente: 'Cliente parou de responder a Laura',
    cliente_aguardando_loja: 'Cliente esperando resposta da loja',
    passou_para_consultor: 'Passado para o consultor',
    consultor_levou_para_particular: 'Consultor levou para o particular',
    consultor_negociando: 'Em negociação com o consultor',
    visita_marcada: 'Visita marcada',
    visita_realizada: 'Visita realizada',
    cliente_pediu_tempo: 'Cliente pediu um tempo',
    cliente_recusou: 'Cliente não quer mais',
    cliente_comprou: 'Cliente já comprou',
    quer_vender_carro: 'Quer vender o carro dele',
    indefinida: 'Situação não identificada',
};

export const ANALISTA_PROMPT = `Você é o Analista de contexto da Manos Veículos. Você NÃO fala com o cliente. Você lê a conversa do WhatsApp da loja e diz, com precisão, em que pé ela está, para o time decidir o próximo passo.

Na transcrição: "Cliente" é o cliente; "Laura" é a atendente virtual; "Consultor" é um vendedor humano da loja.

Responda SOMENTE com um JSON, sem texto antes ou depois, neste formato:
{"situacao": "<código>", "resumo": "<1 frase, até 160 caracteres>", "proxima_acao": "<1 frase curta ou 'nada'>", "quando": "<AAAA-MM-DD ou null>", "confianca": "alta|media|baixa"}

Códigos de situacao (escolha UM, o que descreve o momento ATUAL, olhando principalmente as últimas mensagens):
- laura_aguardando_cliente: a Laura respondeu ou perguntou por último e o cliente não voltou.
- cliente_aguardando_loja: o cliente falou por último e ninguém da loja respondeu.
- passou_para_consultor: a Laura avisou que o consultor continua, e o consultor ainda não escreveu.
- consultor_levou_para_particular: o consultor disse que vai chamar/ligar pelo número ou WhatsApp dele ("te chamo no meu", "vou te chamar no particular", "te ligo").
- consultor_negociando: consultor e cliente estão conversando por aqui.
- visita_marcada: há visita combinada para uma data futura (preencha "quando").
- visita_realizada: o cliente já foi à loja.
- cliente_pediu_tempo: o cliente pediu para esperar ("vou pensar", "mês que vem", "depois do dia 20"). Preencha "quando" se ele deu data.
- cliente_recusou: disse que não quer, desistiu ou pediu para parar de receber mensagem.
- cliente_comprou: disse que já comprou (aqui ou em outro lugar).
- quer_vender_carro: quer vender ou avaliar o carro dele, não comprar.
- indefinida: não dá para saber.

Regras:
- Use só o que está escrito. Não invente fato, data, carro nem valor.
- "quando" só se a data estiver clara na conversa; use a data de hoje informada para converter "amanhã", "sábado" etc. Na dúvida, null.
- Se a evidência for fraca, use confianca "baixa".
- "resumo" e "proxima_acao" em português simples, sem citar estes códigos.`;

export interface MsgAnalista { autor: string; texto: string; criadaEm: string }

const QUEM: Record<string, string> = { cliente: 'Cliente', laura: 'Laura', vendedor: 'Consultor' };

/** Transcrição para o analista: "[dd/mm hh:mm] Quem: texto", só as últimas `limite` mensagens. */
export function transcricaoParaAnalista(msgs: MsgAnalista[], limite = 40): string {
    const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    return msgs
        .filter(m => QUEM[m.autor] && m.texto.trim())
        .sort((a, b) => a.criadaEm.localeCompare(b.criadaEm))
        .slice(-limite)
        .map(m => `[${fmt.format(new Date(m.criadaEm)).replace(',', '')}] ${QUEM[m.autor]}: ${m.texto.replace(/\s+/g, ' ').trim().slice(0, 500)}`)
        .join('\n');
}

export function pedidoDoAnalista(transcricao: string, agora: Date): string {
    const hoje = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(agora);
    return `Hoje é ${hoje} (horário de Brasília).\n\n<conversa>\n${transcricao}\n</conversa>\n\nQual é a situação atual? Responda só com o JSON.`;
}

const limpar = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** Lê a resposta do modelo com segurança. Qualquer coisa fora do formato vira "indefinida" (nunca lança). */
export function lerSituacao(bruto: string): Situacao {
    const indefinida: Situacao = { situacao: 'indefinida', resumo: '', proximaAcao: '', quando: null, confianca: 'baixa' };
    const i = bruto.indexOf('{');
    const f = bruto.lastIndexOf('}');
    if (i < 0 || f <= i) return indefinida;
    let j: Record<string, unknown>;
    try { j = JSON.parse(bruto.slice(i, f + 1)); } catch { return indefinida; }
    if (!j || typeof j !== 'object') return indefinida;
    const codigo = SITUACOES.includes(j.situacao as CodigoSituacao) ? j.situacao as CodigoSituacao : 'indefinida';
    const quando = typeof j.quando === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.quando) && Number.isFinite(Date.parse(j.quando)) ? j.quando : null;
    const confianca = j.confianca === 'alta' || j.confianca === 'media' ? j.confianca : 'baixa';
    return {
        situacao: codigo,
        resumo: limpar(j.resumo, 200),
        proximaAcao: limpar(j.proxima_acao ?? j.proximaAcao, 160),
        quando,
        confianca: codigo === 'indefinida' ? 'baixa' : confianca,
    };
}

/** A conversa mudou depois da última análise e já está quieta há tempo suficiente? */
export function precisaAnalisar(p: { ultimaMensagemEm: string | null; situacaoEm: string | null; agora: Date; quietaMin?: number }): boolean {
    if (!p.ultimaMensagemEm) return false;
    const ult = Date.parse(p.ultimaMensagemEm);
    if (p.agora.getTime() - ult < (p.quietaMin ?? 30) * 60_000) return false; // ainda conversando
    return !p.situacaoEm || Date.parse(p.situacaoEm) < ult;
}
