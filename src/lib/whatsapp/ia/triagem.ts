// src/lib/whatsapp/ia/triagem.ts — triagem da Laura nos leads de anúncio (PURO)
//
// Fase 4 (12/11/2026): lead do Google entra "preso" na roleta com status 'triagem_laura'. A Laura
// chama o lead no WhatsApp; quando qualifica (passar_para_consultor) ou estoura um tempo-limite,
// o lead é liberado para a roleta com um resumo. Aqui ficam só as decisões, sem banco nem rede.
//
// Regra de ouro: lead nunca fica preso por causa de falha. Tudo que dá errado LIBERA para o consultor.

export const JANELA_LAURA = { inicio: 8, fim: 21 };       // a Laura só puxa conversa entre 8h e 21h (Brasília)
export const LIMITE_SEM_CONTATO_MIN = 20;                // dentro da janela, passou disso sem a Laura conseguir: libera
export const LIMITE_SEM_CONTATO_NOITE_H = 16;            // lead da madrugada espera até 16 h pelas 8h
export const LIMITE_CLIENTE_SEM_LAURA_MIN = 10;          // cliente escreveu e a Laura não respondeu em 10 min: libera
export const LIMITE_CLIENTE_SEM_CONCLUSAO_H = 4;         // cliente respondeu, a Laura não concluiu em 4 h: libera
export const LIMITE_SEM_RESPOSTA_DIAS = 11;              // o lead nunca respondeu (4 follow-ups: 1, 2, 4 e 10 dias): vai ao consultor decidir
// Plano "esfriou" (Alexandre, 13/11/2026): lead que a Laura atendeu e o cliente parou de responder.
export const SILENCIO_QUENTE_MIN = 60;       // quente: 60 min calado → vai ao consultor
export const SILENCIO_LEMBRETE_MIN = 120;    // morno: 2 h calado → lembrete da Laura no mesmo dia
export const SILENCIO_MORNO_SEM_LEMBRETE_MIN = 360;  // morno que não deu para lembrar: 6 h → consultor
export const LEMBRETE_ESPERA_H = 12;         // morno: 12 h depois do lembrete sem resposta → consultor
export const MAX_CONTATOS_POR_RODADA = 3;
export const ESPERA_ENTRE_CONTATOS_MS = 75_000;          // anti-ban: nunca dois envios em menos de ~1 min

export type MotivoLiberacao =
    | 'qualificado'               // a Laura chamou passar_para_consultor
    | 'pediu_humano'
    | 'telefone_invalido'
    | 'laura_indisponivel'        // IA desligada / em ensaio / sem chave
    | 'laura_nao_conseguiu'       // ficou na janela sem a primeira mensagem sair
    | 'fora_do_horario_longo'
    | 'sem_conclusao'             // o cliente respondeu e a conversa não fechou
    | 'sem_resposta'              // o lead nunca respondeu, nem aos follow-ups
    | 'humano_assumiu'            // um consultor já assumiu a conversa (não adianta segurar)
    | 'esfriou_quente'            // mostrou interesse forte e parou de responder: ligar é a melhor jogada
    | 'esfriou_morno'             // interesse médio, parou de responder (com ou sem o lembrete da Laura)
    | 'chave_desligada';          // a triagem foi desligada: tudo que está preso sai

export type NivelInteresse = 'quente' | 'morno' | 'leve';

export type DecisaoTriagem =
    | { acao: 'contatar' }
    | { acao: 'lembrete' }
    | { acao: 'esperar'; motivo: string }
    | { acao: 'liberar'; motivo: MotivoLiberacao };

export interface EntradaTriagem {
    /** Quando o lead entrou na triagem. */
    criadoEm: string;
    /** Quando a Laura mandou a primeira mensagem (null = ainda não). */
    contatoEm: string | null;
    /** Última mensagem do cliente depois do contato (null = ele não respondeu). */
    ultimaDoClienteEm: string | null;
    /** A Laura já respondeu depois da última mensagem do cliente? */
    lauraRespondeuDepois: boolean;
    telefoneValido: boolean;
    /** Um consultor já assumiu a conversa (status 'humano'). */
    humanoAssumiu?: boolean;
    /** O cliente escreveu primeiro (lead de conversa no WhatsApp): a Laura responde na hora, sem janela. */
    clienteIniciou?: boolean;
    /** Hora da última mensagem da conversa (de qualquer lado). */
    ultimaMsgEm?: string | null;
    /** Nível de interesse do cliente (calculado por nivelDeInteresse). */
    nivel?: NivelInteresse;
    /** Quando a Laura mandou o lembrete do mesmo dia (null = ainda não). */
    lembreteEm?: string | null;
    /** O follow-up está ligado (WA_FOLLOWUP_ATIVO): sem ele a Laura não manda lembrete. */
    lembretePermitido?: boolean;
    /** Chave da triagem ligada no banco. */
    chaveLigada: boolean;
    /** Laura em modo "envia" e com chave do Claude. */
    lauraPodeEnviar: boolean;
    agora: Date;
}

