import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/admin';
import {
    parseEvolutionWebhook, payloadSeguro, telefoneKey,
    type EventoMensagem, type EventoWa, type WaStatusEntrega,
} from './evolutionParser';
import { providerLoja } from './evolutionProvider';
import type { WhatsAppProvider } from './provider';
import { BUCKET_MIDIA, caminhoMidia, excedeLimite, extensaoMidia, mimeBase, tipoTemMidia } from './midia';
import { transcreverAudio } from './transcricao';
import { msgErro } from './erro';
import { decidirAutor } from './autor';

/**
 * Ingestão do WhatsApp da loja em "modo sombra": grava tudo em wa_conversas /
 * wa_mensagens, não mostra nada para ninguém e não responde a ninguém.
 *
 * Fluxo: n8n recebe o webhook da Evolution → nó HTTP em paralelo manda o
 * corpo cru para POST /api/wa/ingest → aqui.
 *   1. parse (evolutionParser)            — puro
 *   2. grava a mensagem (wa_registrar_mensagem) — atômico e idempotente
 *   3. depois da resposta (after): baixa a mídia pela Evolution, grava no
 *      bucket privado e transcreve todo áudio
 */

export const FONTE_ERRO = 'wa_ingest';

export interface MidiaPendente {
    mensagemId: string;
    conversaId: string;
    evento: EventoMensagem;
    deConsultor?: boolean;
}

export interface ResultadoIngestao {
    eventos: number;
    gravadas: number;
    repetidas: number;
    edicoes: number;
    apagadas: number;
    status: number;
    ignorados: Record<string, number>;
    erros: string[];
    midiasPendentes: MidiaPendente[];
    /** Mensagens novas de cliente (não de consultor, não reação): disparam a Laura do CRM. */
    novasDoCliente: { conversaId: string; mensagemId: string; criadaEm: string; tipo: string }[];
}

export interface OpcoesIngestao {
    /** Só aceita eventos desta instância (WA_LOJA_INSTANCIA). */
    instancia: string;
    /** fromMe que chega pelo n8n é a Laura (menos aviso a consultor = sistema). Envio do CRM já existe e não é sobrescrito. */
    autorFromMe?: 'laura' | 'vendedor' | 'sistema';
    supabase?: SupabaseClient;
}

export async function registrarErro(
    supabase: SupabaseClient,
    mensagem: string,
    payload: unknown,
    fonte = FONTE_ERRO,
): Promise<void> {
    try {
        await supabase.from('webhook_errors').insert({
            source: fonte,
            error_message: mensagem.slice(0, 1000),
            payload: payload === undefined ? null : payloadSeguro(payload),
        });
    } catch (e) {
        console.error('[wa] não consegui gravar em webhook_errors:', msgErro(e));
    }
}

function contar(map: Record<string, number>, k: string) {
    map[k] = (map[k] || 0) + 1;
}

/**
 * Telefones (telefone_key) dos consultores, com cache de 5 min. Serve para
 * separar o aviso que o CRM manda ao vendedor pelo número da loja da fala da Laura.
 * Se a consulta falhar, devolve vazio (a mensagem é gravada do mesmo jeito).
 */
let cacheConsultores: { em: number; chaves: Set<string> } | null = null;

async function telefonesDeConsultores(supabase: SupabaseClient): Promise<Set<string>> {
    if (cacheConsultores && Date.now() - cacheConsultores.em < 5 * 60_000) return cacheConsultores.chaves;
    const chaves = new Set<string>();
    try {
        const { data, error } = await supabase.from('consultants_manos_crm').select('phone, personal_whatsapp');
        if (error) throw new Error(error.message);
        for (const c of data || []) {
            for (const t of [c.phone, c.personal_whatsapp]) {
                const k = telefoneKey(t);
                if (k) chaves.add(k);
            }
        }
        cacheConsultores = { em: Date.now(), chaves };
    } catch (e) {
        console.warn('[wa] telefones de consultores indisponíveis:', msgErro(e));
    }
    return chaves;
}

function extraDe(e: EventoMensagem, telefoneDeConsultor = false): Record<string, unknown> {
    const extra: Record<string, unknown> = { tipo_original: e.tipoOriginal };
    if (telefoneDeConsultor) extra.telefone_de_consultor = true;
    if (e.localizacao) extra.localizacao = e.localizacao;
    if (e.contatos) extra.contatos = e.contatos;
    if (e.dispositivo) extra.dispositivo = e.dispositivo;
    if (e.midia?.ptt) extra.ptt = true;
    if (e.midia && excedeLimite(e.tipo, e.midia.bytes)) extra.acima_do_limite = true;
    return extra;
}

