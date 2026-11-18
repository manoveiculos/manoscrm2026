// src/lib/whatsapp/ia/espera.ts — lista de espera de carros ("Procurando carro")
//
// O cliente pediu um carro que a loja não tem agora: o pedido é guardado em carro_espera
// (migration 20261119). Aqui só GRAVA. Avisar quando o carro entrar é a Fase 3.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface PedidoEspera {
    texto: string;
    marca: string | null;
    modelo: string | null;
    carroceria: string | null;
    anoMin: number | null;
    precoMax: number | null;
    cambio: string | null;
}

const norm = (s: string | null | undefined) =>
    (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

/** Identifica "o mesmo carro" para não duplicar o pedido do mesmo cliente. */
export function chaveDoPedido(p: PedidoEspera): string {
    const partes = [p.marca, p.modelo, p.carroceria].map(norm).filter(Boolean);
    return (partes.length ? partes.join(' ') : norm(p.texto)).slice(0, 120);
}

export interface DonoDoPedido {
    telefoneKey: string;
    leadUid: string | null;
    conversaId: string | null;
    consultorId: string | null;
    nomeCliente: string | null;
    origem: 'laura' | 'consultor';
}

/** Grava o pedido; se o cliente já espera esse carro, só atualiza (faixa de preço/ano) e renova o prazo. */
export async function gravarEspera(
    supabase: SupabaseClient, dono: DonoDoPedido, p: PedidoEspera,
): Promise<{ ok: boolean; acao?: 'criado' | 'atualizado'; erro?: string }> {
    const chave = chaveDoPedido(p);
    if (!dono.telefoneKey || !chave) return { ok: false, erro: 'sem telefone ou sem carro' };
    const campos = {
        texto_original: p.texto.slice(0, 200), marca: p.marca, modelo: p.modelo, carroceria: p.carroceria,
        ano_min: p.anoMin, preco_max: p.precoMax, cambio: p.cambio,
        atualizado_em: new Date().toISOString(),
        expira_em: new Date(Date.now() + 90 * 86400_000).toISOString(),
    };
    const { data: ja, error: e1 } = await supabase.from('carro_espera').select('id')
        .eq('telefone_key', dono.telefoneKey).eq('chave', chave).eq('status', 'aguardando').maybeSingle();
    if (e1) return { ok: false, erro: e1.message };
    if (ja) {
        const { error } = await supabase.from('carro_espera').update(campos).eq('id', ja.id);
        return error ? { ok: false, erro: error.message } : { ok: true, acao: 'atualizado' };
    }
    const { error } = await supabase.from('carro_espera').insert({
        ...campos, chave, telefone_key: dono.telefoneKey, lead_uid: dono.leadUid, conversa_id: dono.conversaId,
        consultor_id: dono.consultorId, nome_cliente: dono.nomeCliente, origem: dono.origem,
    });
    return error ? { ok: false, erro: error.message } : { ok: true, acao: 'criado' };
}
