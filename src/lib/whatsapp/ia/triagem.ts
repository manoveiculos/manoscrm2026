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
    | 'chave_desligada';          // a triagem foi desligada: tudo que está preso sai

export type DecisaoTriagem =
    | { acao: 'contatar' }
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
            if (h >= LIMITE_CLIENTE_SEM_CONCLUSAO_H * 4) return { acao: 'liberar', motivo: 'sem_conclusao' };
        }
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
    chave_desligada: 'triagem desligada',
};

/** Resumo que o consultor lê ANTES de chamar o lead (vai para handoff_summary, acima da ficha). */
export function resumoParaConsultor(p: {
    motivo: MotivoLiberacao; quando: Date; nome: string | null; interesse: string | null; resumoDaLaura: string | null;
    contatado: boolean; respondeu: boolean;
}): string {
    const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
    const linhas = [`RESUMO DA LAURA (atendimento inicial, ${fmt.format(p.quando).replace(',', '')})`];
    if (p.nome) linhas.push(`Cliente: ${primeiroNome(p.nome)}`);
    if (p.interesse) linhas.push(`Interesse no anúncio: ${p.interesse}`);
    linhas.push(p.contatado ? (p.respondeu ? 'A Laura conversou com o cliente.' : 'A Laura chamou o cliente e ele ainda não respondeu.') : 'A Laura não chegou a falar com o cliente.');
    if (p.resumoDaLaura) linhas.push(`O que ela apurou: ${p.resumoDaLaura}`);
    linhas.push(`Passou para você porque: ${ROTULO_LIBERACAO[p.motivo]}.`);
    return linhas.join('\n').slice(0, 900);
}
