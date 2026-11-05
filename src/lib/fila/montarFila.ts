// src/lib/fila/montarFila.ts — REGRA DA "MINHA FILA" (funções puras)
//
// Recebe o que o servidor leu do banco e devolve as seções na ordem de
// prioridade. Não acessa banco nem rede: roda igual no servidor (/api/fila),
// na prévia com dados fictícios (/dev/fila) e em teste.
//
// Ordem (spec Growth 360, Fase 1). Cada lead aparece UMA vez, na 1ª seção em
// que se encaixa:
//   1. Quente sem resposta (selo Quente + esperando humano há +15 min)
//   2. Visitas de hoje e de amanhã
//   3. Cliente voltou a escrever
//   4. Follow-up vencido (retorno combinado vencido ou cadência D0/1/3/7/15/30)
//   5. Quentes e mornos em conversa
//   6. Recuperável (perdido por falta do carro + carro compatível no estoque)
//   7. Em aberto (sem qualificação / fora do perfil)
//
// Lead só sai da fila com resultado (vendido/perdido) ou com próximo contato
// marcado para depois de amanhã. Quente sem resposta e cliente que voltou
// aparecem mesmo com retorno marcado.

import { etapaDoStatus } from '@/constants/funil';
import { classificarLead, type QualificacaoCampos, type Selo } from '@/lib/qualificacao';

export type SecaoFilaId =
    | 'quente_sem_resposta'
    | 'visitas'
    | 'cliente_voltou'
    | 'followup_vencido'
    | 'em_conversa'
    | 'recuperavel'
    | 'em_aberto';

export const SECOES_FILA: { id: SecaoFilaId; titulo: string; emoji: string; descricao: string }[] = [
    { id: 'quente_sem_resposta', titulo: 'Quente sem resposta', emoji: '🔥', descricao: 'Esperando um humano há mais de 15 min' },
    { id: 'visitas', titulo: 'Visitas de hoje e de amanhã', emoji: '📅', descricao: 'Confirme a visita e deixe o carro pronto' },
    { id: 'cliente_voltou', titulo: 'Cliente voltou a escrever', emoji: '↩️', descricao: 'Escreveu depois do seu último contato — retome antes que esfrie' },
    { id: 'followup_vencido', titulo: 'Follow-up vencido', emoji: '⏰', descricao: 'Retorno combinado ou cadência D0, D1, D3, D7, D15, D30 — os mais novos primeiro' },
    { id: 'em_conversa', titulo: 'Quentes e mornos em conversa', emoji: '🌡️', descricao: 'Avance para a visita' },
    { id: 'recuperavel', titulo: 'Recuperável', emoji: '♻️', descricao: 'Perdido por falta do carro — tem um compatível no estoque' },
    { id: 'em_aberto', titulo: 'Em aberto', emoji: '📋', descricao: 'Sem qualificação ou fora do perfil' },
];

/** Minutos sem resposta humana para um lead Quente ir ao topo. */
export const SLA_QUENTE_MIN = 15;
/** Cadência de follow-up (dias desde o início do atendimento). */
export const CADENCIA_DIAS = [0, 1, 3, 7, 15, 30] as const;
/** Janela do "cliente voltou" e da recuperação. */
const VOLTOU_JANELA_DIAS = 3;
const RECUPERAVEL_JANELA_DIAS = 90;
/** Motivos de perda que contam como "faltou o carro". 'modelo' é o slug antigo. */
export const MOTIVOS_RECUPERAVEIS = ['carro_fora_estoque', 'modelo'];

const MIN = 60_000;
const DIA = 86_400_000;

