import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hashData, normalizePhone } from '@/lib/meta-service';

/**
 * CONVERSÕES OFFLINE DO GOOGLE ADS
 *
 * Devolve ao Google Ads o que aconteceu no funil do CRM com leads que vieram dele:
 *   QualifiedLead (4 respostas)  → ação "lead qualificado"
 *   Schedule (visita agendada)   → ação "visita agendada"
 *   Purchase (venda)             → ação "venda" (com o valor real)
 * para o algoritmo aprender a buscar quem de fato visita e compra, não só quem preenche formulário.
 *
 * Fonte dos eventos: a MESMA fila que o banco já alimenta para a Meta (meta_capi_queue). Aqui só se escolhe
 * quem é do Google e se registra o envio em google_conv_envios — sem mexer nos gatilhos.
 *
 * Identificação (o Google exige uma das duas):
 *   - gclid do clique (utm_params.gclid), quando o site/n8n guardou;
 *   - e-mail e/ou telefone com hash SHA-256 ("conversões otimizadas para leads"; exige essa opção
 *     ligada na ação de conversão dentro do Google Ads).
 * Deduplicação: orderId = event_id da fila (o Google ignora repetição do mesmo orderId).
 * LGPD: sai só hash de e-mail/telefone e o gclid. Nada de nome, cidade, veículo ou conversa.
 *
 * Modo (GOOGLE_ADS_CONVERSIONS_MODE): off (padrão, não envia) | test (validateOnly: o Google valida e não grava) | live.
 */

export type ModoGoogle = 'off' | 'test' | 'live';
export type EventoFunil = 'QualifiedLead' | 'Schedule' | 'Purchase';

export interface ConfigGoogleConv {
    modo: ModoGoogle;
    versao: string;
    clienteId?: string;
    loginClienteId?: string;
    /** ID numérico da ação de conversão no Google Ads, por evento. Evento sem ação configurada é ignorado. */
    acoes: Partial<Record<EventoFunil, string>>;
}

const env = (n: string) => (process.env[n] || '').trim() || undefined;

export function configGoogleConv(): ConfigGoogleConv {
    const m = (env('GOOGLE_ADS_CONVERSIONS_MODE') || 'off').toLowerCase();
    return {
        modo: m === 'live' || m === 'test' ? m : 'off',
        versao: env('GOOGLE_ADS_API_VERSION') || 'v22',
        clienteId: env('GOOGLE_ADS_CUSTOMER_ID')?.replace(/\D/g, ''),
        loginClienteId: env('GOOGLE_ADS_LOGIN_CUSTOMER_ID')?.replace(/\D/g, ''),
        acoes: {
            QualifiedLead: env('GOOGLE_ADS_CONVERSION_ACTION_QUALIFICADO')?.replace(/\D/g, ''),
            Schedule: env('GOOGLE_ADS_CONVERSION_ACTION_VISITA')?.replace(/\D/g, ''),
            Purchase: env('GOOGLE_ADS_CONVERSION_ACTION_VENDA')?.replace(/\D/g, ''),
        },
    };
}

export interface ItemGoogle {
    fila_id: number;
    event_name: EventoFunil;
    order_id: string;
    event_time: string;
    created_at: string;
    attempts: number;
}

export interface PerfilGoogle {
    crm26?: { id?: string | number; telefone?: string | null; utm_params?: Record<string, unknown> | null; valor_venda?: unknown } | null;
    master?: { telefone?: string | null; email?: string | null; utm_params?: Record<string, unknown> | null; ticket_estimado?: unknown } | null;
    valor_venda?: number | null;
}

// ---------------------------------------------------------------------------
// Regras puras
// ---------------------------------------------------------------------------

const utmDe = (p: PerfilGoogle): Record<string, unknown> => {
    const a = p.crm26?.utm_params;
    if (a && Object.keys(a).length) return a;
    return p.master?.utm_params || {};
};

/** O lead veio do Google? gclid ou plataforma 'google' no utm, ou origem 'google' na tabela. */
export function leadEhDoGoogle(p: PerfilGoogle, origem?: string | null): boolean {
    const utm = utmDe(p);
    if (utm.gclid || utm.gbraid || utm.wbraid) return true;
    if (typeof utm.platform === 'string' && utm.platform.toLowerCase() === 'google') return true;
    return (origem || '').toLowerCase().includes('google');
}

