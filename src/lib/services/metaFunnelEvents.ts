import type { SupabaseClient } from '@supabase/supabase-js';
import { hashData, normalizePhone } from '@/lib/meta-service';
import { getMetaApiVersion } from '@/lib/metaConfig';

/**
 * EVENTOS DO FUNIL NA META CONVERSIONS API
 *
 * A fila meta_capi_queue é alimentada por trigger no banco (ver migration
 * 20261014_origem_lead_meta_capi.sql) quando o lead:
 *   - responde as 4 perguntas (entrada, pagamento, troca, prazo) → QualifiedLead
 *   - agenda visita (status ou tabela agendamentos)            → Schedule
 *   - compra                                                    → Purchase
 *
 * Este módulo pega cada item da fila e envia para a Meta por um de dois canais:
 *
 *   1. Mensagens (Click-to-WhatsApp): quando o lead tem ctwa_clid e o ambiente
 *      tem META_WABA_ID + META_CAPI_MESSAGING_DATASET_ID. action_source
 *      'business_messaging'. É ESTE sinal que permite trocar a otimização das
 *      campanhas CTWA de "conversa" para "leads"/"compras". O lead qualificado
 *      vai como LeadSubmitted (o evento de lead que a Meta conta nesse canal).
 *      Schedule não existe nesse canal — cai no canal 2.
 *   2. CRM (padrão): META_CAPI_DATASET_ID, action_source 'system_generated'
 *      (venda: 'physical_store').
 *
 * LGPD: sai do CRM só o que a Meta exige para casar o evento — hash SHA-256 de
 * telefone e e-mail, id interno hasheado (external_id) e os ids de clique da
 * própria Meta (ctwa_clid, fbc, lead_id). Nada de nome, cidade, veículo ou
 * texto da conversa. Todo envio fica registrado em meta_conversions_log.
 *
 * Nada de id de dataset ou token no código: tudo vem do ambiente.
 */

export type ModoFunil = 'off' | 'test' | 'live';

export interface ConfigFunil {
    modo: ModoFunil;
    apiVersion: string;
    datasetId?: string;
    token?: string;
    messagingDatasetId?: string;
    messagingToken?: string;
    wabaId?: string;
    testEventCode?: string;
}

function env(nome: string): string | undefined {
    const v = (process.env[nome] || '').trim();
    return v || undefined;
}

export function configFunil(): ConfigFunil {
    const modo = (env('META_CAPI_FUNNEL_MODE') || 'off').toLowerCase();
    const token = env('META_CAPI_ACCESS_TOKEN') || env('META_ACCESS_TOKEN');
    return {
        modo: modo === 'live' || modo === 'test' ? modo : 'off',
        apiVersion: getMetaApiVersion(),
        datasetId: env('META_CAPI_DATASET_ID'),
        token,
        messagingDatasetId: env('META_CAPI_MESSAGING_DATASET_ID'),
        messagingToken: env('META_CAPI_MESSAGING_ACCESS_TOKEN') || token,
        wabaId: env('META_WABA_ID'),
        testEventCode: env('META_TEST_EVENT_CODE'),
    };
}

export interface ItemFila {
    id: number;
    event_name: 'QualifiedLead' | 'Schedule' | 'Purchase';
    event_id: string;
    lead_table: string;
    lead_id: string;
    event_time: string;
    not_before: string;
    attempts: number;
    created_at: string;
}

interface PerfilLead {
    crm26?: Record<string, any> | null;
    master?: Record<string, any> | null;
    valor_venda?: number | null;
}

/** Eventos aceitos no canal de mensagens e o nome usado lá. */
const EVENTO_MENSAGENS: Partial<Record<ItemFila['event_name'], string>> = {
    QualifiedLead: 'LeadSubmitted',
    Purchase: 'Purchase',
};

/**
 * Hashes de telefone. Número de celular BR salvo sem o 9º dígito (comum em
 * JID antigo do WhatsApp) vai nas duas formas — a Meta aceita lista em `ph`.
 */
