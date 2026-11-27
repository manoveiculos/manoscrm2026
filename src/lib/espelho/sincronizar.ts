// src/lib/espelho/sincronizar.ts — lê a Evolution e grava o espelho (SÓ SERVIDOR)
//
// Só LEITURA na Evolution (/chat/findMessages devolve o que ela já guardou, sem
// tocar no WhatsApp): não altera webhook nem configuração da instância e não
// tem risco de banimento. Duas etapas por execução:
//   1. novas:    página 1 em diante até encontrar uma página sem nada novo;
//   2. importar: continua o histórico de onde parou (wa_espelho_sync.importacao_pagina)
//                até acabar o orçamento de tempo. Quando a Evolution devolve página
//                vazia, a importação está concluída.
// A Evolution ordena do mais novo para o mais antigo. Mensagem nova empurra as
// antigas para páginas seguintes: a importação relê algumas (repetidas são
// ignoradas pelo banco) mas nunca pula nenhuma.

import type { SupabaseClient } from '@supabase/supabase-js';
import { eventosDosRegistros, separarEventos, type ConfigEspelho } from './mapear';

export const TAMANHO_PAGINA = 200;
const TIMEOUT_EVOLUTION_MS = 25_000;
const MAX_PAGINAS_NOVAS = 15;
/** Sempre lê pelo menos estas páginas: mensagem que chega com atraso cai um pouco abaixo do topo. */
const MIN_PAGINAS_NOVAS = 3;
/**
 * Revarredura (a cada 15 min): relê as últimas 48 h de mensagens da Evolution.
 * Quando uma instância fica travada e volta (restart, novo QR), o WhatsApp entrega
 * as mensagens atrasadas com o horário ORIGINAL, misturadas com as novas. Elas
 * caem abaixo de mensagens que já estão no banco e a etapa "novas" pararia antes
 * de chegar nelas. A revarredura pega essas. Repetidas são ignoradas pelo banco.
 */
const JANELA_REVARREDURA_S = 48 * 3600;
const MAX_PAGINAS_REVARREDURA = 80;
const INTERVALO_REVARREDURA_MIN = 15;

/** Menor e maior messageTimestamp (segundos) de uma página da Evolution. */
export function faixaDeHorario(registros: unknown[]): { min: number; max: number } | null {
    const ts = registros
        .map(r => Number((r as { messageTimestamp?: unknown })?.messageTimestamp))
        .filter(n => Number.isFinite(n) && n > 0)
        .map(n => (n > 1e12 ? Math.floor(n / 1000) : n));
    return ts.length ? { min: Math.min(...ts), max: Math.max(...ts) } : null;
}

export interface PaginaEvolution {
    registros: unknown[];
    total: number | null;
    paginas: number | null;
}

export async function buscarPagina(cfg: ConfigEspelho, pagina: number, tamanho = TAMANHO_PAGINA): Promise<PaginaEvolution> {
    const url = `${cfg.baseUrl}/chat/findMessages/${encodeURIComponent(cfg.instancia)}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { apikey: cfg.token, 'Content-Type': 'application/json' },
        // na Evolution v2, "offset" é o tamanho da página
        body: JSON.stringify({ where: {}, page: pagina, offset: tamanho }),
        signal: AbortSignal.timeout(TIMEOUT_EVOLUTION_MS),
        cache: 'no-store',
    });
    if (!res.ok) {
        const t = await res.text().catch(() => '');
        // não repassa o corpo inteiro: pode ecoar dado de cliente
        throw new Error(`Evolution findMessages HTTP ${res.status}: ${t.slice(0, 120)}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const j: any = await res.json();
    const m = j?.messages ?? j;
    const registros = Array.isArray(m?.records) ? m.records : Array.isArray(m) ? m : [];
    return {
        registros,
        total: Number.isFinite(Number(m?.total)) ? Number(m.total) : null,
        paginas: Number.isFinite(Number(m?.pages)) ? Number(m.pages) : null,
    };
}

export interface ResultadoPagina {
    recebidas: number;
    gravadas: number;
    edicoes: number;
    apagadas: number;
}

/** Grava uma página da Evolution no banco. Idempotente. */
export async function gravarPagina(admin: SupabaseClient, cfg: ConfigEspelho, registros: unknown[]): Promise<ResultadoPagina> {
    const s = separarEventos(eventosDosRegistros(registros, cfg.instancia));
    let gravadas = 0;
    if (s.linhas.length) {
        const { data, error } = await admin.rpc('wa_espelho_gravar', { p_instancia: cfg.instancia, p_msgs: s.linhas });
        if (error) throw new Error(`wa_espelho_gravar: ${error.message}`);
        gravadas = Number((data as { gravadas?: number } | null)?.gravadas ?? 0);
    }
    // Edição: troca o texto e guarda o original. Apagada: mantém o texto (é histórico) e marca.
    for (const ed of s.edicoes) {
        const { data: atual } = await admin.from('wa_espelho_mensagens')
            .select('id, texto, extra').eq('instancia', cfg.instancia).eq('provider_message_id', ed.id).maybeSingle();
        if (!atual) continue;
        await admin.from('wa_espelho_mensagens').update({
            texto: ed.texto,
            editada_em: ed.em,
            extra: { ...(atual.extra || {}), texto_original: atual.extra?.texto_original ?? atual.texto },
        }).eq('id', atual.id);
    }
    for (const ap of s.apagadas) {
        await admin.from('wa_espelho_mensagens').update({ apagada_em: ap.em })
            .eq('instancia', cfg.instancia).eq('provider_message_id', ap.id).is('apagada_em', null);
    }
    return { recebidas: registros.length, gravadas, edicoes: s.edicoes.length, apagadas: s.apagadas.length };
}