function paramsMensagem(e: EventoMensagem, autorFromMe: 'laura' | 'vendedor' | 'sistema', telefoneDeConsultor: boolean) {
    const extra = extraDe(e, telefoneDeConsultor);
    return {
        telefone: e.telefone,
        remote_jid: e.remoteJid,
        nome_contato: e.nomeContato,
        provider_message_id: e.providerMessageId,
        autor: decidirAutor(e.fromMe, telefoneDeConsultor, autorFromMe),
        tipo: e.tipo,
        texto: e.texto,
        legenda: e.legenda,
        midia_mime: e.midia?.mime ?? null,
        midia_bytes: e.midia?.bytes ?? null,
        midia_nome: e.midia?.nomeArquivo ?? null,
        duracao_s: e.midia?.duracaoS ?? null,
        extra,
        citada_message_id: e.citadaMessageId,
        status_entrega: e.fromMe ? 'enviada' : null,
        origem: 'evolution',
        criada_em: e.enviadaEm,
    };
}

const STATUS_ABAIXO: Record<WaStatusEntrega, WaStatusEntrega[]> = {
    enviada: [],
    entregue: ['enviada', 'falhou'],
    lida: ['enviada', 'entregue', 'falhou'],
    falhou: ['enviada'],
};

async function aplicarEvento(
    supabase: SupabaseClient,
    e: EventoWa,
    opts: Required<Pick<OpcoesIngestao, 'instancia' | 'autorFromMe'>>,
    r: ResultadoIngestao,
    consultores: Set<string>,
): Promise<void> {
    if (e.kind === 'ignorado') { contar(r.ignorados, e.motivo); return; }
    if (e.instancia && e.instancia !== opts.instancia) { contar(r.ignorados, 'outra_instancia'); return; }

    if (e.kind === 'mensagem') {
        const deConsultor = consultores.has(e.telefoneKey);
        const { data, error } = await supabase.rpc('wa_registrar_mensagem', { p: paramsMensagem(e, opts.autorFromMe, deConsultor) });
        if (error) throw new Error(`wa_registrar_mensagem: ${error.message}`);
        const out = data as { conversa_id: string; mensagem_id: string; nova: boolean };
        if (!out?.nova) { r.repetidas++; return; }
        r.gravadas++;
        if (!e.fromMe && !deConsultor && e.tipo !== 'reacao') {
            r.novasDoCliente.push({ conversaId: out.conversa_id, mensagemId: out.mensagem_id, criadaEm: e.enviadaEm, tipo: e.tipo });
        }
        if (tipoTemMidia(e.tipo) && e.midia) {
            r.midiasPendentes.push({ mensagemId: out.mensagem_id, conversaId: out.conversa_id, evento: e, deConsultor });
        }
        return;
    }

    if (e.kind === 'edicao') {
        const { data: atual } = await supabase.from('wa_mensagens')
            .select('id, tipo, texto, legenda, extra').eq('provider_message_id', e.providerMessageId).maybeSingle();
        if (!atual) { contar(r.ignorados, 'edicao_sem_original'); return; }
        const campo = atual.tipo === 'texto' ? 'texto' : 'legenda';
        const extra = { ...(atual.extra || {}), antes_da_edicao: (atual as Record<string, unknown>)[campo] ?? null };
        const { error } = await supabase.from('wa_mensagens')
            .update({ [campo]: e.novoTexto, editada_em: e.editadaEm, extra })
            .eq('id', atual.id);
        if (error) throw new Error(`edição: ${error.message}`);
        r.edicoes++;
        return;
    }

    if (e.kind === 'apagada') {
        const { error, count } = await supabase.from('wa_mensagens')
            .update({ apagada_em: e.apagadaEm }, { count: 'exact' })
            .eq('provider_message_id', e.providerMessageId)
            .is('apagada_em', null);
        if (error) throw new Error(`apagada: ${error.message}`);
        if (count) r.apagadas++; else contar(r.ignorados, 'apagada_sem_original');
        return;
    }

    if (e.kind === 'status') {
        const abaixo = STATUS_ABAIXO[e.status];
        const filtro = ['status_entrega.is.null', ...(abaixo.length ? [`status_entrega.in.(${abaixo.join(',')})`] : [])].join(',');
        const { error, count } = await supabase.from('wa_mensagens')
            .update({ status_entrega: e.status }, { count: 'exact' })
            .eq('provider_message_id', e.providerMessageId)
            .or(filtro);
        if (error) throw new Error(`status: ${error.message}`);
        if (count) r.status++; else contar(r.ignorados, 'status_sem_mudanca');
    }
}