export interface LeadFila {
    uid: string;
    table: string;
    nativeId: string;
    nome: string | null;
    telefone: string | null;
    carro: string | null;
    status: string | null;
    criadoEm: string | null;
    atendimentoIniciadoEm: string | null;
    ultimaInteracaoHumana: string | null;
    primeiroContatoEm: string | null;
    primeiroContatoCanal: string | null;
    /** null = tabela sem os 4 campos de qualificação. */
    qualificacao: QualificacaoCampos | null;
    /** ORIENTAÇÃO gravada pelo next-steps (Elite Closer), se recente. */
    orientacaoIA: string | null;
    /** Só para perdidos (recuperável). */
    motivoPerda?: string | null;
    perdidoEm?: string | null;
}

export interface MensagemFila {
    texto: string;
    autor: 'cliente' | 'laura';
    em: string;
}

export interface ConversaResumo {
    ultima: MensagemFila | null;
    /** Última mensagem escrita pelo cliente (para saber se ele espera resposta). */
    ultimaDoClienteEm: string | null;
}

export interface VisitaFila {
    id: string;
    leadUid: string | null;
    clienteNome: string | null;
    telefone: string | null;
    veiculo: string | null;
    dataHora: string;
    tipo: string | null;
    status: string;
}

export interface RetornoFila {
    id: string;
    leadUid: string;
    quando: string;
    nota: string | null;
}

export interface VoltouFila {
    leadUid: string;
    em: string;
    texto: string | null;
}

export interface ItemEstoque {
    marca: string | null;
    modelo: string | null;
    ano: string | null;
    preco: string | null;
}

export interface EntradaFila {
    agora: number;
    pisoEstoque: number | null;
    leads: LeadFila[];
    perdidos: LeadFila[];
    estoque: ItemEstoque[];
    visitas: VisitaFila[];
    retornos: RetornoFila[];
    voltou: VoltouFila[];
    conversas: Record<string, ConversaResumo>;
}

export interface CardFila {
    /** null = visita sem lead ligado (criada à mão na agenda). */
    uid: string | null;
    table: string | null;
    nativeId: string | null;
    secao: SecaoFilaId;
    nome: string;
    telefone: string | null;
    carro: string | null;
    selo: Selo | null;
    seloMotivo: string | null;
    /** Por que está na fila, em uma frase curta. */
    motivo: string;
    /** Desde quando vale o motivo (para "há 42 min"). */
    desde: string | null;
    ultimaMensagem: MensagemFila | null;
    visita: { dataHora: string; tipo: string | null } | null;
    carroCompativel: string | null;
    orientacaoIA: string | null;
    /** Lead ativo ou perdido recuperável aceita resultado; visita sem lead, não. */
    podeResultado: boolean;
}

export interface SecaoFila {
    id: SecaoFilaId;
    titulo: string;
    emoji: string;
    descricao: string;
    cards: CardFila[];
}

export interface Fila {
    secoes: SecaoFila[];
    total: number;
    /** Leads fora da fila porque têm próximo contato marcado para depois de amanhã. */
    agendadosDepois: number;
    proximoPasso: { texto: string; uid: string | null; nome: string } | null;
}

// ── utilidades de data (horário de Brasília, UTC-3 fixo como o resto do CRM) ──

const ms = (iso: string | null | undefined): number | null => {
    if (!iso) return null;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? t : null;
};

/** Dia do calendário em Brasília (número de dias desde 1970). */
const diaBRT = (t: number) => Math.floor((t - 3 * 3_600_000) / DIA);

