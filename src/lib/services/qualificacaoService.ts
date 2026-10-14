import type { SupabaseClient } from '@supabase/supabase-js';
import { ehMoto, parseValorBR, getPrazo, type QualificacaoCampos } from '@/lib/qualificacao';

/**
 * Leitura e gravação dos 4 campos de qualificação nas tabelas-base.
 * Usado pela tela do lead, pelo Kanban, pela Inbox e pela IA de WhatsApp —
 * é o único lugar que sabe em que coluna cada campo mora.
 *
 * prazo_compra nasce na migration 20261014b. Até ela ser aplicada, a leitura e
 * a gravação seguem funcionando sem o campo (fallback) em vez de quebrar a tela.
 */

type Tabela = 'leads_distribuicao_crm_26' | 'leads_manos_crm' | 'leadsfacebook';

interface Colunas {
    interesse: string[];          // onde gravar o carro/faixa (1ª = leitura preferida)
    entrada: string | null;
    troca: string | null;
    prazo: string | null;
    updatedAt: string;
}

const COLUNAS: Record<Tabela, Colunas> = {
    // crm26 tem 'interesse' (n8n) E 'vehicle_interest' (IA); a tela lê os dois.
    leads_distribuicao_crm_26: { interesse: ['vehicle_interest', 'interesse'], entrada: 'valor_investimento', troca: 'carro_troca', prazo: 'prazo_compra', updatedAt: 'atualizado_em' },
    leads_manos_crm:           { interesse: ['vehicle_interest'], entrada: 'valor_investimento', troca: 'carro_troca', prazo: 'prazo_compra', updatedAt: 'updated_at' },
    leadsfacebook:             { interesse: ['vehicle_interest'], entrada: null, troca: null, prazo: null, updatedAt: 'updated_at' },
};

export function tabelaSuportaQualificacao(t: string): t is Tabela {
    return t in COLUNAS;
}

const realId = (table: string, id: string) => (table === 'leads_distribuicao_crm_26' ? parseInt(id, 10) : id);
const semColuna = (msg?: string) => !!msg && /prazo_compra/.test(msg) && /(column|coluna|schema cache)/i.test(msg);

function linhaParaCampos(table: Tabela, row: any): QualificacaoCampos {
    const c = COLUNAS[table];
    const interesse = c.interesse.map(k => row?.[k]).find(v => typeof v === 'string' && v.trim()) || null;
    return {
        vehicle_interest: interesse,
        valor_investimento: c.entrada ? row?.[c.entrada] ?? null : null,
        carro_troca: c.troca ? row?.[c.troca] ?? null : null,
        prazo_compra: c.prazo ? row?.[c.prazo] ?? null : null,
    };
}

/** uid "tabela:id" → campos de qualificação. UIDs de tabelas sem suporte são ignorados. */
export async function buscarQualificacao(admin: SupabaseClient, uids: string[]): Promise<Map<string, QualificacaoCampos>> {
    const porTabela = new Map<Tabela, string[]>();
    for (const uid of uids) {
        const i = uid.indexOf(':');
        if (i <= 0) continue;
        const t = uid.slice(0, i);
        if (!tabelaSuportaQualificacao(t)) continue;
        (porTabela.get(t) || porTabela.set(t, []).get(t)!).push(uid.slice(i + 1));
    }

    const out = new Map<string, QualificacaoCampos>();
    await Promise.all([...porTabela.entries()].map(async ([table, ids]) => {
        const c = COLUNAS[table];
        const cols = ['id', ...c.interesse, c.entrada, c.troca, c.prazo].filter(Boolean) as string[];
        const ids2 = ids.map(id => realId(table, id)).filter(id => typeof id === 'string' || Number.isFinite(id));
        let { data, error } = await admin.from(table).select(cols.join(', ')).in('id', ids2 as any[]);
        if (error && semColuna(error.message)) {
            ({ data, error } = await admin.from(table).select(cols.filter(k => k !== 'prazo_compra').join(', ')).in('id', ids2 as any[]));
        }
        if (error) { console.warn('[qualificacao] leitura', table, error.message); return; }
        for (const row of (data || []) as any[]) out.set(`${table}:${row.id}`, linhaParaCampos(table, row));
    }));
    return out;
}

export interface SalvarResultado {
    ok: boolean;
    error?: string;
    /** Campos que a tabela não tem (ex.: prazo antes da migration). */
    ignorados: string[];
}

/** Grava só os campos informados (undefined = não mexe; '' = limpa). */
export async function salvarQualificacao(
    admin: SupabaseClient,
    table: string,
    id: string,
    campos: QualificacaoCampos,
): Promise<SalvarResultado> {
    if (!tabelaSuportaQualificacao(table)) return { ok: false, error: `tabela sem qualificação: ${table}`, ignorados: [] };
    const c = COLUNAS[table];
    const ignorados: string[] = [];
    const upd: Record<string, any> = {};
    const limpa = (v: string | null | undefined) => (v == null ? null : String(v).trim().slice(0, 250) || null);

    if (campos.vehicle_interest !== undefined) for (const k of c.interesse) upd[k] = limpa(campos.vehicle_interest);
    if (campos.valor_investimento !== undefined) {
        if (c.entrada) upd[c.entrada] = limpa(campos.valor_investimento); else ignorados.push('valor_investimento');
    }
    if (campos.carro_troca !== undefined) {
        if (c.troca) upd[c.troca] = limpa(campos.carro_troca); else ignorados.push('carro_troca');
    }
    if (campos.prazo_compra !== undefined) {
        if (campos.prazo_compra && !getPrazo(campos.prazo_compra)) return { ok: false, error: `prazo_compra inválido: ${campos.prazo_compra}`, ignorados };
        if (c.prazo) upd[c.prazo] = campos.prazo_compra || null; else ignorados.push('prazo_compra');
    }
    if (Object.keys(upd).length === 0) return { ok: true, ignorados };
    upd[c.updatedAt] = new Date().toISOString();

    let { error } = await admin.from(table).update(upd).eq('id', realId(table, id));
    if (error && semColuna(error.message)) {
        delete upd.prazo_compra;
        ignorados.push('prazo_compra');
        ({ error } = await admin.from(table).update(upd).eq('id', realId(table, id)));
    }
    if (error) return { ok: false, error: error.message, ignorados };
    return { ok: true, ignorados };
}

// ── Piso do estoque (carro mais barato à venda) ─────────────────────────────
let pisoCache: { valor: number | null; em: number } | null = null;
const PISO_TTL_MS = 10 * 60 * 1000;

/**
 * Preço do carro mais barato do estoque (tabela `estoque`, a mesma da vitrine).
 * Motos ficam de fora: uma Biz de R$ 12.900 não pode virar o piso de quem
 * procura carro.
 */
export async function pisoEstoque(admin: SupabaseClient): Promise<number | null> {
    if (pisoCache && Date.now() - pisoCache.em < PISO_TTL_MS) return pisoCache.valor;
    const { data, error } = await admin.from('estoque').select('marca, modelo, preco').limit(500);
    if (error) {
        console.warn('[qualificacao] estoque:', error.message);
        return pisoCache?.valor ?? null;
    }
    const precos = (data || [])
        .filter((v: any) => !ehMoto(`${v.marca || ''} ${v.modelo || ''}`))
        .map((v: any) => parseValorBR(v.preco))
        .filter((n): n is number => n != null && n >= 5000);
    const valor = precos.length ? Math.min(...precos) : null;
    pisoCache = { valor, em: Date.now() };
    return valor;
}