/** Hora cheia em Brasília (UTC-3 fixo, mesma premissa do resto do CRM). */
export function horaBR(d: Date): number {
    return new Date(d.getTime() - 3 * 3_600_000).getUTCHours();
}

export function dentroDaJanelaLaura(d: Date): boolean {
    const dow = new Date(d.getTime() - 3 * 3_600_000).getUTCDay(); // 0 = domingo
    if (dow === 0) return false;                                    // domingo a loja fecha: a Laura espera segunda
    const h = horaBR(d);
    return h >= JANELA_LAURA.inicio && h < JANELA_LAURA.fim;
}

export function decidirTriagem(e: EntradaTriagem): DecisaoTriagem {
    if (!e.chaveLigada) return { acao: 'liberar', motivo: 'chave_desligada' };
    if (!e.telefoneValido) return { acao: 'liberar', motivo: 'telefone_invalido' };
    if (e.humanoAssumiu) return { acao: 'liberar', motivo: 'humano_assumiu' };
    if (!e.lauraPodeEnviar) return { acao: 'liberar', motivo: 'laura_indisponivel' };
    const t = e.agora.getTime();

    // Já contatado: a Laura conduz. Só libera se o cliente respondeu e a conversa não fechou.
    if (e.contatoEm) {
        if (e.ultimaDoClienteEm) {
            const h = (t - Date.parse(e.ultimaDoClienteEm)) / 3_600_000;
            if (h >= LIMITE_CLIENTE_SEM_CONCLUSAO_H && !e.lauraRespondeuDepois) return { acao: 'liberar', motivo: 'sem_conclusao' };
            if (!e.nivel && h >= LIMITE_CLIENTE_SEM_CONCLUSAO_H * 4) return { acao: 'liberar', motivo: 'sem_conclusao' };
        }
        // A Laura falou por último e o cliente esfriou: decide pelo nível de interesse.
        const esfriou = e.nivel && e.ultimaMsgEm && (!e.ultimaDoClienteEm || e.lauraRespondeuDepois) ? decidirEsfriou(e) : null;
        if (esfriou) return esfriou;
        if (!e.ultimaDoClienteEm && (t - Date.parse(e.contatoEm)) / 86_400_000 >= LIMITE_SEM_RESPOSTA_DIAS) return { acao: 'liberar', motivo: 'sem_resposta' };
        return { acao: 'esperar', motivo: e.ultimaDoClienteEm ? 'conversa em andamento' : 'aguardando resposta do lead' };
    }

    // O cliente escreveu primeiro e a Laura ainda não respondeu: ela responde na hora, a qualquer hora.
    // Passou de 10 min sem resposta dela → algo falhou: solta o lead (e o consultor assume).
    if (e.clienteIniciou && e.ultimaDoClienteEm) {
        if ((t - Date.parse(e.ultimaDoClienteEm)) / 60_000 > LIMITE_CLIENTE_SEM_LAURA_MIN) return { acao: 'liberar', motivo: 'laura_nao_conseguiu' };
        return { acao: 'esperar', motivo: 'a Laura está respondendo' };
    }

    // Ainda sem contato
    const esperaMin = (t - Date.parse(e.criadoEm)) / 60_000;
    if (!dentroDaJanelaLaura(e.agora)) {
        if (esperaMin > LIMITE_SEM_CONTATO_NOITE_H * 60) return { acao: 'liberar', motivo: 'fora_do_horario_longo' };
        return { acao: 'esperar', motivo: 'fora da janela da Laura (8h às 21h)' };
    }
    // dentro da janela: lead que chegou à noite conta o tempo a partir das 8h
    const inicioJanela = inicioDaJanelaMaisRecente(e.agora);
    const desde = Math.max(Date.parse(e.criadoEm), inicioJanela);
    if ((t - desde) / 60_000 > LIMITE_SEM_CONTATO_MIN) return { acao: 'liberar', motivo: 'laura_nao_conseguiu' };
    return { acao: 'contatar' };
}