export function horaBRT(iso: string): string {
    const d = new Date(new Date(iso).getTime() - 3 * 3_600_000);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

export function dataCurtaBRT(iso: string): string {
    const d = new Date(new Date(iso).getTime() - 3 * 3_600_000);
    return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "agora", "12 min", "3 h", "2 dias". */
export function tempoDesde(iso: string | null | undefined, agora: number): string {
    const t = ms(iso);
    if (t == null) return '';
    const min = Math.max(0, Math.floor((agora - t) / MIN));
    if (min < 1) return 'agora';
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h} h`;
    const d = Math.floor(h / 24);
    return d === 1 ? '1 dia' : `${d} dias`;
}

function quandoRelativo(iso: string, agora: number): string {
    const dif = diaBRT(ms(iso)!) - diaBRT(agora);
    const hora = horaBRT(iso);
    if (dif === 0) return `hoje ${hora}`;
    if (dif === 1) return `amanhã ${hora}`;
    if (dif === -1) return `ontem ${hora}`;
    return `${dataCurtaBRT(iso)} ${hora}`;
}

// ── regras ───────────────────────────────────────────────────────────────

/** Último contato humano conhecido (a IA não conta). */
export function ultimoHumano(l: LeadFila): number | null {
    const a = ms(l.ultimaInteracaoHumana);
    const b = l.primeiroContatoCanal !== 'ai_sdr' ? ms(l.primeiroContatoEm) : null;
    if (a == null) return b;
    if (b == null) return a;
    return Math.max(a, b);
}

/**
 * Desde quando o cliente espera um humano, ou null se já foi respondido.
 * Mesma ideia do alerta de 15 min (alertaQuente.ts): última mensagem do
 * cliente sem contato humano depois; sem conversa, nenhum contato humano.
 */
export function esperandoHumanoDesde(l: LeadFila, conversa: ConversaResumo | undefined): number | null {
    const humano = ultimoHumano(l);
    const cliente = ms(conversa?.ultimaDoClienteEm);
    if (cliente != null && (humano == null || cliente > humano)) return cliente;
    if (humano == null) return ms(l.criadoEm);
    return null;
}

/** Marco da cadência vencido (D0…D30) sem contato humano depois dele. */
export function cadenciaVencida(l: LeadFila, agora: number): { marco: number; em: number } | null {
    const ref = ms(l.atendimentoIniciadoEm) ?? ms(l.criadoEm);
    if (ref == null) return null;
    const dias = (agora - ref) / DIA;
    let marco: number | null = null;
    for (const d of CADENCIA_DIAS) if (dias >= d) marco = d;
    if (marco == null) return null;
    const em = ref + marco * DIA;
    // D0 só vence depois do prazo do 1º atendimento.
    if (marco === 0 && agora - em < SLA_QUENTE_MIN * MIN) return null;
    const humano = ultimoHumano(l);
    if (humano != null && humano >= em) return null;
    return { marco, em };
}

const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const tokens = (s: string | null | undefined) => normalizar(s || '').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(t => t.length >= 2);

/** Carro do estoque cujo modelo aparece no interesse do lead ("Onix 2019" ↔ "ONIX LT 1.0"). */
export function carroCompativel(interesse: string | null | undefined, estoque: ItemEstoque[]): string | null {
    const ti = new Set(tokens(interesse));
    if (ti.size === 0) return null;
    for (const c of estoque) {
        const chave = tokens(c.modelo)[0];
        if (!chave || chave.length < 2 || /^\d+$/.test(chave)) continue;
        if (ti.has(chave)) {
            return [c.marca, c.modelo, c.ano].filter(Boolean).join(' ') + (c.preco ? ` · ${c.preco}` : '');
        }
    }
    return null;
}

/** Primeira frase da ORIENTAÇÃO do next-steps, no máximo 160 caracteres. */
export function orientacaoCurta(texto: string | null | undefined): string | null {
    const t = (texto || '').replace(/\s+/g, ' ').trim();
    if (!t) return null;
    const frase = t.split(/(?<=[.!?])\s/)[0] || t;
    return frase.length > 160 ? frase.slice(0, 157).trimEnd() + '…' : frase;
}

function primeiroNome(nome: string | null | undefined): string {
    const n = (nome || '').trim().split(/\s+/)[0];
    return n || 'o cliente';
}

export function montarFila(e: EntradaFila): Fila {
    const { agora } = e;
    const hoje = diaBRT(agora);

    // Visitas e retornos indexados por lead.
    const visitasPorLead = new Map<string, VisitaFila[]>();
    const visitasSemLead: VisitaFila[] = [];
    for (const v of e.visitas) {
        if (!['agendado', 'confirmado'].includes(v.status)) continue;
        if (v.leadUid) (visitasPorLead.get(v.leadUid) || visitasPorLead.set(v.leadUid, []).get(v.leadUid)!).push(v);
        else visitasSemLead.push(v);
    }
    for (const lista of visitasPorLead.values()) lista.sort((a, b) => ms(a.dataHora)! - ms(b.dataHora)!);

    const retornosPorLead = new Map<string, RetornoFila[]>();
    for (const r of e.retornos) (retornosPorLead.get(r.leadUid) || retornosPorLead.set(r.leadUid, []).get(r.leadUid)!).push(r);
    for (const lista of retornosPorLead.values()) lista.sort((a, b) => ms(a.quando)! - ms(b.quando)!);

    const voltouPorLead = new Map<string, VoltouFila>();
    for (const v of e.voltou) {
        const t = ms(v.em);
        if (t == null || agora - t > VOLTOU_JANELA_DIAS * DIA) continue;
        const atual = voltouPorLead.get(v.leadUid);
        if (!atual || ms(atual.em)! < t) voltouPorLead.set(v.leadUid, v);
    }

    const porSecao = new Map<SecaoFilaId, { card: CardFila; ordem: number }[]>(SECOES_FILA.map(s => [s.id, []]));
    const por = (id: SecaoFilaId, card: CardFila, ordem: number) => porSecao.get(id)!.push({ card, ordem });
    let agendadosDepois = 0;

    const cardBase = (l: LeadFila, secao: SecaoFilaId, motivo: string, desde: number | null): CardFila => {
        const q = l.qualificacao ? classificarLead(l.qualificacao, e.pisoEstoque) : null;
        return {
            uid: l.uid,
            table: l.table,
            nativeId: l.nativeId,
            secao,
            nome: (l.nome || '').trim() || 'Sem nome',
            telefone: l.telefone,
            carro: (l.qualificacao?.vehicle_interest || l.carro || '').trim() || null,
            selo: q?.selo ?? null,
            seloMotivo: q?.motivo ?? null,
            motivo,
            desde: desde != null ? new Date(desde).toISOString() : null,
            ultimaMensagem: e.conversas[l.uid]?.ultima ?? null,
            visita: null,
            carroCompativel: null,
            orientacaoIA: l.orientacaoIA,
            podeResultado: true,
        };
    };

    // ── Leads ativos ──────────────────────────────────────────────────────
    for (const l of e.leads) {
        const etapa = etapaDoStatus(l.status);
        if (etapa === 'vendido' || etapa === 'perdido') continue;

        const conversa = e.conversas[l.uid];
        const q = l.qualificacao ? classificarLead(l.qualificacao, e.pisoEstoque) : null;
        const humano = ultimoHumano(l);

        // 1. Quente sem resposta
        const espera = esperandoHumanoDesde(l, conversa);
        if (q?.selo === 'quente' && espera != null && agora - espera > SLA_QUENTE_MIN * MIN) {
            por('quente_sem_resposta', cardBase(l, 'quente_sem_resposta', `Esperando resposta há ${tempoDesde(new Date(espera).toISOString(), agora)}`, espera), espera);
            continue;
        }

        // 3 (antes do corte de "agendado"). Cliente que voltou passa na frente do retorno marcado.
        // Duas fontes: o alerta cliente_voltou, ou a conversa com a Laura — o
        // cliente escreveu nos últimos 3 dias DEPOIS do último contato humano.
        // (Ensaio de 05/11: 71 de 185 leads tinham cliente escrevendo depois do
        // vendedor e ficavam enterrados no follow-up.) Lead que nunca teve
        // contato humano fica no D0 ("1º contato pendente").
        const voltou = voltouPorLead.get(l.uid);
        const alertaT = voltou ? ms(voltou.em)! : null;
        const clienteT = ms(conversa?.ultimaDoClienteEm);
        const escreveuDepois = humano != null && clienteT != null && clienteT > humano && agora - clienteT <= VOLTOU_JANELA_DIAS * DIA;
        const alertaPendente = alertaT != null && (humano == null || humano < alertaT);
        const voltouT = alertaPendente ? alertaT : escreveuDepois ? clienteT : null;
        const voltouPendente = voltouT != null;

        // 2. Visita hoje/amanhã
        const visitas = visitasPorLead.get(l.uid) || [];
        const visitaProxima = visitas.find(v => {
            const d = diaBRT(ms(v.dataHora)!) - hoje;
            return d === 0 || d === 1;
        });
        if (visitaProxima) {
            const card = cardBase(l, 'visitas', `Visita ${quandoRelativo(visitaProxima.dataHora, agora)}${visitaProxima.tipo === 'externa' ? ' (externa)' : ''}`, ms(visitaProxima.dataHora));
            card.visita = { dataHora: visitaProxima.dataHora, tipo: visitaProxima.tipo };
            por('visitas', card, ms(visitaProxima.dataHora)!);
            continue;
        }

        if (voltouPendente) {
            const quando = new Date(voltouT!).toISOString();
            por('cliente_voltou', cardBase(l, 'cliente_voltou', `Voltou a escrever há ${tempoDesde(quando, agora)}`, voltouT), voltouT!);
            continue;
        }

        // Próximo contato marcado para depois de amanhã → sai da fila até a data.
        const retornos = retornosPorLead.get(l.uid) || [];
        const retornoFuturo = retornos.find(r => ms(r.quando)! > agora);
        const visitaFutura = visitas.find(v => diaBRT(ms(v.dataHora)!) - hoje > 1);
        if (retornoFuturo || visitaFutura) {
            agendadosDepois++;
            continue;
        }

        // 4. Follow-up vencido: retorno combinado que venceu, ou cadência.
        const retornoVencido = [...retornos].reverse().find(r => {
            const t = ms(r.quando)!;
            return t <= agora && (humano == null || humano < t);
        });
        if (retornoVencido) {
            const t = ms(retornoVencido.quando)!;
            por('followup_vencido', cardBase(l, 'followup_vencido', `Retorno combinado para ${quandoRelativo(retornoVencido.quando, agora)}`, t), t);
            continue;
        }
        const cad = cadenciaVencida(l, agora);
        if (cad) {
            const motivo = cad.marco === 0
                ? 'D0 — 1º contato pendente'
                : `D${cad.marco} — sem contato ${humano != null ? `desde ${dataCurtaBRT(new Date(humano).toISOString())}` : 'humano'}`;
            // Ordem: retorno combinado primeiro; depois o marco mais recente
            // (D0, D1, D3… — lead novo converte mais); no mesmo marco, o mais atrasado.
            const ordem = (CADENCIA_DIAS.indexOf(cad.marco as typeof CADENCIA_DIAS[number]) + 1) * 1e13 + cad.em;
            por('followup_vencido', cardBase(l, 'followup_vencido', motivo, cad.em), ordem);
            continue;
        }

        // 5. Em conversa (morno, ou quente já respondido)
        if (q?.selo === 'quente' || q?.selo === 'morno') {
            const ult = ms(conversa?.ultima?.em) ?? humano ?? ms(l.criadoEm) ?? agora;
            const motivo = q.selo === 'quente' ? 'Quente — já respondido' : (q.motivo || 'Morno');
            // Quente antes de morno; dentro de cada um, quem está parado há mais tempo primeiro.
            por('em_conversa', cardBase(l, 'em_conversa', motivo, ult), (q.selo === 'quente' ? 0 : 1e15) + ult);
            continue;
        }

        // 7. Em aberto
        const criado = ms(l.criadoEm) ?? agora;
        const motivo = q?.selo === 'fora_do_perfil' ? (q.motivo || 'Fora do perfil') : q?.selo === 'sem_qualificacao' ? 'Falta qualificar (entrada, troca, prazo)' : 'Em aberto';
        por('em_aberto', cardBase(l, 'em_aberto', motivo, criado), -criado);
    }

    // ── Visitas sem lead ligado (criadas direto na agenda) ────────────────
    for (const v of visitasSemLead) {
        const d = diaBRT(ms(v.dataHora)!) - hoje;
        if (d !== 0 && d !== 1) continue;
        por('visitas', {
            uid: null, table: null, nativeId: null, secao: 'visitas',
            nome: (v.clienteNome || '').trim() || 'Sem nome',
            telefone: v.telefone, carro: v.veiculo, selo: null, seloMotivo: null,
            motivo: `Visita ${quandoRelativo(v.dataHora, agora)}${v.tipo === 'externa' ? ' (externa)' : ''}`,
            desde: v.dataHora, ultimaMensagem: null,
            visita: { dataHora: v.dataHora, tipo: v.tipo },
            carroCompativel: null, orientacaoIA: null, podeResultado: false,
        }, ms(v.dataHora)!);
    }

    // ── 6. Recuperável ────────────────────────────────────────────────────
    for (const l of e.perdidos) {
        if (!MOTIVOS_RECUPERAVEIS.includes((l.motivoPerda || '').toLowerCase())) continue;
        const perdido = ms(l.perdidoEm);
        if (perdido == null || agora - perdido > RECUPERAVEL_JANELA_DIAS * DIA) continue;
        if ((retornosPorLead.get(l.uid) || []).some(r => ms(r.quando)! > agora)) { agendadosDepois++; continue; }
        const compativel = carroCompativel(l.qualificacao?.vehicle_interest || l.carro, e.estoque);
        if (!compativel) continue;
        const card = cardBase(l, 'recuperavel', `Perdido em ${dataCurtaBRT(l.perdidoEm!)} por falta do carro`, perdido);
        card.carroCompativel = compativel;
        por('recuperavel', card, -perdido);
    }

    const secoes: SecaoFila[] = SECOES_FILA.map(s => ({
        ...s,
        cards: porSecao.get(s.id)!.sort((a, b) => a.ordem - b.ordem).map(x => x.card),
    }));
    const total = secoes.reduce((n, s) => n + s.cards.length, 0);
    const primeiro = secoes.find(s => s.cards.length)?.cards[0] || null;

    return { secoes, total, agendadosDepois, proximoPasso: primeiro ? proximoPasso(primeiro, agora) : null };
}

/** "Próximo passo" do topo: a orientação da IA, se houver, ou a regra do card. */
export function proximoPasso(c: CardFila, agora: number): { texto: string; uid: string | null; nome: string } {
    const nome = primeiroNome(c.nome);
    const ia = orientacaoCurta(c.orientacaoIA);
    let texto: string;
    switch (c.secao) {
        case 'quente_sem_resposta':
            texto = `Responda ${nome} agora: lead quente esperando há ${tempoDesde(c.desde, agora)}.`;
            break;
        case 'visitas':
            texto = `Confirme a visita de ${nome} (${c.visita ? quandoRelativo(c.visita.dataHora, agora) : ''}).`;
            break;
        case 'cliente_voltou':
            texto = `${nome} voltou a escrever. Retome a conversa.`;
            break;
        case 'followup_vencido':
            texto = c.motivo.startsWith('D0') ? `Faça o 1º contato com ${nome}.` : `Faça o follow-up com ${nome} (${c.motivo}).`;
            break;
        case 'em_conversa':
            texto = `Avance ${nome}: proponha um horário de visita.`;
            break;
        case 'recuperavel':
            texto = `Avise ${nome}: chegou ${c.carroCompativel?.split(' · ')[0] || 'um carro compatível'}.`;
            break;
        default:
            texto = `Qualifique ${nome}: pergunte entrada, troca e prazo.`;
    }
    return { texto: ia ? `${texto} IA: ${ia}` : texto, uid: c.uid, nome: c.nome };
}