/** E-mail: minúsculo e sem espaços; no gmail os pontos do nome não contam (regra do Google). */
export function hashEmailGoogle(email: string | null | undefined): string | null {
    const e = (email || '').trim().toLowerCase();
    if (!e || !e.includes('@')) return null;
    let [usuario, dominio] = [e.slice(0, e.lastIndexOf('@')), e.slice(e.lastIndexOf('@') + 1)];
    if (dominio === 'gmail.com' || dominio === 'googlemail.com') { usuario = usuario.split('+')[0].replace(/\./g, ''); dominio = 'gmail.com'; }
    return createHash('sha256').update(`${usuario}@${dominio}`).digest('hex');
}

/** Telefone em E.164 (+55…) com hash. */
export function hashTelefoneGoogle(tel: string | null | undefined): string | null {
    const n = normalizePhone(tel || '');
    if (!n || n.length < 12) return null;
    return hashData(`+${n}`) || null;
}

/** "2026-11-19 14:03:00-03:00" — o formato de data que o Google pede, no horário de Brasília. */
export function dataHoraGoogle(iso: string): string {
    const ms = new Date(iso).getTime();
    return `${new Date(ms - 3 * 3_600_000).toISOString().slice(0, 19).replace('T', ' ')}-03:00`;
}

function valorDaVenda(p: PerfilGoogle): number | null {
    for (const c of [p.valor_venda, p.crm26?.valor_venda, p.master?.ticket_estimado]) {
        const n = Number(String(c ?? '').replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
        if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100;
    }
    return null;
}

export type DecisaoGoogle =
    | { tipo: 'enviar'; canal: 'gclid' | 'enhanced'; conversao: Record<string, unknown> }
    | { tipo: 'adiar'; motivo: string; minutos: number }
    | { tipo: 'ignorar'; motivo: string };

/** Monta a conversão. Puro (sem rede): o que sai aqui é exatamente o que vai para o Google. */
export function montarConversao(item: ItemGoogle, perfil: PerfilGoogle, cfg: ConfigGoogleConv, agora = Date.now()): DecisaoGoogle {
    const acao = cfg.acoes[item.event_name];
    if (!cfg.clienteId) return { tipo: 'ignorar', motivo: 'GOOGLE_ADS_CUSTOMER_ID ausente' };
    if (!acao) return { tipo: 'ignorar', motivo: `ação de conversão do evento ${item.event_name} não configurada` };

    const utm = utmDe(perfil);
    const base: Record<string, unknown> = {
        conversionAction: `customers/${cfg.clienteId}/conversionActions/${acao}`,
        conversionDateTime: dataHoraGoogle(item.event_time),
        orderId: item.order_id,
    };
    if (item.event_name === 'Purchase') {
        const valor = valorDaVenda(perfil);
        // Venda costuma ser lançada sem valor: espera até 24 h por ele antes de mandar sem (igual à Meta).
        if (valor === null && (agora - new Date(item.created_at).getTime()) / 3_600_000 < 24) {
            return { tipo: 'adiar', motivo: 'aguardando valor da venda', minutos: 120 };
        }
        if (valor !== null) { base.conversionValue = valor; base.currencyCode = 'BRL'; }
    }

    const gclid = typeof utm.gclid === 'string' && utm.gclid ? utm.gclid : null;
    if (gclid) return { tipo: 'enviar', canal: 'gclid', conversao: { ...base, gclid } };

    // Sem gclid: identificadores com hash (conversões otimizadas para leads).
    const ids: Record<string, string>[] = [];
    const em = hashEmailGoogle(perfil.master?.email);
    const ph = hashTelefoneGoogle(perfil.crm26?.telefone || perfil.master?.telefone);
    if (em) ids.push({ hashedEmail: em });
    if (ph) ids.push({ hashedPhoneNumber: ph });
    if (!ids.length) return { tipo: 'ignorar', motivo: 'lead sem gclid, e-mail ou telefone para identificar o clique' };
    return { tipo: 'enviar', canal: 'enhanced', conversao: { ...base, userIdentifiers: ids } };
}

// ---------------------------------------------------------------------------
// Envio (rede + banco)
// ---------------------------------------------------------------------------

const DIAS_MAX = 90;   // o Google só aceita conversão com até 90 dias
const MAX_TENTATIVAS = 5;

async function tokenGoogle(): Promise<string> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(15_000),
        body: new URLSearchParams({
            client_id: env('GOOGLE_ADS_CLIENT_ID') || '', client_secret: env('GOOGLE_ADS_CLIENT_SECRET') || '',
            refresh_token: env('GOOGLE_ADS_REFRESH_TOKEN') || '', grant_type: 'refresh_token',
        }),
    });
    const j = await res.json().catch(() => null) as { access_token?: string; error?: string; error_description?: string } | null;
    if (!res.ok || !j?.access_token) throw new Error(j?.error === 'invalid_grant' ? 'refresh token do Google Ads expirou (invalid_grant)' : `Google OAuth: ${j?.error_description || j?.error || res.status}`);
    return j.access_token;
}