/**
 * Plano "esfriou": o cliente conversou com a Laura e parou de responder.
 *   quente → 60 min calado: vai ao consultor (ele liga ou escreve uma vez);
 *   morno  → 2 h calado: lembrete da Laura (na janela 8h-21h); 12 h depois do lembrete sem resposta → consultor;
 *            sem lembrete possível (follow-up desligado ou fora da janela por 6 h) → consultor;
 *   leve   → só a Laura (follow-up de 1, 2, 4 e 10 dias); nada a decidir aqui.
 */
function decidirEsfriou(e: EntradaTriagem): DecisaoTriagem | null {
    const t = e.agora.getTime();
    const silencioMin = (t - Date.parse(e.ultimaMsgEm as string)) / 60_000;
    if (e.nivel === 'quente') return silencioMin >= SILENCIO_QUENTE_MIN ? { acao: 'liberar', motivo: 'esfriou_quente' } : null;
    if (e.nivel !== 'morno') return null;
    if (e.lembreteEm) {
        return (t - Date.parse(e.lembreteEm)) / 3_600_000 >= LEMBRETE_ESPERA_H ? { acao: 'liberar', motivo: 'esfriou_morno' } : null;
    }
    if (silencioMin >= SILENCIO_MORNO_SEM_LEMBRETE_MIN) return { acao: 'liberar', motivo: 'esfriou_morno' };
    if (silencioMin >= SILENCIO_LEMBRETE_MIN) {
        if (!e.lembretePermitido) return { acao: 'liberar', motivo: 'esfriou_morno' };
        if (dentroDaJanelaLaura(e.agora)) return { acao: 'lembrete' };
    }
    return null;
}

// ── nível de interesse ──────────────────────────────────────────────────────

/** Sinais de quem está perto de comprar: pergunta de preço, financiamento, entrada, troca, foto, visita, endereço. */
const SINAL_QUENTE = /(quanto\s+(custa|fica|sai|[eé])|pre[cç]o|valor|parcel|financ|entrada|\btroca|\bfotos?\b|v[ií]deo|visita|ver\s+(o|ele|ela|pessoalmente)|posso\s+(ir|passar)|vou\s+(a[ií]|passar|visitar|ir)|passar\s+(a[ií]|na\s+loja)|endere[cç]o|onde\s+fica|aceit[ao]|[àa]\s+vista|quero\s+(comprar|fechar|ver|esse|ele|ela)|fechar\s+neg[oó]cio|hoje|amanh[ãa])/i;

/**
 * Quente: o selo do Classificador é quente, OU ele deu sinal de compra em pelo menos 2 mensagens.
 * Morno: 3 mensagens ou mais (ou selo morno) sem sinal forte.
 * Leve: o resto (1 ou 2 mensagens, sem informação) e quem a regra oficial manda para "fora do perfil".
 */
export function nivelDeInteresse(p: { falasDoCliente: string[]; selo?: string | null }): NivelInteresse {
    const falas = p.falasDoCliente.map(f => (f || '').trim()).filter(Boolean);
    if (p.selo === 'fora_do_perfil') return 'leve';
    if (p.selo === 'quente') return 'quente';
    if (falas.length >= 2 && falas.some(f => SINAL_QUENTE.test(f))) return 'quente';
    if (falas.length >= 3 || p.selo === 'morno') return 'morno';
    return 'leve';
}

/** Instrução do lembrete do mesmo dia (a Laura segue o prompt de sempre como sistema). */
export function instrucaoLembrete(p: { nome: string | null; carro: string | null; contexto: string }): string {
    const nome = primeiroNome(p.nome);
    return [
        '<tarefa_do_crm>',
        'O cliente conversou com você hoje e parou de responder faz umas horas. Escreva UMA mensagem muito curta e leve para retomar, como alguém que lembrou dele.',
        'Retome o último assunto da conversa (o carro, a dúvida ou o que ficou pendente), sem pressão e sem repetir o que já foi dito.',
        nome ? `Nome: ${nome} (pode usar uma vez).` : 'Você não sabe o nome dele: não invente.',
        p.carro ? `Carro de interesse: ${p.carro}.` : '',
        'Uma frase, no máximo 2. Termine com uma pergunta simples que ele responda com uma palavra. Não cite preço, parcela nem crédito, não prometa nada, no máximo 1 emoji.',
        'Responda só com o texto da mensagem, sem explicar.',
        p.contexto,
        '</tarefa_do_crm>',
    ].filter(Boolean).join('\n');
}

