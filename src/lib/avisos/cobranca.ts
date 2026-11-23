// src/lib/avisos/cobranca.ts — cobrança do consultor quando o cliente fica esperando (PURO)
//
// Fase 3 do time de agentes (11/11/2026). Regra simples e conferível:
//   "cliente esperando" começa quando a Laura passa o cliente ao consultor, ou quando o cliente
//   escreve numa conversa que está com o consultor, e termina quando um humano da loja responde.
//   Depois de 10 min sem resposta → aviso ao consultor (nível 1);
//   depois de 30 min → aviso ao consultor E ao Alexandre (nível 2);
//   depois de 120 min → aviso ao Alexandre (nível 3).
// Só no horário da loja, só espera que começou nas últimas 24 h (atraso antigo vai para a
// reunião semanal, não vira enxurrada de aviso) e cada nível sai uma vez por espera.

import { ehSoConfirmacao } from '@/lib/whatsapp/ia/regras';

export const NIVEIS_MIN = [10, 30, 120] as const;
export const MAX_ESPERA_H = 24;

export interface MsgCobranca { autor: string; criadaEm: string; texto?: string | null }

// ── atendimento no particular ───────────────────────────────────────────────
// Quando o consultor escreve "te chamei no meu número particular", a conversa saiu do CRM:
// não tem sentido cobrar "cliente esperando" (a resposta está acontecendo fora daqui).
// Em vez disso, depois de RETORNO_PARTICULAR_H horas a Laura pergunta ao consultor como ficou.
export const RETORNO_PARTICULAR_H = 4;
export const MAX_RETORNO_PARTICULAR_H = 48;

const MENCAO_PRIVADO = /particular|(no|pelo|do|em) meu (n[uú]mero|whats(app)?|zap|celular|contato|pessoal)|n[uú]mero pessoal|whats(app)? pessoal/i;
const VERBO_CONTATO = /cham|mand|escrev|fal|entr|cheg|retorn|cont[aeá]t|ligu|ligo|liga|envi/i;

/** A mensagem do consultor avisa que o atendimento continua fora do CRM (número particular)? */
export function ehAvisoDePrivado(texto: string | null | undefined): boolean {
    const t = (texto || '').trim();
    return t.length > 0 && MENCAO_PRIVADO.test(t) && VERBO_CONTATO.test(t);
}

/** Hora da última mensagem do vendedor avisando o particular. Vale só se a Laura não passou o cliente de novo depois. */
export function ultimoParticularEm(msgs: MsgCobranca[], passagemEm: string | null): string | null {
    const p = msgs.filter(m => m.autor === 'vendedor' && ehAvisoDePrivado(m.texto)).map(m => m.criadaEm).sort().pop() ?? null;
    if (!p) return null;
    if (passagemEm && passagemEm > p) return null;
    return p;
}

export interface EntradaRetornoParticular {
    status: string | null;
    temConsultor: boolean;
    msgs: MsgCobranca[];
    passagemEm: string | null;
    /** Já mandei a pergunta "como ficou?" depois deste aviso de particular. */
    jaPerguntou: boolean;
    lojaAberta: boolean;
    agora: Date;
}

export type DecisaoRetornoParticular =
    | { acao: 'perguntar'; particularEm: string; horas: number }
    | { acao: 'pular'; motivo: string };

/** Passadas ~4 h do aviso de particular, pergunta ao consultor o que aconteceu (uma vez só). */
export function decidirRetornoParticular(e: EntradaRetornoParticular): DecisaoRetornoParticular {
    const pula = (motivo: string): DecisaoRetornoParticular => ({ acao: 'pular', motivo });
    if (e.status === 'encerrada') return pula('conversa arquivada');
    if (!e.temConsultor) return pula('sem consultor responsável');
    const p = ultimoParticularEm(e.msgs, e.passagemEm);
    if (!p) return pula('sem aviso de particular');
    if (e.msgs.some(m => m.autor === 'vendedor' && m.criadaEm > p)) return pula('consultor voltou a escrever na conversa');
    const horas = (e.agora.getTime() - Date.parse(p)) / 3_600_000;
    if (horas < RETORNO_PARTICULAR_H) return pula('ainda dentro das 4 h do particular');
    if (horas > MAX_RETORNO_PARTICULAR_H) return pula('particular antigo demais');
    if (e.jaPerguntou) return pula('retorno do particular já perguntado');
    if (!e.lojaAberta) return pula('fora do horário da loja');
    return { acao: 'perguntar', particularEm: p, horas: Math.floor(horas) };
}

export function textoDoRetornoParticular(p: { cliente: string | null; carro: string | null; particularEm: string; horas: number; link: string }): string {
    const quem = (p.cliente || '').trim().split(/\s+/)[0] || 'o cliente';
    const carro = p.carro ? ` (${p.carro})` : '';
    const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(p.particularEm)).replace(':', 'h');
    return `📞 *E o ${quem}${carro}, como ficou?*\nVocê chamou no particular às ${hora} (há ${p.horas} h). O que aconteceu na conversa? Visita marcada, proposta, perdeu?\n👉 Atualize o lead: ${p.link}`;
}

