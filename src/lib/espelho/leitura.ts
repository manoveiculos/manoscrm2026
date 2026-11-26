// src/lib/espelho/leitura.ts — leitura do espelho do WhatsApp (SÓ SERVIDOR, SÓ ADMIN)
//
// Toda rota confere a sessão e o perfil admin antes de usar a chave de serviço.
// O caminho da mídia no bucket nunca vai para o navegador.

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { consultorLogado, type ConsultorLogado } from '@/lib/fila/servidor';
import { EvolutionProvider } from '@/lib/whatsapp/evolutionProvider';
import { caminhoMidia, extensaoMidia, excedeLimite, tipoTemMidia } from '@/lib/whatsapp/midia';
import { acaoDeAcesso, type MensagemView, type TipoMensagem } from '@/lib/whatsapp/conversasView';
import { configEspelho, type ConfigEspelho } from './mapear';

export const BUCKET_ESPELHO = 'whatsapp-espelho-midia';
export const SEM_CACHE = { 'Cache-Control': 'no-store, private' };

export type ContextoEspelho =
    | { ok: true; admin: SupabaseClient; eu: ConsultorLogado; cfg: ConfigEspelho | null }
    | { ok: false; res: NextResponse };

export async function contextoEspelho(): Promise<ContextoEspelho> {
    const c = await consultorLogado();
    if (!c.ok) return { ok: false, res: c.res };
    if (c.eu.perfil !== 'admin') {
        return { ok: false, res: NextResponse.json({ success: false, error: 'Só o admin vê o WhatsApp espelhado.' }, { status: 403, headers: SEM_CACHE }) };
    }
    const cfg = configEspelho(process.env);
    return { ok: true, admin: c.admin, eu: c.eu, cfg: 'faltando' in cfg ? null : cfg };
}

// Linha crua do PostgREST (o projeto não tem tipos gerados do banco).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>;

export interface ConversaEspelho {
    id: string;
    telefone: string;
    nome: string | null;
    ultimaEm: string | null;
    ultimaDirecao: 'in' | 'out' | null;
    ultimaTipo: string | null;
    ultimaTexto: string | null;
    total: number;
}

const paraConversa = (r: Linha): ConversaEspelho => ({
    id: r.id,
    telefone: r.telefone_key,
    nome: r.nome ?? null,
    ultimaEm: r.ultima_em ?? null,
    ultimaDirecao: r.ultima_direcao ?? null,
    ultimaTipo: r.ultima_tipo ?? null,
    ultimaTexto: r.ultima_texto ?? null,
    total: Number(r.total_mensagens ?? 0),
});

const COLS_CONVERSA = 'id, telefone_key, nome, ultima_em, ultima_direcao, ultima_tipo, ultima_texto, total_mensagens';

