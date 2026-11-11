// src/lib/whatsapp/envio.ts — envio pelo CRM no número da loja (SÓ SERVIDOR)
//
// Usado pelo vendedor (tela Conversas) e, só na etapa C, pela Laura do CRM.
// Fluxo: manda pela Evolution (EvolutionProvider) → registra a mensagem em wa_mensagens
// com QUEM enviou (autor + consultant_id + origem 'crm') → o eco do webhook cai como
// "repetido" (a ingestão é idempotente por provider_message_id).
//
// Quem manda pelo celular da loja (sem passar por aqui) chega no webhook como vendedor
// SEM consultant_id: isso é "humano assumiu" (ver marcarHumanoSeNecessario).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { WhatsAppProvider, EnvioResultado } from './provider';
import { msgErro } from './erro';

export interface ConversaEnvio {
    id: string;
    telefone_key: string;
    remote_jid: string | null;
}

export interface QuemEnviou {
    autor: 'vendedor' | 'laura';
    consultantId?: string | null;
}

export type ConteudoEnvio =
    | { tipo: 'texto'; texto: string; citadaId?: string }
    | { tipo: 'imagem'; base64: string; mime: string; legenda?: string; nomeArquivo?: string }
    | { tipo: 'audio'; base64: string };

export function envioPeloCrmLiberado(): boolean {
    return (process.env.WA_ENVIO_PELO_CRM || '').trim().toLowerCase() === 'true';
}

/** Limites simples para não aceitar lixo: texto até 4000 caracteres, mídia até ~10 MB (base64). */
export function validarConteudo(c: ConteudoEnvio): string | null {
    if (c.tipo === 'texto') {
        const t = c.texto.trim();
        if (!t) return 'mensagem vazia';
        if (t.length > 4000) return 'mensagem longa demais (máximo 4000 caracteres)';
        return null;
    }
    if (!c.base64 || c.base64.length < 20) return 'arquivo vazio';
    if (c.base64.length > 14_000_000) return 'arquivo grande demais (máximo ~10 MB)';
    if (c.tipo === 'imagem' && !/^image\/(jpeg|png|webp)$/i.test(c.mime)) return 'imagem precisa ser JPG, PNG ou WebP';
    return null;
}

export async function enviarPeloCrm(
    admin: SupabaseClient,
    provider: WhatsAppProvider,
    conv: ConversaEnvio,
    conteudo: ConteudoEnvio,
    quem: QuemEnviou,
): Promise<{ ok: boolean; providerMessageId: string | null; erro?: string }> {
    const invalido = validarConteudo(conteudo);
    if (invalido) return { ok: false, providerMessageId: null, erro: invalido };
    const para = conv.remote_jid || conv.telefone_key;

    let r: EnvioResultado;
    try {
        if (conteudo.tipo === 'texto') r = await provider.enviarTexto(para, conteudo.texto.trim(), { citadaId: conteudo.citadaId });
        else if (conteudo.tipo === 'imagem') {
            r = await provider.enviarMidia(para, { tipo: 'imagem', base64: conteudo.base64, mime: conteudo.mime, legenda: conteudo.legenda, nomeArquivo: conteudo.nomeArquivo });
        } else r = await provider.enviarAudio(para, { base64: conteudo.base64 });
    } catch (e) {
        return { ok: false, providerMessageId: null, erro: msgErro(e, 'erro_envio') };
    }
    if (!r.ok || !r.providerMessageId) return { ok: false, providerMessageId: null, erro: r.erro || 'sem_id_da_mensagem' };

    // Registra com quem enviou. Se o eco do webhook chegou antes, a mensagem já existe como
    // "vendedor sem consultor": o ajuste abaixo corrige o autor e quem enviou.
    const { error } = await admin.rpc('wa_registrar_mensagem', {
        p: {
            telefone: conv.telefone_key,
            remote_jid: conv.remote_jid,
            provider_message_id: r.providerMessageId,
            autor: quem.autor,
            consultant_id: quem.consultantId ?? null,
            tipo: conteudo.tipo === 'texto' ? 'texto' : conteudo.tipo,
            texto: conteudo.tipo === 'texto' ? conteudo.texto.trim() : null,
            legenda: conteudo.tipo === 'imagem' ? conteudo.legenda ?? null : null,
            midia_mime: conteudo.tipo === 'imagem' ? conteudo.mime : conteudo.tipo === 'audio' ? 'audio/ogg' : null,
            status_entrega: 'enviada',
            origem: 'crm',
            criada_em: new Date().toISOString(),
        },
    });
    if (error) console.warn('[wa/envio] enviou mas não registrou:', error.message);
    await admin.from('wa_mensagens')
        .update({ autor: quem.autor, consultant_id: quem.consultantId ?? null, origem: 'crm' })
        .eq('provider_message_id', r.providerMessageId);

    // Vendedor respondendo pelo CRM = assumiu a conversa (a Laura para).
    if (quem.autor === 'vendedor') {
        await admin.from('wa_conversas').update({ status: 'humano', ia_silenciada_ate: null }).eq('id', conv.id).eq('status', 'ia');
    }
    return { ok: true, providerMessageId: r.providerMessageId };
}