export interface ResultadoSync {
    ok: boolean;
    novas: number;
    /** Mensagens atrasadas achadas pela revarredura das últimas 48 h. */
    recuperadas: number;
    importadas: number;
    paginasLidas: number;
    importacaoPagina: number;
    importacaoConcluida: boolean;
    totalEvolution: number | null;
    erro?: string;
}

interface EstadoSync {
    importacao_pagina: number;
    importacao_concluida: boolean;
}

export async function sincronizarEspelho(
    admin: SupabaseClient,
    cfg: ConfigEspelho,
    opts: { orcamentoMs: number; importar?: boolean; revarrer?: boolean },
): Promise<ResultadoSync> {
    const inicio = Date.now();
    const sobra = () => opts.orcamentoMs - (Date.now() - inicio);

    const { data: est } = await admin.from('wa_espelho_sync')
        .select('importacao_pagina, importacao_concluida').eq('instancia', cfg.instancia).maybeSingle();
    const estado: EstadoSync = (est as EstadoSync | null) ?? { importacao_pagina: 1, importacao_concluida: false };

    const r: ResultadoSync = {
        ok: true, novas: 0, recuperadas: 0, importadas: 0, paginasLidas: 0,
        importacaoPagina: estado.importacao_pagina, importacaoConcluida: estado.importacao_concluida, totalEvolution: null,
    };

    try {
        // 1. novas
        let pagina = 1;
        let maisNova: number | null = null;
        let fimDaLista = false;
        for (; pagina <= MAX_PAGINAS_NOVAS && sobra() > 8_000; pagina++) {
            const pg = await buscarPagina(cfg, pagina);
            r.paginasLidas++;
            r.totalEvolution = pg.total ?? r.totalEvolution;
            if (!pg.registros.length) { fimDaLista = true; break; }
            if (maisNova === null) maisNova = faixaDeHorario(pg.registros)?.max ?? null;
            const g = await gravarPagina(admin, cfg, pg.registros);
            r.novas += g.gravadas;
            // nada novo nesta página (e já leu o mínimo): o resto já está no banco
            if (g.gravadas === 0 && pagina >= MIN_PAGINAS_NOVAS) { pagina++; break; }
        }

        // 1b. revarredura das últimas 48 h (mensagens atrasadas)
        const revarrer = opts.revarrer ?? (new Date().getUTCMinutes() % INTERVALO_REVARREDURA_MIN === 0);
        if (revarrer && !fimDaLista && maisNova !== null) {
            const corte = maisNova - JANELA_REVARREDURA_S;
            for (let lidas = 0; lidas < MAX_PAGINAS_REVARREDURA && sobra() > 8_000; lidas++, pagina++) {
                const pg = await buscarPagina(cfg, pagina);
                r.paginasLidas++;
                if (!pg.registros.length) break;
                const g = await gravarPagina(admin, cfg, pg.registros);
                r.recuperadas += g.gravadas;
                const faixa = faixaDeHorario(pg.registros);
                if (!faixa || faixa.max < corte) break; // passou da janela de 48 h
            }
        }

        // 2. importação do histórico
        if (opts.importar !== false && !r.importacaoConcluida) {
            while (sobra() > 8_000) {
                const pg = await buscarPagina(cfg, r.importacaoPagina);
                r.paginasLidas++;
                r.totalEvolution = pg.total ?? r.totalEvolution;
                if (!pg.registros.length) { r.importacaoConcluida = true; break; }
                const g = await gravarPagina(admin, cfg, pg.registros);
                r.importadas += g.gravadas;
                r.importacaoPagina++;
            }
        }
    } catch (e) {
        r.ok = false;
        r.erro = e instanceof Error ? e.message : String(e);
    }

    const agora = new Date().toISOString();
    await admin.from('wa_espelho_sync').upsert({
        instancia: cfg.instancia,
        ultima_sync_em: agora,
        ultima_sync_gravadas: r.novas + r.recuperadas + r.importadas,
        importacao_pagina: r.importacaoPagina,
        importacao_concluida: r.importacaoConcluida,
        total_evolution: r.totalEvolution,
        ...(r.erro ? { ultimo_erro: r.erro.slice(0, 500), ultimo_erro_em: agora } : {}),
        atualizado_em: agora,
    }, { onConflict: 'instancia' });

    return r;
}