/** Processa um webhook inteiro. Não lança: erro de um evento vai para webhook_errors. */
export async function ingerirWebhook(payload: unknown, opcoes: OpcoesIngestao): Promise<ResultadoIngestao> {
    const supabase = opcoes.supabase ?? createClient();
    const opts = { instancia: opcoes.instancia, autorFromMe: opcoes.autorFromMe ?? 'laura' } as const;
    const r: ResultadoIngestao = {
        eventos: 0, gravadas: 0, repetidas: 0, edicoes: 0, apagadas: 0, status: 0,
        ignorados: {}, erros: [], midiasPendentes: [], novasDoCliente: [],
    };

    const eventos = parseEvolutionWebhook(payload);
    r.eventos = eventos.length;
    const consultores = eventos.some(e => e.kind === 'mensagem')
        ? await telefonesDeConsultores(supabase)
        : new Set<string>();
    for (const e of eventos) {
        try {
            await aplicarEvento(supabase, e, opts, r, consultores);
        } catch (err) {
            const msg = msgErro(err);
            r.erros.push(msg);
            await registrarErro(supabase, `[${e.kind}] ${msg}`, payload);
        }
    }
    // Lid sem telefone: não dá para ligar a conversa a ninguém. Registra para medir.
    if (r.ignorados.lid_sem_telefone) {
        await registrarErro(supabase, 'mensagem com JID @lid sem telefone (não gravada)', payload);
    }
    return r;
}

// ---------------------------------------------------------------------------
// Mídia e transcrição (rodam depois da resposta e no cron de reprocesso)
// ---------------------------------------------------------------------------

export interface LinhaMidia {
    id: string;
    conversa_id: string;
    provider_message_id: string;
    tipo: string;
    midia_mime: string | null;
    midia_bytes: number | null;
    midia_nome: string | null;
    midia_tentativas: number;
    transcricao_tentativas: number;
    extra: Record<string, unknown> | null;
    criada_em: string;
    remote_jid?: string | null;
    autor?: string;
}

async function transcreverEGravar(
    supabase: SupabaseClient,
    linha: Pick<LinhaMidia, 'id' | 'transcricao_tentativas' | 'extra'>,
    base64: string,
    mime: string | null,
): Promise<boolean> {
    try {
        const a = await transcreverAudio(base64, mime);
        await supabase.from('wa_mensagens').update({
            transcricao: a.transcricao,
            transcricao_tentativas: linha.transcricao_tentativas + 1,
            extra: { ...(linha.extra || {}), analise_audio: { sentimento: a.sentimento, objecao: a.objecao, resumo: a.resumo_audio } },
        }).eq('id', linha.id);
        return true;
    } catch (e) {
        await supabase.from('wa_mensagens').update({
            transcricao_tentativas: linha.transcricao_tentativas + 1,
            extra: { ...(linha.extra || {}), transcricao_erro: msgErro(e).slice(0, 300) },
        }).eq('id', linha.id);
        return false;
    }
}

/**
 * Baixa a mídia pela Evolution (ou usa o base64 do webhook), grava em
 * whatsapp-midia/AAAA/MM/<conversa>/<mensagem>.<ext> e transcreve áudio.
 */