export type AcaoHumano = 'assumir' | 'devolver' | 'arquivar' | 'desarquivar';

/**
 * Botões "Assumir", "Devolver para a IA", "Arquivar" e "Desarquivar".
 * Arquivar = status 'encerrada': sai da lista, a Laura não responde. Assumir/Devolver não reabrem arquivada.
 */
export async function mudarAtendimento(admin: SupabaseClient, conversaId: string, acao: AcaoHumano): Promise<boolean> {
    if (acao === 'arquivar') {
        const { error } = await admin.from('wa_conversas').update({ status: 'encerrada', ia_silenciada_ate: null }).eq('id', conversaId);
        return !error;
    }
    if (acao === 'desarquivar') {
        const { error } = await admin.from('wa_conversas').update({ status: 'ia', ia_silenciada_ate: null }).eq('id', conversaId).eq('status', 'encerrada');
        return !error;
    }
    const { error } = await admin.from('wa_conversas')
        .update(acao === 'assumir' ? { status: 'humano', ia_silenciada_ate: null } : { status: 'ia', ia_silenciada_ate: null })
        .eq('id', conversaId).neq('status', 'encerrada');
    return !error;
}

/** O cliente escreveu de novo numa conversa arquivada: ela volta para a lista (nunca perde cliente). */
export async function reabrirArquivadas(admin: SupabaseClient, conversaIds: string[]): Promise<number> {
    if (!conversaIds.length) return 0;
    const { data } = await admin.from('wa_conversas').update({ status: 'ia' }).in('id', conversaIds).eq('status', 'encerrada').select('id');
    return data?.length ?? 0;
}

/**
 * "Humano assumiu": mensagem enviada pelo celular da loja (vendedor sem consultant_id e
 * origem diferente de 'crm'). Espera um instante (o CRM registra o próprio envio logo
 * depois de mandar), confere de novo e só então põe a conversa em 'humano'.
 */
export async function marcarHumanoSeNecessario(
    admin: SupabaseClient,
    alvos: { conversaId: string; mensagemId: string }[],
    esperaMs = 4000,
): Promise<number> {
    if (!alvos.length) return 0;
    await new Promise(r => setTimeout(r, esperaMs));
    let n = 0;
    for (const a of alvos) {
        const { data: m } = await admin.from('wa_mensagens')
            .select('autor, consultant_id, origem').eq('id', a.mensagemId).maybeSingle();
        if (!m || m.autor !== 'vendedor' || m.consultant_id || m.origem === 'crm') continue;
        const { data } = await admin.from('wa_conversas')
            .update({ status: 'humano', ia_silenciada_ate: null }).eq('id', a.conversaId).eq('status', 'ia').select('id');
        if (data?.length) n++;
    }
    return n;
}

/**
 * Fotos do estoque (por URL) depois do texto do carro. Registra cada uma como do vendedor, igual ao envio normal.
 * As URLs vêm do feed da Altimus (o servidor confere o carro; nunca aceita URL solta do navegador).
 */
export async function enviarFotosPorUrl(
    admin: SupabaseClient,
    provider: WhatsAppProvider,
    conv: ConversaEnvio,
    urls: string[],
    quem: QuemEnviou,
    pausaMs = 1200,
): Promise<number> {
    const para = conv.remote_jid || conv.telefone_key;
    let enviadas = 0;
    for (const url of urls) {
        if (enviadas > 0 && pausaMs > 0) await new Promise(r => setTimeout(r, pausaMs));
        const r = await provider.enviarMidia(para, { tipo: 'imagem', url, mime: 'image/jpeg' }).catch(() => null);
        if (!r?.ok || !r.providerMessageId) continue;
        enviadas++;
        await admin.rpc('wa_registrar_mensagem', { p: {
            telefone: conv.telefone_key, remote_jid: conv.remote_jid, provider_message_id: r.providerMessageId,
            autor: quem.autor, consultant_id: quem.consultantId ?? null, tipo: 'imagem', midia_mime: 'image/jpeg',
            status_entrega: 'enviada', origem: 'crm', criada_em: new Date().toISOString(),
        } });
        await admin.from('wa_mensagens').update({ autor: quem.autor, consultant_id: quem.consultantId ?? null, origem: 'crm' }).eq('provider_message_id', r.providerMessageId);
    }
    // Vendedor mandando fotos pelo CRM também assume a conversa (a Laura para), igual ao envio de texto.
    if (enviadas > 0 && quem.autor === 'vendedor') {
        await admin.from('wa_conversas').update({ status: 'humano', ia_silenciada_ate: null }).eq('id', conv.id).eq('status', 'ia');
    }
    return enviadas;
}