export interface EntradaCobranca {
    status: string | null;
    temConsultor: boolean;
    msgs: MsgCobranca[];
    /** Quando a Laura passou o cliente ao consultor (execução com passagem, ou leitura do Analista). */
    passagemEm: string | null;
    /** Níveis (1..3) que já foram avisados DEPOIS do início desta espera. */
    niveisJaEnviados: number[];
    lojaAberta: boolean;
    agora: Date;
}

export type DecisaoCobranca =
    | { acao: 'avisar'; nivel: 1 | 2 | 3; esperaDesde: string; minutos: number; avisarConsultor: boolean; avisarGestor: boolean }
    | { acao: 'pular'; motivo: string };

/** Desde quando o cliente espera a loja? null = ninguém esperando. */
export function esperaDesde(msgs: MsgCobranca[], passagemEm: string | null, status: string | null): string | null {
    const o = msgs.slice().sort((a, b) => a.criadaEm.localeCompare(b.criadaEm));
    const ult = o[o.length - 1];
    if (!ult) return null;
    const ultVendedor = [...o].reverse().find(m => m.autor === 'vendedor')?.criadaEm ?? null;

    // 1) A Laura passou o cliente e nenhum humano escreveu depois
    if (passagemEm && (!ultVendedor || ultVendedor < passagemEm)) {
        return passagemEm;
    }
    // 2) Conversa com o consultor (humano) e o cliente falou por último
    if (status === 'humano' && ult.autor === 'cliente') {
        // a espera começa na primeira mensagem do cliente depois da última resposta da loja
        let inicio = ult.criadaEm;
        let i = o.length - 1;
        const pendentes: MsgCobranca[] = [];
        for (; i >= 0 && o[i].autor === 'cliente'; i--) { inicio = o[i].criadaEm; pendentes.push(o[i]); }
        // Só "👍 / ok / obrigado" depois de uma fala da loja sem pergunta: ninguém está esperando resposta.
        // (Os textos só chegam quando a rodada os lê; sem texto, conta como espera, como antes.)
        const daLoja = i >= 0 ? o[i] : null;
        if (daLoja && daLoja.texto != null && !daLoja.texto.includes('?') && pendentes.every(m => m.texto != null && ehSoConfirmacao(m.texto))) return null;
        return inicio;
    }
    return null;
}

export function decidirCobranca(e: EntradaCobranca): DecisaoCobranca {
    const pula = (motivo: string): DecisaoCobranca => ({ acao: 'pular', motivo });
    if (e.status === 'encerrada') return pula('conversa arquivada');
    if (!e.temConsultor) return pula('sem consultor responsável');
    // Atendimento no particular: só vale enquanto o consultor não volta a escrever na conversa.
    const part = ultimoParticularEm(e.msgs, e.passagemEm);
    if (part && !e.msgs.some(m => m.autor === 'vendedor' && m.criadaEm > part)) return pula('atendimento no particular');
    const desde = esperaDesde(e.msgs, e.passagemEm, e.status);
    if (!desde) return pula('ninguém esperando');
    const min = Math.floor((e.agora.getTime() - Date.parse(desde)) / 60_000);
    if (min > MAX_ESPERA_H * 60) return pula('espera antiga demais (fica para a reunião semanal)');
    if (min < NIVEIS_MIN[0]) return pula('ainda dentro dos 10 minutos');
    if (!e.lojaAberta) return pula('fora do horário da loja');
    const nivel = (min >= NIVEIS_MIN[2] ? 3 : min >= NIVEIS_MIN[1] ? 2 : 1) as 1 | 2 | 3;
    if (e.niveisJaEnviados.some(n => n >= nivel)) return pula('esse nível já foi avisado');
    // Loja reabriu com a espera já longa (passagem de domingo, de noite): o consultor ainda não foi avisado
    // nenhuma vez, então ele recebe também (antes ia só ao Alexandre e o consultor nunca sabia).
    const consultorNuncaAvisado = !e.niveisJaEnviados.length;
    return { acao: 'avisar', nivel, esperaDesde: desde, minutos: min, avisarConsultor: nivel <= 2 || consultorNuncaAvisado, avisarGestor: nivel >= 2 };
}

const primeiroNome = (n: string | null | undefined) => (n || '').trim().split(/\s+/)[0];

export function textoDaCobranca(p: {
    nivel: 1 | 2 | 3; minutos: number; cliente: string | null; carro: string | null; consultor: string | null; link: string; paraGestor: boolean;
}): string {
    const tempo = p.minutos >= 120 ? `${Math.floor(p.minutos / 60)} h` : `${p.minutos} min`;
    const quem = primeiroNome(p.cliente) || 'Cliente';
    const carro = p.carro ? ` (${p.carro})` : '';
    if (p.paraGestor) {
        return `🚨 *${primeiroNome(p.consultor) || 'Consultor'} deixou cliente esperando ${tempo}*\n${quem}${carro}\nNinguém da loja respondeu.\n👉 ${p.link}`;
    }
    return `⏰ *Cliente esperando há ${tempo}*\n${quem}${carro}\n${p.nivel === 1 ? 'A Laura passou para você' : 'Você ainda não respondeu'} e ninguém da loja escreveu.\n👉 Responder agora: ${p.link}`;
}