export interface ResultadoGoogle { fila_id: number; resultado: 'enviado' | 'validado' | 'adiado' | 'ignorado' | 'falhou' | 'expirado'; canal?: string; detalhe?: string }

async function enviarConversao(cfg: ConfigGoogleConv, conversao: Record<string, unknown>, validarApenas: boolean): Promise<{ ok: boolean; erro?: string }> {
    const token = await tokenGoogle();
    const dev = env('GOOGLE_ADS_DEVELOPER_TOKEN') || '';
    const res = await fetch(`https://googleads.googleapis.com/${cfg.versao}/customers/${cfg.clienteId}:uploadClickConversions`, {
        method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(20_000),
        headers: {
            Authorization: `Bearer ${token}`, 'developer-token': dev, 'Content-Type': 'application/json',
            ...(cfg.loginClienteId ? { 'login-customer-id': cfg.loginClienteId } : {}),
        },
        body: JSON.stringify({ conversions: [conversao], partialFailure: true, validateOnly: validarApenas }),
    });
    const j = await res.json().catch(() => null) as { partialFailureError?: { message?: string }; error?: { message?: string } } | null;
    if (!res.ok) return { ok: false, erro: j?.error?.message || `HTTP ${res.status}` };
    if (j?.partialFailureError) return { ok: false, erro: j.partialFailureError.message || 'o Google recusou a conversão' };
    return { ok: true };
}

/** Processa um envio pendente. Nunca lança. */
export async function processarEnvio(admin: SupabaseClient, item: ItemGoogle, cfg: ConfigGoogleConv, modoTeste: boolean): Promise<ResultadoGoogle> {
    const agora = new Date().toISOString();
    const marcar = (campos: Record<string, unknown>) => admin.from('google_conv_envios').update({ ...campos, updated_at: agora }).eq('fila_id', item.fila_id);

    if (Date.now() - new Date(item.event_time).getTime() > DIAS_MAX * 86_400_000) {
        await marcar({ status: 'expired' });
        return { fila_id: item.fila_id, resultado: 'expirado' };
    }
    const { data: perfil, error } = await admin.rpc('fn_meta_capi_perfil', { p_fila_id: item.fila_id });
    if (error || !perfil) return falhar(admin, item, `perfil do lead indisponível: ${error?.message || 'vazio'}`);

    const decisao = montarConversao(item, perfil as PerfilGoogle, cfg);
    if (decisao.tipo === 'adiar') {
        await marcar({ not_before: new Date(Date.now() + decisao.minutos * 60_000).toISOString(), last_error: decisao.motivo });
        return { fila_id: item.fila_id, resultado: 'adiado', detalhe: decisao.motivo };
    }
    if (decisao.tipo === 'ignorar') {
        await marcar({ status: 'ignored', last_error: decisao.motivo });
        return { fila_id: item.fila_id, resultado: 'ignorado', detalhe: decisao.motivo };
    }

    let r: { ok: boolean; erro?: string };
    try { r = await enviarConversao(cfg, decisao.conversao, modoTeste); }
    catch (e) { r = { ok: false, erro: e instanceof Error ? e.message : 'falha de rede' }; }
    if (!r.ok) return falhar(admin, item, r.erro || 'erro', modoTeste);

    if (modoTeste) {   // validado pelo Google, mas NÃO consome: em live ainda será enviado de verdade
        await marcar({ validated_at: agora, canal: decisao.canal, last_error: null });
        return { fila_id: item.fila_id, resultado: 'validado', canal: decisao.canal };
    }
    await marcar({ status: 'sent', sent_at: agora, canal: decisao.canal, attempts: item.attempts + 1, last_error: null });
    return { fila_id: item.fila_id, resultado: 'enviado', canal: decisao.canal };
}

