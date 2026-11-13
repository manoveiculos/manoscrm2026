// src/lib/avisos/fila.ts — fila de espera dos leads e retorno do cliente (PURO)
//
// Pedido do Alexandre (13/11/2026): o lead novo não vai direto a um consultor nem gira entre eles.
// Ele espera numa fila, todos os consultores disponíveis são avisados, e só UM atende (o primeiro que
// clica em "Iniciar atendimento"). Sem dono em 10 min, lembrete a todos; em 20 min, alerta ao Alexandre.
// E quando o cliente responde a um follow-up da Laura, o consultor responsável é avisado.

export const FILA_LEMBRETE_MIN = 10;
export const FILA_ESCALADA_MIN = 20;

export type AcaoFila = 'avisar' | 'lembrar' | 'escalar' | 'esperar';

export interface EntradaFila {
    status: string;
    avisadaEm: string | null;
    lembreteEm: string | null;
    escalouEm: string | null;
    lojaAberta: boolean;
    agora: Date;
    /** Minutos de loja ABERTA desde o aviso (o relógio não corre de madrugada). */
    minutosAbertosDesdeAviso: number;
}

/** O que fazer com um lead da fila de espera. Só age com a loja aberta. */
export function decidirFila(e: EntradaFila): AcaoFila {
    if (e.status !== 'fila_espera' || !e.lojaAberta) return 'esperar';
    if (!e.avisadaEm) return 'avisar';
    if (e.minutosAbertosDesdeAviso >= FILA_ESCALADA_MIN && !e.escalouEm) return 'escalar';
    if (e.minutosAbertosDesdeAviso >= FILA_LEMBRETE_MIN && !e.lembreteEm) return 'lembrar';
    return 'esperar';
}

export interface Consultor {
    id: string;
    name: string;
    phone: string | null;
    phoneVerificado: boolean;
    ativo: boolean;
    recebeLeads: boolean;
    disponivelEm: string | null;
}

/**
 * Quem recebe o aviso da fila: ativo, recebe leads, com WhatsApp confirmado. Se alguém já bateu o ponto
 * hoje (disponivel_em = hoje), avisa só quem bateu; se ninguém bateu, avisa todos (o lead não pode esperar o check-in).
 */
export function escolherDestinatarios(consultores: Consultor[], hojeISO: string): Consultor[] {
    const aptos = consultores.filter(c => c.ativo && c.recebeLeads && c.phoneVerificado && c.phone);
    const presentes = aptos.filter(c => c.disponivelEm === hojeISO);
    return presentes.length ? presentes : aptos;
}

const primeiro = (n: string | null | undefined) => (n || '').trim().split(/\s+/)[0] || '';

export interface DadosLeadFila { nome: string | null; carro: string | null; origem: string | null; resumo: string | null; link: string }

export function textoFila(d: DadosLeadFila): string {
    const quem = primeiro(d.nome) || 'Cliente novo';
    const carro = d.carro ? ` · ${d.carro}` : '';
    const origem = d.origem ? `\n📡 ${d.origem}` : '';
    const resumo = d.resumo ? `\n🤖 ${d.resumo.replace(/\s+/g, ' ').slice(0, 260)}` : '';
    return `🆕 *LEAD NA FILA DE ESPERA*\n${quem}${carro}${origem}${resumo}\n\n👉 Para atender, abra e clique em *Iniciar atendimento*: ${d.link}\n_O primeiro que clicar leva o lead. Os outros não precisam chamar._`;
}

export function textoLembreteFila(d: DadosLeadFila, minutos: number): string {
    const quem = primeiro(d.nome) || 'Cliente novo';
    return `⏰ *Ninguém pegou ainda* (${minutos} min)\n${quem}${d.carro ? ` · ${d.carro}` : ''}\n👉 ${d.link}\n_Quem puder, clique em *Iniciar atendimento*._`;
}

export function textoEscaladaFila(d: DadosLeadFila, minutos: number): string {
    const quem = primeiro(d.nome) || 'Cliente novo';
    return `🚨 *Lead parado na fila há ${minutos} min*\n${quem}${d.carro ? ` · ${d.carro}` : ''}\nNenhum consultor pegou depois do aviso e do lembrete.\n👉 ${d.link}`;
}

// ── retorno do cliente depois do follow-up ──────────────────────────────────

export interface EntradaRetorno {
    /** Mensagens do cliente, do mais antigo ao mais novo. */
    falasDoCliente: { em: string; texto: string }[];
    /** Hora do follow-up ou lembrete da Laura que está sendo respondido. */
    followupEm: string;
    temConsultor: boolean;
    jaAvisado: boolean;
}

/** O cliente respondeu ao follow-up? Devolve a primeira resposta dele depois do toque da Laura. */
export function respostaAoFollowup(e: EntradaRetorno): { em: string; texto: string } | null {
    if (!e.temConsultor || e.jaAvisado) return null;
    const resp = e.falasDoCliente.slice().sort((a, b) => a.em.localeCompare(b.em)).find(f => f.em > e.followupEm);
    return resp ?? null;
}

export function textoRetorno(p: { cliente: string | null; carro: string | null; texto: string; link: string }): string {
    const quem = primeiro(p.cliente) || 'O cliente';
    const fala = p.texto.replace(/\s+/g, ' ').trim().slice(0, 140);
    return `💬 *${quem} respondeu!*${p.carro ? `\n${p.carro}` : ''}\nDisse: “${fala}”\n\nA Laura tinha chamado ele de novo e ele voltou. Entre na conversa e atenda agora.\n👉 ${p.link}`;
}