export async function processarMidia(
    supabase: SupabaseClient,
    provider: WhatsAppProvider | null,
    linha: LinhaMidia,
    evento?: EventoMensagem,
): Promise<'ok' | 'acima_do_limite' | 'falhou'> {
    const tentativas = linha.midia_tentativas + 1;
    if (excedeLimite(linha.tipo, linha.midia_bytes)) {
        await supabase.from('wa_mensagens').update({ midia_erro: 'acima_do_limite', midia_tentativas: tentativas }).eq('id', linha.id);
        await registrarErro(supabase, `mídia acima do limite (${linha.tipo}, ${linha.midia_bytes} bytes): guardada só a referência`,
            { mensagem_id: linha.id, tipo: linha.tipo, bytes: linha.midia_bytes }, 'wa_midia');
        return 'acima_do_limite';
    }
    try {
        let base64 = evento?.midia?.base64 || null;
        let mime = linha.midia_mime;
        let nome = linha.midia_nome;
        if (!base64) {
            if (!provider) throw new Error('provedor da Evolution não configurado');
            const baixada = await provider.baixarMidia({
                providerMessageId: linha.provider_message_id,
                remoteJid: evento?.remoteJid ?? linha.remote_jid ?? undefined,
                fromMe: evento ? evento.fromMe : linha.autor !== 'cliente',
                bruto: evento?.midia?.ref ?? null,
            });
            base64 = baixada.base64;
            mime = mime || baixada.mime;
            nome = nome || baixada.nomeArquivo;
        }
        const buffer = Buffer.from(base64, 'base64');
        if (excedeLimite(linha.tipo, buffer.byteLength)) {
            await supabase.from('wa_mensagens').update({
                midia_erro: 'acima_do_limite', midia_bytes: buffer.byteLength, midia_tentativas: tentativas,
            }).eq('id', linha.id);
            return 'acima_do_limite';
        }
        const caminho = caminhoMidia(linha.conversa_id, linha.id, extensaoMidia(linha.tipo, mime, nome), linha.criada_em);
        const { error: upErr } = await supabase.storage.from(BUCKET_MIDIA).upload(caminho, buffer, {
            contentType: mimeBase(mime) || 'application/octet-stream',
            upsert: true,
        });
        if (upErr) throw new Error(`upload: ${upErr.message}`);
        await supabase.from('wa_mensagens').update({
            midia_path: caminho,
            midia_mime: mime,
            midia_bytes: buffer.byteLength,
            midia_nome: nome,
            midia_erro: null,
            midia_tentativas: tentativas,
        }).eq('id', linha.id);

        if (linha.tipo === 'audio') {
            await transcreverEGravar(supabase, linha, base64, mime);
        }
        return 'ok';
    } catch (e) {
        const msg = msgErro(e).slice(0, 300);
        await supabase.from('wa_mensagens').update({ midia_erro: `falha_download: ${msg}`, midia_tentativas: tentativas }).eq('id', linha.id);
        await registrarErro(supabase, `mídia não baixada: ${msg}`, { mensagem_id: linha.id, tipo: linha.tipo }, 'wa_midia');
        return 'falhou';
    }
}

/** Chamado via after() pela rota de ingestão. */
export async function processarMidiasPendentes(pendentes: MidiaPendente[]): Promise<void> {
    if (!pendentes.length) return;
    const supabase = createClient();
    let provider: WhatsAppProvider | null = null;
    try { provider = providerLoja(); } catch { provider = null; }
    for (const p of pendentes) {
        const e = p.evento;
        await processarMidia(supabase, provider, {
            id: p.mensagemId,
            conversa_id: p.conversaId,
            provider_message_id: e.providerMessageId,
            tipo: e.tipo,
            midia_mime: e.midia?.mime ?? null,
            midia_bytes: e.midia?.bytes ?? null,
            midia_nome: e.midia?.nomeArquivo ?? null,
            midia_tentativas: 0,
            transcricao_tentativas: 0,
            extra: extraDe(e, p.deConsultor),
            criada_em: e.enviadaEm,
        }, e);
    }
}

/** Reprocesso de transcrição a partir do arquivo já no bucket (cron). */
export async function retranscreverDoBucket(
    supabase: SupabaseClient,
    linha: { id: string; midia_path: string; midia_mime: string | null; transcricao_tentativas: number; extra: Record<string, unknown> | null },
): Promise<boolean> {
    const { data, error } = await supabase.storage.from(BUCKET_MIDIA).download(linha.midia_path);
    if (error || !data) {
        await supabase.from('wa_mensagens').update({
            transcricao_tentativas: linha.transcricao_tentativas + 1,
            extra: { ...(linha.extra || {}), transcricao_erro: `arquivo indisponível: ${error?.message || 'vazio'}` },
        }).eq('id', linha.id);
        return false;
    }
    const base64 = Buffer.from(await data.arrayBuffer()).toString('base64');
    return transcreverEGravar(supabase, linha, base64, linha.midia_mime);
}
