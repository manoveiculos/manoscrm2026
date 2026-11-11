// src/lib/agentes/estado.ts — ESTADO DOS AGENTES (função pura, testável sem navegador)
//
// REGRA DE OURO: nada de atividade falsa. Tudo aqui sai de registros reais que
// o servidor leu do banco. Sem registro recente → "ocioso". Desligado →
// "desligado". Modo ensaio → etiqueta ENSAIO.
//
// Estado (o primeiro que valer):
//   desligado   — agentes_config desligado; IA geral desligada (agentes de IA);
//                 Laura: botão dela desligado e nenhuma resposta do n8n em 24 h
//   erro        — as 3 últimas execuções terminaram em erro
//   trabalhando — execução aberta (status rodando) há menos de 2 min
//   aguardando  — tem aprovação esperando o Alexandre
//   ocioso      — o resto

import { AGENTES, ID_IA_GERAL, type AgenteCatalogo, type Arco } from './catalogo';
import type { PainelTelao } from './painel';

export type EstadoAgente = 'trabalhando' | 'ocioso' | 'aguardando' | 'erro' | 'desligado';
export type ModoAgente = 'ligado' | 'ensaio' | 'desligado';
export type StatusRegistro = 'rodando' | 'ok' | 'erro' | 'aguardando' | 'decidido' | 'pulada';

/** O que a cena do escritório faz quando este registro chega (só registros reais têm evento). */
export type EventoRegistro =
    | { tipo: 'lead_distribuido'; para?: string; nome?: string; carro?: string }
    | { tipo: 'fala' }
    | { tipo: 'lead_quente'; texto?: string }
    | { tipo: 'venda' }
    | { tipo: 'aprovacao' }
    | { tipo: 'erro' };

export interface RegistroAgente {
    /** Identificador estável do registro (tabela:id) — o escritório só anima ids que ainda não viu. */
    id?: string;
    evento?: EventoRegistro;
    agenteId: string;
    /** Início (ISO). */
    em: string;
    fimEm?: string | null;
    status: StatusRegistro;
    /** Frase curta. Dado de cliente: no máximo o primeiro nome e o carro. */
    frase: string;
    custoUsd?: number | null;
    duracaoMs?: number | null;
    /** Rotina repetitiva (ex.: varredura de SLA a cada 5 min) não entra no feed. */
    noFeed?: boolean;
    link?: string | null;
}

export interface ConfigAgente {
    modo: ModoAgente;
    alteradoEm?: string | null;
    alteradoPor?: string | null;
}

export type TipoDecisao = 'aprovacao' | 'conversa_sem_dono' | 'alerta';

export interface ItemDecisao {
    id: string;
    tipo: TipoDecisao;
    titulo: string;
    detalhe?: string | null;
    em: string;
    agenteId?: string | null;
    link?: string | null;
}

export interface EntradaAgentes {
    agora: number;
    registros: RegistroAgente[];
    /** agentes_config (vazio enquanto a tabela não existe). */
    configs: Record<string, ConfigAgente>;
    /** A tabela agentes_config existe (migration aplicada)? */
    configInstalada: boolean;
    /** Botão da Laura no CRM (wa_ia_config.modo). */
    modoLaura: 'desligada' | 'ensaio' | 'envia' | null;
    decisoes: ItemDecisao[];
}

export interface AgenteVisao {
    id: string;
    nome: string;
    arco: Arco;
    funcao: string;
    icone: string;
    ia: boolean;
    estado: EstadoAgente;
    modo: ModoAgente;
    etiqueta: 'ENSAIO' | null;
    frase: string;
    ultimaAcaoEm: string | null;
    execucoes24h: number;
    erros24h: number;
    custoHojeUsd: number | null;
    aguardandoVoce: number;
    /** Últimas 20 ações (mais nova primeiro) — gaveta. */
    acoes: RegistroAgente[];
    /** Explicação curta quando o estado não é óbvio. */
    observacao: string | null;
}

export interface ItemFeed extends RegistroAgente {
    agenteNome: string;
    /** Quantas ações iguais (mesmo agente, mesma frase) foram juntadas neste item. */
    repeticoes: number;
}