function hashesTelefone(raw?: string | null): string[] {
    if (!raw) return [];
    const n = normalizePhone(raw);
    if (!n || n.length < 12) return [];
    const formas = new Set([n]);
    if (n.length === 12 && n.startsWith('55') && /[6-9]/.test(n[4])) {
        formas.add(n.slice(0, 4) + '9' + n.slice(4));
    }
    return [...formas].map(f => hashData(f)).filter(Boolean);
}

function unix(iso: string): number {
    return Math.floor(new Date(iso).getTime() / 1000);
}

function valorVenda(p: PerfilLead): number | null {
    const candidatos = [p.valor_venda, p.crm26?.valor_venda, p.master?.ticket_estimado];
    for (const c of candidatos) {
        const n = Number(String(c ?? '').replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
        if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100;
    }
    return null;
}

export type Decisao =
    | { tipo: 'enviar'; canal: 'business_messaging' | 'crm'; url: string; token: string; body: Record<string, any> }
    | { tipo: 'adiar'; motivo: string; minutos: number }
    | { tipo: 'falha'; motivo: string };

/**
 * Monta o evento. Puro (sem rede) — testável e auditável: o que vai em
 * `body` é exatamente o que é gravado no log.
 */
export function montarEvento(item: ItemFila, perfil: PerfilLead, cfg: ConfigFunil, testEventCode?: string): Decisao {
    const utm: Record<string, any> =
        (perfil.crm26?.utm_params && Object.keys(perfil.crm26.utm_params).length ? perfil.crm26.utm_params : null) ||
        perfil.master?.utm_params || {};

    const custom: Record<string, any> = {};
    if (item.event_name === 'Purchase') {
        const valor = valorVenda(perfil);
        const idadeHoras = (Date.now() - new Date(item.created_at).getTime()) / 3_600_000;
        // Venda costuma ser lançada sem valor. Espera até 24h pelo valor antes
        // de mandar sem ele (a contagem da compra ainda serve pra otimização).
        if (valor === null && idadeHoras < 24 && !testEventCode) {
            return { tipo: 'adiar', motivo: 'aguardando valor da venda', minutos: 120 };
        }
        custom.currency = 'BRL';
        custom.value = valor ?? 0;
    }

    const ctwaClid: string | undefined = utm.ctwa_clid || undefined;
    const nomeMensagens = EVENTO_MENSAGENS[item.event_name];

    // Canal 1: mensagens (CTWA)
    if (ctwaClid && nomeMensagens && cfg.wabaId && cfg.messagingDatasetId && cfg.messagingToken) {
        const body: Record<string, any> = {
            data: [{
                event_name: nomeMensagens,
                event_time: unix(item.event_time),
                event_id: item.event_id,
                action_source: 'business_messaging',
                messaging_channel: 'whatsapp',
                user_data: {
                    whatsapp_business_account_id: cfg.wabaId,
                    ctwa_clid: ctwaClid,
                },
                ...(Object.keys(custom).length ? { custom_data: custom } : {}),
            }],
        };
        if (testEventCode) body.test_event_code = testEventCode;
        return {
            tipo: 'enviar',
            canal: 'business_messaging',
            url: `https://graph.facebook.com/${cfg.apiVersion}/${cfg.messagingDatasetId}/events`,
            token: cfg.messagingToken,
            body,
        };
    }

    // Canal 2: CRM
    if (!cfg.datasetId || !cfg.token) {
        return { tipo: 'falha', motivo: 'META_CAPI_DATASET_ID ou token ausente no ambiente' };
    }

    const telefone = perfil.crm26?.telefone || perfil.master?.telefone;
    const email = perfil.master?.email;
    const userData: Record<string, any> = {};
    const ph = hashesTelefone(telefone);
    if (ph.length) userData.ph = ph;
    if (email) userData.em = [hashData(email)];
    userData.country = [hashData('br')];
    // Mesmo id para todos os eventos da pessoa, venha o evento de crm26 ou master.
    const idInterno = perfil.crm26?.id ? `crm26:${perfil.crm26.id}` : perfil.master?.id ? `master:${perfil.master.id}` : `${item.lead_table}:${item.lead_id}`;
    userData.external_id = [hashData(idInterno)];

    // Lead de formulário Meta: o leadgen_id casa o evento com o lead 100%.
    const leadgenId = perfil.crm26?.lead_id || (utm.channel === 'lead_form' && utm.platform === 'meta' ? perfil.master?.id_meta : null);
    if (leadgenId && /^\d+$/.test(String(leadgenId))) userData.lead_id = Number(leadgenId);

    // Clique em anúncio Meta no site: fbc no formato fb.1.<ms>.<fbclid>.
    if (utm.fbclid) {
        const ms = utm.captured_at ? new Date(utm.captured_at).getTime() : Date.now();
        userData.fbc = `fb.1.${Number.isFinite(ms) ? ms : Date.now()}.${utm.fbclid}`;
    }

    if (!userData.ph && !userData.em && !userData.lead_id && !userData.fbc) {
        return { tipo: 'falha', motivo: 'lead sem telefone, e-mail ou id de clique para casar o evento' };
    }

    const body: Record<string, any> = {
        data: [{
            event_name: item.event_name,
            event_time: unix(item.event_time),
            event_id: item.event_id,
            action_source: item.event_name === 'Purchase' ? 'physical_store' : 'system_generated',
            user_data: userData,
            custom_data: {
                event_source: 'crm',
                lead_event_source: 'Manos CRM',
                ...custom,
            },
        }],
    };
    if (testEventCode) body.test_event_code = testEventCode;

    return {
        tipo: 'enviar',
        canal: 'crm',
        url: `https://graph.facebook.com/${cfg.apiVersion}/${cfg.datasetId}/events`,
        token: cfg.token,
        body,
    };
}

async function logar(admin: SupabaseClient, item: ItemFila, perfil: PerfilLead, r: {
    status: 'SUCCESS' | 'FAILED';
    response_code?: number | null;
    response_payload?: any;
    payload_sent?: any;
    error_message?: string | null;
}) {
    const { error } = await admin.from('meta_conversions_log').insert({
        lead_id: `${item.lead_table}:${item.lead_id}`,
        fb_lead_id: perfil.crm26?.lead_id || null,
        event_name: item.event_name,
        event_id: item.event_id,
        status: r.status,
        response_code: r.response_code ?? null,
        response_payload: r.response_payload ?? null,
        payload_sent: r.payload_sent ?? {},
        error_message: r.error_message ?? null,
    });
    if (error) console.error('[meta-funil] falha ao gravar meta_conversions_log:', error.message);
}

export interface ResultadoItem {
    id: number;
    event_name: string;
    resultado: 'enviado' | 'enviado_teste' | 'adiado' | 'falhou' | 'expirado';
    canal?: string;
    detalhe?: string;
}

const MAX_TENTATIVAS = 5;

/** Processa um item da fila. Nunca lança. */
export async function processarItem(
    admin: SupabaseClient,
    item: ItemFila,
    cfg: ConfigFunil,
    testEventCode?: string
): Promise<ResultadoItem> {
    const agora = new Date().toISOString();
    const emTeste = Boolean(testEventCode);

    // A Meta recusa evento com mais de 7 dias.
    if (Date.now() - new Date(item.event_time).getTime() > 7 * 24 * 3_600_000) {
        if (!emTeste) {
            await admin.from('meta_capi_queue').update({ status: 'expired', updated_at: agora }).eq('id', item.id);
        }
        return { id: item.id, event_name: item.event_name, resultado: 'expirado' };
    }

    const { data: perfil, error: perfilErr } = await admin.rpc('fn_meta_capi_perfil', { p_fila_id: item.id });
    if (perfilErr || !perfil) {
        return registrarFalha(admin, item, `perfil do lead indisponível: ${perfilErr?.message || 'vazio'}`, emTeste);
    }

    const decisao = montarEvento(item, perfil as PerfilLead, cfg, testEventCode);

    if (decisao.tipo === 'adiar') {
        await admin.from('meta_capi_queue')
            .update({ not_before: new Date(Date.now() + decisao.minutos * 60_000).toISOString(), last_error: decisao.motivo, updated_at: agora })
            .eq('id', item.id);
        return { id: item.id, event_name: item.event_name, resultado: 'adiado', detalhe: decisao.motivo };
    }

    if (decisao.tipo === 'falha') {
        await logar(admin, item, perfil as PerfilLead, { status: 'FAILED', error_message: decisao.motivo });
        return registrarFalha(admin, item, decisao.motivo, emTeste);
    }

    let status = 0;
    let resposta: any = null;
    try {
        const res = await fetch(decisao.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${decisao.token}` },
            body: JSON.stringify(decisao.body),
            signal: AbortSignal.timeout(15_000),
        });
        status = res.status;
        resposta = await res.json().catch(() => null);
    } catch (e: any) {
        resposta = { error: { message: e?.message || 'falha de rede' } };
    }

    const ok = status >= 200 && status < 300 && !resposta?.error;
    const erro = ok ? null : (resposta?.error?.message || `HTTP ${status}`);

    await logar(admin, item, perfil as PerfilLead, {
        status: ok ? 'SUCCESS' : 'FAILED',
        response_code: status || null,
        response_payload: resposta,
        payload_sent: decisao.body,
        error_message: erro,
    });

    if (!ok) return registrarFalha(admin, item, erro!, emTeste);

    if (emTeste) {
        // Teste não consome o item: em 'live' ele ainda vai para o dataset de verdade.
        await admin.from('meta_capi_queue').update({ test_sent_at: agora, canal: decisao.canal, updated_at: agora }).eq('id', item.id);
        return { id: item.id, event_name: item.event_name, resultado: 'enviado_teste', canal: decisao.canal };
    }

    await admin.from('meta_capi_queue')
        .update({ status: 'sent', sent_at: agora, canal: decisao.canal, attempts: item.attempts + 1, last_error: null, updated_at: agora })
        .eq('id', item.id);
    return { id: item.id, event_name: item.event_name, resultado: 'enviado', canal: decisao.canal };
}

async function registrarFalha(admin: SupabaseClient, item: ItemFila, motivo: string, emTeste: boolean): Promise<ResultadoItem> {
    if (!emTeste) {
        const tentativas = item.attempts + 1;
        // Backoff: 10, 20, 40, 80 min; na 5ª falha desiste (fica visível no log).
        await admin.from('meta_capi_queue').update({
            attempts: tentativas,
            last_error: motivo.slice(0, 500),
            status: tentativas >= MAX_TENTATIVAS ? 'failed' : 'pending',
            not_before: new Date(Date.now() + 5 * 2 ** tentativas * 60_000).toISOString(),
            updated_at: new Date().toISOString(),
        }).eq('id', item.id);
    }
    return { id: item.id, event_name: item.event_name, resultado: 'falhou', detalhe: motivo };
}

/**
 * Drena a fila. Em teste, usa só itens ainda não testados e não consome nada.
 */
export async function despacharFila(
    admin: SupabaseClient,
    opts: { cfg?: ConfigFunil; testEventCode?: string; limite?: number } = {}
) {
    const cfg = opts.cfg || configFunil();
    const testEventCode = opts.testEventCode || (cfg.modo === 'test' ? cfg.testEventCode : undefined);

    if (!testEventCode && cfg.modo !== 'live') {
        return { modo: cfg.modo, processados: 0, motivo: cfg.modo === 'test' ? 'META_TEST_EVENT_CODE ausente' : 'META_CAPI_FUNNEL_MODE=off' };
    }

    let q = admin.from('meta_capi_queue')
        .select('id, event_name, event_id, lead_table, lead_id, event_time, not_before, attempts, created_at')
        .eq('status', 'pending')
        .order('not_before', { ascending: true })
        .limit(Math.min(Math.max(opts.limite || 50, 1), 200));

    q = testEventCode
        ? q.is('test_sent_at', null)
        : q.lte('not_before', new Date().toISOString());

    const { data, error } = await q;
    if (error) throw new Error(`meta_capi_queue: ${error.message}`);

    const resultados: ResultadoItem[] = [];
    for (const item of (data || []) as ItemFila[]) {
        resultados.push(await processarItem(admin, item, cfg, testEventCode));
    }

    const contagem: Record<string, number> = {};
    for (const r of resultados) contagem[r.resultado] = (contagem[r.resultado] || 0) + 1;

    return { modo: testEventCode ? 'test' : 'live', processados: resultados.length, contagem, resultados };
}