/** Lista por última mensagem. Busca por nome, telefone ou texto de mensagem. */
export async function listarConversas(admin: SupabaseClient, instancia: string, opts: { busca?: string; limite?: number; antes?: string | null }) {
    const limite = Math.min(Math.max(opts.limite ?? 60, 1), 200);
    let q = admin.from('wa_espelho_conversas').select(COLS_CONVERSA)
        .eq('instancia', instancia)
        .not('ultima_em', 'is', null)
        .order('ultima_em', { ascending: false })
        .limit(limite + 1);
    if (opts.antes) q = q.lt('ultima_em', opts.antes);

    const termo = (opts.busca || '').trim();
    if (termo) {
        const digitos = termo.replace(/\D/g, '');
        const seguro = termo.replace(/[%_,()*]/g, ' ').trim();
        if (digitos.length >= 4 && digitos.length === termo.replace(/[\s()+-]/g, '').length) {
            q = q.ilike('telefone_key', `%${digitos}%`);
        } else if (seguro) {
            // nome do contato OU alguma mensagem com o termo
            const { data: comTexto } = await admin.from('wa_espelho_mensagens').select('conversa_id')
                .eq('instancia', instancia)
                .or(`texto.ilike.%${seguro}%,legenda.ilike.%${seguro}%,transcricao.ilike.%${seguro}%`)
                .order('enviada_em', { ascending: false })
                .limit(500);
            const ids = Array.from(new Set((comTexto || []).map(x => x.conversa_id as string)));
            q = ids.length
                ? q.or(`nome.ilike.%${seguro}%,id.in.(${ids.join(',')})`)
                : q.ilike('nome', `%${seguro}%`);
        }
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const linhas = (data || []) as Linha[];
    return { conversas: linhas.slice(0, limite).map(paraConversa), temMais: linhas.length > limite };
}

const COLS_MSG = 'id, provider_message_id, direcao, tipo, texto, legenda, midia_mime, midia_bytes, midia_nome, duracao_s, ' +
    'midia_path, midia_erro, transcricao, citada_message_id, editada_em, apagada_em, enviada_em, extra';

export function paraMensagemView(r: Linha): MensagemView {
    const extra = (r.extra && typeof r.extra === 'object') ? r.extra : {};
    return {
        id: r.id,
        providerId: r.provider_message_id,
        direcao: r.direcao,
        // 'vendedor' = mensagem enviada pelo número espelhado (a tela troca o rótulo)
        autor: r.direcao === 'in' ? 'cliente' : 'vendedor',
        tipo: r.tipo,
        texto: r.texto ?? null,
        legenda: r.legenda ?? null,
        // mídia é baixada da Evolution na primeira vez que alguém abre
        temMidia: tipoTemMidia(r.tipo) && !r.midia_erro,
        midiaMime: r.midia_mime ?? null,
        midiaBytes: r.midia_bytes != null ? Number(r.midia_bytes) : null,
        midiaNome: r.midia_nome ?? null,
        midiaExpirada: false,
        midiaErro: r.midia_erro ?? null,
        duracaoS: r.duracao_s ?? null,
        transcricao: r.transcricao ?? null,
        citadaId: r.citada_message_id ?? null,
        statusEntrega: null,
        editadaEm: r.editada_em ?? null,
        apagadaEm: r.apagada_em ?? null,
        criadaEm: r.enviada_em,
        localizacao: extra.localizacao ?? null,
        contatos: Array.isArray(extra.contatos) ? extra.contatos : null,
        analiseAudio: null,
    };
}

/** Mensagens de uma conversa, da mais antiga para a mais nova (página = as mais recentes antes de `antes`). */
export async function mensagensDaConversa(ctx: Extract<ContextoEspelho, { ok: true }>, conversaId: string, antes: string | null) {
    const { admin, eu } = ctx;
    const { data: conv, error: e1 } = await admin.from('wa_espelho_conversas').select(COLS_CONVERSA).eq('id', conversaId).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!conv) return null;

    const LIMITE = 120;
    let q = admin.from('wa_espelho_mensagens').select(COLS_MSG)
        .eq('conversa_id', conversaId)
        .order('enviada_em', { ascending: false })
        .limit(LIMITE + 1);
    if (antes) q = q.lt('enviada_em', antes);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const linhas = (data || []) as Linha[];
    const pagina = linhas.slice(0, LIMITE).reverse();

    // mensagens citadas que não estão na página
    const ids = new Set(pagina.map(m => m.provider_message_id));
    const faltam = Array.from(new Set(pagina.map(m => m.citada_message_id).filter((x): x is string => !!x && !ids.has(x))));
    const citadas: Record<string, { direcao: 'in' | 'out'; resumo: string }> = {};
    if (faltam.length) {
        const { data: cs } = await admin.from('wa_espelho_mensagens')
            .select('provider_message_id, direcao, tipo, texto, legenda').eq('conversa_id', conversaId).in('provider_message_id', faltam.slice(0, 100));
        for (const c of (cs || []) as Linha[]) {
            citadas[c.provider_message_id] = { direcao: c.direcao, resumo: (c.texto || c.legenda || `[${c.tipo}]`).slice(0, 140) };
        }
    }

    if (!antes) {
        await admin.from('wa_espelho_acessos_log').insert({ auth_uid: eu.authId, email: eu.email, conversa_id: conversaId, acao: 'abriu' });
    }
    return { conversa: paraConversa(conv as Linha), mensagens: pagina.map(paraMensagemView), citadas, temMais: linhas.length > LIMITE };
}