export interface CentralAgentes {
    agentes: AgenteVisao[];
    feed: ItemFeed[];
    maestro: {
        aprovacoes: number;
        conversasSemDono: number;
        alertas: number;
        luzAcesa: boolean;
        /** null = interruptor ainda não instalado (migration pendente). */
        iaGeral: ModoAgente | null;
        custoHojeUsd: number;
    };
    decisoes: ItemDecisao[];
    /** Números do telão (só a API preenche; null = não deu para ler agora). */
    painel?: PainelTelao | null;
    geradoEm: string;
}

const MIN = 60_000;
const DIA = 86_400_000;
export const JANELA_TRABALHANDO_MS = 2 * MIN;
export const ERROS_SEGUIDOS = 3;
const MAX_ACOES = 20;
const MAX_FEED = 40;
/** Ações iguais do mesmo agente dentro desta janela viram um item só no feed ("×N"). */
const JANELA_AGRUPAR_MS = 6 * 60 * MIN;

const t = (iso: string | null | undefined) => {
    const n = iso ? new Date(iso).getTime() : NaN;
    return Number.isFinite(n) ? n : null;
};

/** 00:00 de hoje em Brasília (UTC-3), em ms. */
export function inicioDoDiaBRT(agora: number): number {
    const brt = new Date(agora - 3 * 3_600_000);
    return Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 3, 0, 0);
}

function modoDoAgente(a: AgenteCatalogo, e: EntradaAgentes): ModoAgente {
    const cfg = e.configs[a.id];
    if (cfg?.modo) return cfg.modo;
    if (a.id === 'laura') {
        if (e.modoLaura === 'ensaio') return 'ensaio';
        if (e.modoLaura === 'desligada') return 'desligado';
    }
    return 'ligado';
}

