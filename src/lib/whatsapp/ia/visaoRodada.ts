// src/lib/whatsapp/ia/visaoRodada.ts — lê as fotos do cliente no bucket e grava a descrição (servidor)
//
// Chamado pelo motor antes de montar o histórico. Idempotente: foto já descrita não é lida de novo.

import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BUCKET_MIDIA } from '../midia';
import { msgErro } from '../erro';
import { LIMITE_BYTES_VISAO, MAX_TENTATIVAS_VISAO, descreverImagem, mimeSuportado, type UsoVisao } from './visao';

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms));
/** Só olha fotos recentes: foto antiga sem descrição não vale custo nem atraso. */
const JANELA_HORAS = 72;
const MAX_FOTOS_POR_RODADA = 6;

/** Foto do cliente que ainda está sendo baixada pela ingestão: espera até 30 s. */
async function esperarDownloads(supabase: SupabaseClient, conversaId: string): Promise<void> {
    const desde = new Date(Date.now() - 10 * 60_000).toISOString();
    for (let i = 0; i < 10; i++) {
        const { count } = await supabase.from('wa_mensagens')
            .select('id', { count: 'exact', head: true })
            .eq('conversa_id', conversaId).eq('autor', 'cliente').eq('tipo', 'imagem')
            .is('midia_path', null).is('midia_erro', null).gte('criada_em', desde);
        if (!count) return;
        await esperar(3000);
    }
}

/**
 * Descreve as fotos recentes do cliente que ainda não têm descrição. Nunca lança: foto que falha vira
 * "(não consegui abrir esta foto)" depois de 2 tentativas, e a Laura segue sem ela.
 */
export async function garantirDescricoesDeImagens(
    supabase: SupabaseClient, cliente: Anthropic, conversaId: string, modelo: string,
): Promise<UsoVisao> {
    const uso: UsoVisao = { input_tokens: 0, output_tokens: 0 };
    try {
        await esperarDownloads(supabase, conversaId);
        const desde = new Date(Date.now() - JANELA_HORAS * 3_600_000).toISOString();
        const { data } = await supabase.from('wa_mensagens')
            .select('id, midia_path, midia_mime, legenda, extra')
            .eq('conversa_id', conversaId).eq('autor', 'cliente').eq('tipo', 'imagem')
            .not('midia_path', 'is', null).gte('criada_em', desde)
            .order('criada_em', { ascending: false }).limit(MAX_FOTOS_POR_RODADA);
        const pendentes = (data || []).filter(m => {
            const ex = (m.extra || {}) as Record<string, unknown>;
            return !ex.visao && Number(ex.visao_tentativas || 0) < MAX_TENTATIVAS_VISAO;
        });
        await Promise.all(pendentes.map(async m => {
            const ex = { ...((m.extra || {}) as Record<string, unknown>) };
            const tentativas = Number(ex.visao_tentativas || 0) + 1;
            try {
                const mime = mimeSuportado(m.midia_mime);
                if (!mime) throw new Error(`formato sem suporte (${m.midia_mime || 'desconhecido'})`);
                const { data: arq, error } = await supabase.storage.from(BUCKET_MIDIA).download(m.midia_path as string);
                if (error || !arq) throw new Error(`arquivo indisponível: ${error?.message || 'vazio'}`);
                const buf = Buffer.from(await arq.arrayBuffer());
                if (buf.byteLength > LIMITE_BYTES_VISAO) throw new Error(`imagem grande demais (${buf.byteLength} bytes)`);
                const r = await descreverImagem(cliente, { base64: buf.toString('base64'), mime, legenda: m.legenda as string | null, modelo });
                uso.input_tokens += r.uso.input_tokens;
                uso.output_tokens += r.uso.output_tokens;
                if (!r.descricao) throw new Error('resposta da visão sem JSON utilizável');
                await supabase.from('wa_mensagens').update({
                    extra: { ...ex, visao: r.descricao, visao_modelo: modelo, visao_em: new Date().toISOString(), visao_tentativas: tentativas },
                }).eq('id', m.id);
            } catch (e) {
                // formato sem suporte ou imagem grande não melhoram com nova tentativa: fecha logo
                const definitivo = /sem suporte|grande demais/.test(msgErro(e));
                await supabase.from('wa_mensagens').update({
                    extra: { ...ex, visao_tentativas: definitivo ? MAX_TENTATIVAS_VISAO : tentativas, visao_erro: msgErro(e).slice(0, 200) },
                }).eq('id', m.id);
            }
        }));
    } catch (e) {
        console.error('[laura-crm] visão das fotos falhou:', msgErro(e));
    }
    return uso;
}
