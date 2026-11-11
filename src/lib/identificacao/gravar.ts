// src/lib/identificacao/gravar.ts — grava nome e carro pelo único caminho do banco (SÓ SERVIDOR)
//
// atualizar_nome_lead() e registrar_interesse_lead() fazem tudo numa transação:
// crm26 + master + wa_conversas + histórico, sem mexer em status (ver a migration
// 20261107_nome_interesse_auto.sql). Aqui só chamamos e registramos erro.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrigemNome } from './nome';
import type { CarroInteresse } from './veiculo';

export interface ResultadoNome {
    ok: boolean;
    aplicados: number;
    motivo?: string;
    leads?: { lead: string; aplicado: boolean; motivo: string }[];
}

export async function atualizarNomeLead(
    admin: SupabaseClient,
    p: { telefone: string; nome: string; origem: Exclude<OrigemNome, 'generico'>; por: string; trecho?: string | null },
): Promise<ResultadoNome> {
    const { data, error } = await admin.rpc('atualizar_nome_lead', {
        p_telefone: p.telefone, p_nome: p.nome, p_origem: p.origem, p_por: p.por, p_trecho: p.trecho ?? null,
    });
    if (error) throw new Error(`atualizar_nome_lead: ${error.message}`);
    const r = (data || {}) as ResultadoNome;
    return { ok: !!r.ok, aplicados: r.aplicados || 0, motivo: r.motivo, leads: r.leads };
}

export interface ResultadoInteresse {
    ok: boolean;
    interesse: string | null;
    leadsAtualizados: string[];
}

export async function registrarInteresse(
    admin: SupabaseClient,
    telefone: string,
    carro: CarroInteresse,
    por: string,
): Promise<ResultadoInteresse> {
    const { data, error } = await admin.rpc('registrar_interesse_lead', {
        p_telefone: telefone,
        p_descricao: carro.descricao,
        p_modelo_chave: carro.modeloChave,
        p_ano: carro.ano,
        p_codigo_feed: carro.codigoFeed,
        p_origem: carro.origem === 'anterior' ? 'cliente_citou' : carro.origem,
        p_em_estoque: carro.emEstoque,
        p_por: por,
        p_trecho: carro.trecho,
    });
    if (error) throw new Error(`registrar_interesse_lead: ${error.message}`);
    const r = (data || {}) as { ok?: boolean; interesse?: string | null; leads_atualizados?: string[] };
    const leads = Array.isArray(r.leads_atualizados) ? r.leads_atualizados : [];
    // Carro fora do estoque alimenta o alerta "carro abaixo da faixa" (Central de Compras).
    if (!carro.emEstoque) {
        for (const uid of leads) {
            const i = uid.indexOf(':');
            const tabela = uid.slice(0, i);
            if (tabela !== 'leads_distribuicao_crm_26') continue;
            const { cadastrarAlertaAbaixoDaFaixa } = await import('@/lib/services/alertaCarroAbaixoFaixa');
            await cadastrarAlertaAbaixoDaFaixa(admin, tabela, uid.slice(i + 1)).catch(() => null);
        }
    }
    return { ok: !!r.ok, interesse: r.interesse ?? null, leadsAtualizados: leads };
}

export interface EstadoNome {
    nome: string | null;
    origem: OrigemNome;
    ultima: {
        id: string; nome_antigo: string | null; nome_novo: string; origem: string; por: string;
        criado_em: string; pode_desfazer: boolean;
    } | null;
}

export async function estadoDoNome(admin: SupabaseClient, leadUid: string): Promise<EstadoNome | null> {
    const { data, error } = await admin.rpc('nome_lead_estado', { p_lead_uid: leadUid });
    if (error) return null;
    return (data as EstadoNome | null) ?? null;
}