export type ResultadoMidia = { ok: true; url: string } | { ok: false; status: number; erro: string };

/**
 * URL assinada (5 min) da mídia. Na primeira vez baixa da Evolution e guarda no
 * bucket privado. Se o WhatsApp já não tem mais o arquivo, marca indisponível.
 */
export async function urlDaMidiaEspelho(ctx: Extract<ContextoEspelho, { ok: true }>, mensagemId: string, download: boolean): Promise<ResultadoMidia> {
    const { admin, eu, cfg } = ctx;
    const { data: m, error } = await admin.from('wa_espelho_mensagens')
        .select('id, conversa_id, instancia, provider_message_id, remote_jid, direcao, tipo, midia_path, midia_nome, midia_mime, midia_bytes, midia_erro, enviada_em')
        .eq('id', mensagemId).maybeSingle();
    if (error) return { ok: false, status: 500, erro: error.message };
    if (!m || !tipoTemMidia(m.tipo)) return { ok: false, status: 404, erro: 'mídia não encontrada' };

    let caminho: string | null = m.midia_path;
    if (!caminho) {
        if (m.midia_erro) return { ok: false, status: 404, erro: 'mídia indisponível' };
        if (!cfg) return { ok: false, status: 503, erro: 'Evolution do espelho não configurada' };
        if (excedeLimite(m.tipo, m.midia_bytes)) {
            await admin.from('wa_espelho_mensagens').update({ midia_erro: 'acima_do_limite' }).eq('id', m.id);
            return { ok: false, status: 413, erro: 'arquivo grande demais' };
        }
        try {
            const prov = new EvolutionProvider({ baseUrl: cfg.baseUrl, instancia: m.instancia || cfg.instancia, token: cfg.token });
            const b = await prov.baixarMidia({ providerMessageId: m.provider_message_id, remoteJid: m.remote_jid || undefined, fromMe: m.direcao === 'out' });
            const ext = extensaoMidia(m.tipo, b.mime || m.midia_mime, b.nomeArquivo || m.midia_nome);
            caminho = caminhoMidia(m.conversa_id, m.id, ext, m.enviada_em);
            const { error: eUp } = await admin.storage.from(BUCKET_ESPELHO)
                .upload(caminho, Buffer.from(b.base64, 'base64'), { contentType: (b.mime || m.midia_mime || 'application/octet-stream').split(';')[0], upsert: true });
            if (eUp) return { ok: false, status: 500, erro: eUp.message };
            await admin.from('wa_espelho_mensagens').update({
                midia_path: caminho,
                midia_mime: m.midia_mime || b.mime,
                midia_bytes: m.midia_bytes || b.bytes,
                midia_nome: m.midia_nome || b.nomeArquivo,
            }).eq('id', m.id);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            // Evolution respondeu com erro / mídia vazia: o WhatsApp já apagou o arquivo
            // (acontece com mídia antiga). Não adianta tentar de novo. Timeout/rede: tenta na próxima.
            if (/HTTP [45]\d\d|vazia/i.test(msg)) {
                await admin.from('wa_espelho_mensagens').update({ midia_erro: 'indisponivel' }).eq('id', m.id);
                return { ok: false, status: 404, erro: 'mídia indisponível no WhatsApp' };
            }
            return { ok: false, status: 502, erro: 'não consegui baixar agora, tente de novo' };
        }
    }

    const { data: assinada, error: e2 } = await admin.storage.from(BUCKET_ESPELHO)
        .createSignedUrl(caminho, 300, download ? { download: m.midia_nome || true } : undefined);
    if (e2 || !assinada?.signedUrl) return { ok: false, status: 500, erro: e2?.message || 'falha ao assinar' };

    await admin.from('wa_espelho_acessos_log').insert({
        auth_uid: eu.authId, email: eu.email, conversa_id: m.conversa_id, mensagem_id: m.id,
        acao: acaoDeAcesso(m.tipo as TipoMensagem, download),
    });
    return { ok: true, url: assinada.signedUrl };
}
