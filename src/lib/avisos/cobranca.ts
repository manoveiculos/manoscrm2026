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

export const NIVEIS_MIN = [10, 30, 120] as const;
export const MAX_ESPERA_H = 24;

export interface MsgCobranca { autor: string; criadaEm: string }

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
        for (let i = o.length - 1; i >= 0 && o[i].autor === 'cliente'; i--) inicio = o[i].criadaEm;
        return inicio;
    }
    return null;
}

export function decidirCobranca(e: EntradaCobranca): DecisaoCobranca {
    const pula = (motivo: string): DecisaoCobranca => ({ acao: 'pular', motivo });
    if (e.status === 'encerrada') return pula('conversa arquivada');
    if (!e.temConsultor) return pula('sem consultor responsável');
    const desde = esperaDesde(e.msgs, e.passagemEm, e.status);
    if (!desde) return pula('ninguém esperando');
    const min = Math.floor((e.agora.getTime() - Date.parse(desde)) / 60_000);
    if (min > MAX_ESPERA_H * 60) return pula('espera antiga demais (fica para a reunião semanal)');
    if (min < NIVEIS_MIN[0]) return pula('ainda dentro dos 10 minutos');
    if (!e.lojaAberta) return pula('fora do horário da loja');
    const nivel = (min >= NIVEIS_MIN[2] ? 3 : min >= NIVEIS_MIN[1] ? 2 : 1) as 1 | 2 | 3;
    if (e.niveisJaEnviados.some(n => n >= nivel)) return pula('esse nível já foi avisado');
    return { acao: 'avisar', nivel, esperaDesde: desde, minutos: min, avisarConsultor: nivel <= 2, avisarGestor: nivel >= 2 };
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