export function estadoDosAgentes(e: EntradaAgentes): CentralAgentes {
    const { agora } = e;
    const hoje = inicioDoDiaBRT(agora);
    const iaGeral: ModoAgente | null = e.configInstalada ? (e.configs[ID_IA_GERAL]?.modo ?? 'ligado') : null;

    const porAgente = new Map<string, RegistroAgente[]>();
    for (const r of e.registros) {
        if (t(r.em) == null) continue;
        (porAgente.get(r.agenteId) || porAgente.set(r.agenteId, []).get(r.agenteId)!).push(r);
    }
    for (const lista of porAgente.values()) lista.sort((a, b) => t(b.em)! - t(a.em)!);

    const aguardandoPorAgente = new Map<string, number>();
    for (const d of e.decisoes) {
        if (d.tipo === 'aprovacao' && d.agenteId) aguardandoPorAgente.set(d.agenteId, (aguardandoPorAgente.get(d.agenteId) || 0) + 1);
    }

    const agentes: AgenteVisao[] = AGENTES.map(a => {
        const regs = porAgente.get(a.id) || [];
        const em24h = regs.filter(r => agora - t(r.em)! <= DIA);
        const modo = modoDoAgente(a, e);
        const aguardandoVoce = aguardandoPorAgente.get(a.id) || 0;
        const aberto = regs.find(r => r.status === 'rodando' && agora - t(r.em)! < JANELA_TRABALHANDO_MS);
        const terminadas = regs.filter(r => r.status === 'ok' || r.status === 'erro');
        const erroSeguido = terminadas.length >= ERROS_SEGUIDOS && terminadas.slice(0, ERROS_SEGUIDOS).every(r => r.status === 'erro');

        let observacao: string | null = null;
        let desligado = modo === 'desligado';
        if (a.id === 'laura' && modo === 'desligado' && em24h.length > 0 && !e.configs[a.id]) {
            // Botão da Laura no CRM desligado, mas a Laura do n8n segue respondendo.
            desligado = false;
            observacao = 'A Laura do CRM está desligada; as respostas de hoje saíram pela Laura do n8n.';
        }
        if (a.ia && iaGeral === 'desligado') {
            desligado = true;
            observacao = 'IA geral desligada pelo maestro.';
        }

        let estado: EstadoAgente;
        if (desligado) estado = 'desligado';
        else if (erroSeguido) estado = 'erro';
        else if (aberto) estado = 'trabalhando';
        else if (aguardandoVoce > 0) estado = 'aguardando';
        else estado = 'ocioso';

        const ultima = regs[0] || null;
        let frase: string;
        if (estado === 'trabalhando' && aberto) frase = aberto.frase;
        else if (estado === 'aguardando') frase = `${aguardandoVoce} ${aguardandoVoce === 1 ? 'item esperando' : 'itens esperando'} a sua aprovação`;
        else if (ultima) frase = ultima.frase;
        else frase = 'Nenhum registro ainda.';
        if (estado === 'erro') frase = `${ERROS_SEGUIDOS} erros seguidos — ${ultima?.frase || ''}`.trim();

        if (a.id === 'laura' && modo === 'ensaio' && !observacao) {
            observacao = 'Laura do CRM em ENSAIO: escreve a resposta, mas não envia. Quem responde o cliente hoje é a Laura do n8n.';
        }

        const custo = regs.filter(r => t(r.em)! >= hoje && typeof r.custoUsd === 'number')
            .reduce((s, r) => s + (r.custoUsd as number), 0);
        const temCusto = regs.some(r => typeof r.custoUsd === 'number');

        return {
            id: a.id,
            nome: a.nome,
            arco: a.arco,
            funcao: a.funcao,
            icone: a.icone,
            ia: a.ia,
            estado,
            modo: desligado && modo !== 'desligado' ? 'desligado' : modo,
            etiqueta: modo === 'ensaio' ? 'ENSAIO' : null,
            frase,
            ultimaAcaoEm: ultima?.em || null,
            execucoes24h: em24h.filter(r => r.status !== 'decidido').length,
            erros24h: em24h.filter(r => r.status === 'erro').length,
            custoHojeUsd: temCusto ? Math.round(custo * 10000) / 10000 : null,
            aguardandoVoce,
            acoes: regs.slice(0, MAX_ACOES),
            observacao,
        };
    });

    const nomes = new Map(AGENTES.map(a => [a.id, a.nome]));
    // Feed: do mais novo ao mais antigo. Ações iguais do mesmo agente (ex.: a
    // Laura respondendo várias vezes) viram um item só, com a contagem real.
    const feed: ItemFeed[] = [];
    const ultimoPorChave = new Map<string, ItemFeed>();
    const noFeed = e.registros
        .filter(r => !r.noFeed && t(r.em) != null && nomes.has(r.agenteId))
        .sort((a, b) => t(b.em)! - t(a.em)!);
    for (const r of noFeed) {
        // A duração (" · 6,7 s") não conta para decidir se duas ações são iguais.
        const chave = `${r.agenteId}|${r.status}|${r.frase.replace(/ · [0-9,]+ s$/, '')}`;
        const igual = ultimoPorChave.get(chave);
        if (igual && t(igual.em)! - t(r.em)! <= JANELA_AGRUPAR_MS) {
            igual.repeticoes += 1;
            continue;
        }
        if (feed.length >= MAX_FEED) continue;
        const item: ItemFeed = { ...r, agenteNome: nomes.get(r.agenteId)!, repeticoes: 1 };
        feed.push(item);
        ultimoPorChave.set(chave, item);
    }

    const conta = (tipo: TipoDecisao) => e.decisoes.filter(d => d.tipo === tipo).length;
    const aprovacoes = conta('aprovacao');
    const conversasSemDono = conta('conversa_sem_dono');
    const alertas = conta('alerta');

    return {
        agentes,
        feed,
        maestro: {
            aprovacoes,
            conversasSemDono,
            alertas,
            luzAcesa: aprovacoes + conversasSemDono + alertas > 0,
            iaGeral,
            custoHojeUsd: Math.round(agentes.reduce((s, a) => s + (a.custoHojeUsd || 0), 0) * 10000) / 10000,
        },
        decisoes: [...e.decisoes].sort((a, b) => (t(b.em) || 0) - (t(a.em) || 0)),
        geradoEm: new Date(agora).toISOString(),
    };
}
