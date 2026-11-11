// src/lib/avisos/historico.ts — histórico dos avisos e cobranças enviados aos consultores
//
// PURO: tipos, rótulos, resumo semanal e CSV. A gravação (registrarAviso) fica em registro.ts.
// Usado pela tela /admin/avisos e pela reunião semanal do Alexandre.

export interface AvisoRegistro {
    id: string;
    criadoEm: string;
    tipo: string;
    consultorNome: string;
    telefone: string | null;
    mensagem: string;
    status: 'enviado' | 'falhou';
    erro: string | null;
    leadRef: string | null;
    origem: string | null;
}

export const ROTULO_TIPO: Record<string, string> = {
    lead_arrival: 'Lead novo',
    morning_brief: 'Resumo da manhã',
    sla_warning: 'Alerta de prazo',
    hot_leak_alert: 'Lead quente em risco',
    cobranca: 'Cobrança',
    precisa_humano: 'Cliente pediu humano',
    lead_qualificado: 'Lead qualificado para pegar',
    pos_atendimento: 'Pós-atendimento',
    teste: 'Teste',
};

export const rotuloTipo = (t: string): string => ROTULO_TIPO[t] || t.replace(/_/g, ' ');

/** Início da semana (segunda 00:00 em Brasília) que contém `d`, em ISO UTC. */
export function inicioDaSemanaBR(d: Date): Date {
    const br = new Date(d.getTime() - 3 * 3_600_000);            // relógio de Brasília (UTC-3 fixo)
    const dow = (br.getUTCDay() + 6) % 7;                        // segunda = 0
    const seg = Date.UTC(br.getUTCFullYear(), br.getUTCMonth(), br.getUTCDate() - dow, 3, 0, 0); // 00:00 BR = 03:00 UTC
    return new Date(seg);
}

export interface ResumoConsultor { consultor: string; total: number; enviados: number; falhas: number; porTipo: Record<string, number> }
export interface ResumoSemana {
    inicio: string; fim: string;
    total: number; enviados: number; falhas: number; cobrancas: number;
    porTipo: Record<string, number>;
    porConsultor: ResumoConsultor[];
}

export function resumirSemana(avisos: AvisoRegistro[], inicio: Date): ResumoSemana {
    const fim = new Date(inicio.getTime() + 7 * 86_400_000);
    const da = avisos.filter(a => { const t = Date.parse(a.criadoEm); return t >= inicio.getTime() && t < fim.getTime(); });
    const porTipo: Record<string, number> = {};
    const porC = new Map<string, ResumoConsultor>();
    for (const a of da) {
        porTipo[a.tipo] = (porTipo[a.tipo] || 0) + 1;
        const c = porC.get(a.consultorNome) || { consultor: a.consultorNome, total: 0, enviados: 0, falhas: 0, porTipo: {} };
        c.total++; if (a.status === 'enviado') c.enviados++; else c.falhas++;
        c.porTipo[a.tipo] = (c.porTipo[a.tipo] || 0) + 1;
        porC.set(a.consultorNome, c);
    }
    return {
        inicio: inicio.toISOString(), fim: fim.toISOString(),
        total: da.length, enviados: da.filter(a => a.status === 'enviado').length, falhas: da.filter(a => a.status === 'falhou').length,
        cobrancas: porTipo.cobranca || 0,
        porTipo,
        porConsultor: [...porC.values()].sort((a, b) => b.total - a.total),
    };
}

const aspas = (v: string) => `"${v.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;

/** CSV para planilha (abre direto no Excel em português: separador ";" e BOM). */
export function paraCsv(avisos: AvisoRegistro[]): string {
    const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
    const linhas = [['Data', 'Consultor', 'Tipo', 'Situação', 'Mensagem', 'Erro', 'Lead'].map(aspas).join(';')];
    for (const a of avisos) {
        linhas.push([fmt.format(new Date(a.criadoEm)).replace(',', ''), a.consultorNome, rotuloTipo(a.tipo), a.status === 'enviado' ? 'Enviado' : 'Falhou', a.mensagem, a.erro || '', a.leadRef || ''].map(aspas).join(';'));
    }
    return '﻿' + linhas.join('\r\n');
}