async function falhar(admin: SupabaseClient, item: ItemGoogle, motivo: string, modoTeste = false): Promise<ResultadoGoogle> {
    if (!modoTeste) {
        const t = item.attempts + 1;   // espera 10, 20, 40, 80 min; na 5ª desiste (fica visível)
        await admin.from('google_conv_envios').update({
            attempts: t, last_error: motivo.slice(0, 500), status: t >= MAX_TENTATIVAS ? 'failed' : 'pending',
            not_before: new Date(Date.now() + 5 * 2 ** t * 60_000).toISOString(), updated_at: new Date().toISOString(),
        }).eq('fila_id', item.fila_id);
    }
    return { fila_id: item.fila_id, resultado: 'falhou', detalhe: motivo };
}

/**
 * 1) registra em google_conv_envios os eventos novos do funil (decide se o lead é do Google);
 * 2) envia (ou valida) os pendentes. Modo off não faz nada.
 */
export async function despacharGoogle(admin: SupabaseClient, opts: { cfg?: ConfigGoogleConv; limite?: number } = {}) {
    const cfg = opts.cfg || configGoogleConv();
    if (cfg.modo === 'off') return { modo: cfg.modo, processados: 0, novos: 0, motivo: 'GOOGLE_ADS_CONVERSIONS_MODE=off' };
    const limite = Math.min(Math.max(opts.limite || 30, 1), 100);
    const corte = new Date(Date.now() - DIAS_MAX * 86_400_000).toISOString();

    // 1. eventos do funil ainda não vistos pelo Google
    const { data: fila, error: eFila } = await admin.from('meta_capi_queue')
        .select('id, event_name, event_id, lead_table, lead_id, event_time, created_at').gte('created_at', corte).order('id', { ascending: false }).limit(300);
    if (eFila) throw new Error(`meta_capi_queue: ${eFila.message}`);
    const ids = (fila || []).map(f => f.id as number);
    const { data: vistos } = ids.length ? await admin.from('google_conv_envios').select('fila_id').in('fila_id', ids) : { data: [] as { fila_id: number }[] };
    const jaVisto = new Set((vistos || []).map(v => v.fila_id));
    let novos = 0;
    for (const f of (fila || []).filter(x => !jaVisto.has(x.id as number)).slice(0, limite)) {
        const { data: perfil } = await admin.rpc('fn_meta_capi_perfil', { p_fila_id: f.id });
        const p = (perfil || {}) as PerfilGoogle;
        let origem: string | null = null;
        if (p.crm26?.id) {
            const { data: o } = await admin.from('leads_distribuicao_crm_26').select('origem').eq('id', p.crm26.id).maybeSingle();
            origem = (o?.origem as string | null) ?? null;
        }
        const doGoogle = Boolean(perfil) && leadEhDoGoogle(p, origem);
        await admin.from('google_conv_envios').insert({
            fila_id: f.id, event_name: f.event_name, order_id: f.event_id,
            status: doGoogle ? 'pending' : 'ignored', last_error: doGoogle ? null : 'lead não é do Google',
        });
        novos++;
    }

    // 2. pendentes (em teste: só os ainda não validados)
    const modoTeste = cfg.modo === 'test';
    let q = admin.from('google_conv_envios').select('fila_id, event_name, order_id, attempts, created_at').eq('status', 'pending')
        .lte('not_before', new Date().toISOString()).order('not_before', { ascending: true }).limit(limite);
    if (modoTeste) q = q.is('validated_at', null);
    const { data: pend, error } = await q;
    if (error) throw new Error(`google_conv_envios: ${error.message}`);

    const resultados: ResultadoGoogle[] = [];
    for (const p of pend || []) {
        const { data: f } = await admin.from('meta_capi_queue').select('event_time, created_at').eq('id', p.fila_id).maybeSingle();
        if (!f) { resultados.push({ fila_id: p.fila_id, resultado: 'ignorado', detalhe: 'evento sumiu da fila' }); continue; }
        resultados.push(await processarEnvio(admin, {
            fila_id: p.fila_id, event_name: p.event_name as EventoFunil, order_id: p.order_id, event_time: f.event_time as string,
            created_at: f.created_at as string, attempts: p.attempts as number,
        }, cfg, modoTeste));
    }
    const contagem: Record<string, number> = {};
    for (const r of resultados) contagem[r.resultado] = (contagem[r.resultado] || 0) + 1;
    return { modo: cfg.modo, novos, processados: resultados.length, contagem, resultados };
}