/** 08:00 de Brasília do dia de `d`, em ms UTC. */
export function inicioDaJanelaMaisRecente(d: Date): number {
    const br = new Date(d.getTime() - 3 * 3_600_000);
    return Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate(), JANELA_LAURA.inicio + 3, 0, 0);
}

const primeiroNome = (n: string | null | undefined) => (n || '').trim().split(/\s+/)[0] || '';
const INTERESSE_VAZIO = /^(n[aã]o informado|sem interesse|ve[ií]culo|carro|moto|n\/?a|-+|\?+)?$/i;

export function interesseUtil(v: string | null | undefined): string | null {
    const t = (v || '').replace(/\s+/g, ' ').trim();
    return t && !INTERESSE_VAZIO.test(t) ? t.slice(0, 120) : null;
}

/** Instrução da PRIMEIRA mensagem (a Laura segue o prompt de sempre como sistema). */
export function instrucaoPrimeiroContato(p: { nome: string | null; interesse: string | null; cidade: string | null }): string {
    const nome = primeiroNome(p.nome);
    return [
        '<tarefa_do_crm>',
        'Um cliente pediu informações pelo anúncio da Manos Veículos no Google e deixou o contato. Ele ainda NÃO escreveu no WhatsApp: você vai puxar a conversa.',
        'Escreva UMA mensagem curta de primeiro contato, simpática e natural: cumprimente, diga que é a Laura, da Manos Veículos, e que viu o interesse dele.',
        nome ? `Nome informado no formulário: ${nome} (use uma vez).` : 'O formulário não trouxe um nome confiável: não invente nome e pergunte com quem você fala.',
        p.interesse ? `Carro que ele viu: ${p.interesse}. Cite só isso, sem preço, km nem condições.` : 'O formulário não diz qual carro: pergunte qual carro ele procura.',
        p.cidade ? `Cidade informada: ${p.cidade}.` : '',
        'Termine com UMA pergunta simples e fácil de responder. No máximo 2 frases e 1 emoji. Não prometa nada, não fale de preço, parcela nem crédito.',
        'Responda só com o texto da mensagem, sem explicar.',
        '</tarefa_do_crm>',
    ].filter(Boolean).join('\n');
}

export const ROTULO_LIBERACAO: Record<MotivoLiberacao, string> = {
    qualificado: 'a Laura qualificou o lead',
    pediu_humano: 'o cliente pediu para falar com uma pessoa',
    telefone_invalido: 'telefone do formulário inválido',
    laura_indisponivel: 'a Laura estava indisponível',
    laura_nao_conseguiu: 'a Laura não conseguiu chamar o lead a tempo',
    fora_do_horario_longo: 'lead de madrugada sem contato',
    sem_conclusao: 'o cliente respondeu, mas a conversa não fechou',
    sem_resposta: 'o cliente não respondeu ao contato da Laura nem aos follow-ups',
    humano_assumiu: 'um consultor já assumiu a conversa',
    esfriou_quente: 'o cliente mostrou interesse forte e parou de responder: vale ligar',
    esfriou_morno: 'o cliente parou de responder (a Laura já tentou retomar)',
    chave_desligada: 'triagem desligada',
};

/** Resumo que o consultor lê ANTES de chamar o lead (vai para handoff_summary, acima da ficha). */
export function resumoParaConsultor(p: {
    motivo: MotivoLiberacao; quando: Date; nome: string | null; interesse: string | null; resumoDaLaura: string | null;
    contatado: boolean; respondeu: boolean; lembreteIgnorado?: boolean;
}): string {
    const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    const linhas = [`RESUMO DA LAURA (atendimento inicial, ${fmt.format(p.quando).replace(',', '')})`];
    if (p.nome) linhas.push(`Cliente: ${primeiroNome(p.nome)}`);
    if (p.interesse) linhas.push(`Interesse no anúncio: ${p.interesse}`);
    linhas.push(p.contatado ? (p.respondeu ? 'A Laura conversou com o cliente.' : 'A Laura chamou o cliente e ele ainda não respondeu.') : 'A Laura não chegou a falar com o cliente.');
    if (p.lembreteIgnorado) linhas.push('A Laura mandou um lembrete e ele não respondeu.');
    if (p.resumoDaLaura) linhas.push(`O que ela apurou: ${p.resumoDaLaura}`);
    linhas.push(`Passou para você porque: ${ROTULO_LIBERACAO[p.motivo]}.`);
    return linhas.join('\n').slice(0, 900);
}
