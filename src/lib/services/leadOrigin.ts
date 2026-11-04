import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * ORIGEM DO LEAD — de qual anúncio/campanha/clique o lead veio.
 *
 * Cada canal entrega a origem num formato diferente e em lugares diferentes:
 *   - WhatsApp (Click-to-WhatsApp): o objeto `referral` só vem na PRIMEIRA
 *     mensagem do cliente. Cloud API: messages[].referral (snake_case).
 *     Evolution/Baileys: message.*.contextInfo.externalAdReply (camelCase).
 *   - Google Ads (formulário de lead): webhook com campaign_id, adgroup_id,
 *     creative_id, gcl_id e as respostas em user_column_data.
 *   - Site (SitecompraAtualizado): o funil já manda `atribuicao` (UTMs e
 *     click ids, first/last touch) no POST que vai pro n8n.
 *
 * Tudo é normalizado num objeto que vai para utm_params do lead via
 * registrar_origem_lead() — que NÃO sobrescreve origem existente (first touch)
 * e guarda como pendente se o lead ainda não foi criado pelo n8n.
 *
 * id_meta: leads_master.id_meta é UNIQUE, então lá vai o ctwa_clid (único por
 * clique), nunca o id do anúncio (que se repete entre leads).
 */

export interface OrigemExtraida {
    canal: 'whatsapp' | 'google_lead_form' | 'site' | 'manual';
    telefone: string;
    /** Vai para utm_params. Só identificadores de campanha — nada de texto da conversa. */
    origem: Record<string, unknown>;
    /** ctwa_clid (CTWA) ou leadgen_id (formulário Meta). */
    idMeta?: string | null;
    vehicleInterest?: string | null;
    /** Respostas do formulário, com as 4 de qualificação em chaves fixas quando reconhecidas. */
    respostas?: Record<string, string> | null;
    /** Payload original, só quando é pequeno e útil (formulário do Google). */
    bruto?: unknown;
}

const MAX_TEXTO = 300;

function texto(v: unknown, max = MAX_TEXTO): string | undefined {
    if (v === undefined || v === null) return undefined;
    const s = String(v).trim();
    return s ? s.slice(0, max) : undefined;
}

function semVazios<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v === undefined || v === null || v === '') continue;
        out[k] = v;
    }
    return out;
}

function soDigitos(v: unknown): string {
    return String(v ?? '').replace(/\D/g, '');
}

// ---------------------------------------------------------------------------
// WhatsApp (Click-to-WhatsApp)
// ---------------------------------------------------------------------------

type Achado = { obj: Record<string, any>; pai: Record<string, any> | null };

/**
 * Procura o referral em qualquer profundidade. O formato muda conforme a
 * versão do Evolution, se o n8n repassa cru ou embrulhado, e se é Cloud API —
 * procurar pela forma do objeto é mais estável que fixar o caminho.
 */
function acharReferral(payload: unknown): Achado | null {
    const fila: Array<{ v: unknown; pai: Record<string, any> | null; prof: number }> = [{ v: payload, pai: null, prof: 0 }];
    while (fila.length) {
        const { v, pai, prof } = fila.shift()!;
        if (!v || typeof v !== 'object' || prof > 10) continue;
        if (Array.isArray(v)) {
            for (const item of v) fila.push({ v: item, pai, prof: prof + 1 });
            continue;
        }
        const o = v as Record<string, any>;
        const cloud = o.ctwa_clid || (o.source_id && o.source_type);
        const baileys = o.ctwaClid || (o.sourceId && o.sourceType);
        if (cloud || baileys) return { obj: o, pai };
        for (const [k, filho] of Object.entries(o)) {
            // Miniaturas em base64 podem ter centenas de KB — não vale descer.
            if (k === 'jpegThumbnail' || k === 'thumbnail') continue;
            fila.push({ v: filho, pai: o, prof: prof + 1 });
        }
    }
    return null;
}

/** Telefone do remetente nos formatos Cloud API, Evolution e n8n. */
function telefoneWhatsApp(p: any): string {
    const cloudMsg = p?.entry?.[0]?.changes?.[0]?.value;
    if (cloudMsg) {
        const from = cloudMsg.messages?.[0]?.from || cloudMsg.contacts?.[0]?.wa_id;
        if (from) return soDigitos(from);
    }

    const key = p?.data?.key || p?.key;
    if (key) {
        const jid = String(key.remoteJid || '');
        // JID novo (@lid) não é telefone: o número real vem em senderPn / remoteJidAlt.
        if (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@c.us')) return soDigitos(jid.split('@')[0]);
        const alt = key.senderPn || key.remoteJidAlt || key.participantPn;
        if (alt) return soDigitos(String(alt).split('@')[0]);
    }

    return soDigitos(p?.telefone || p?.phone || p?.wa_id || p?.sender || '');
}

export function extrairOrigemWhatsApp(payload: unknown): OrigemExtraida | null {
    const p = payload as any;

    // Mensagem nossa ou de grupo não é lead.
    const key = p?.data?.key || p?.key;
    if (key?.fromMe === true) return null;
    if (String(key?.remoteJid || '').endsWith('@g.us')) return null;

    const achado = acharReferral(payload);
    if (!achado) return null;

    const telefone = telefoneWhatsApp(p);
    if (telefone.length < 10) return null;

    const r = achado.obj;
    const ctx = achado.pai || {};
    const isCloud = Boolean(r.ctwa_clid || r.source_id);
    const ctwaClid = texto(r.ctwa_clid ?? r.ctwaClid, 500);
    const wabaId = isCloud ? texto(p?.entry?.[0]?.id, 40) : undefined;

    const origem = semVazios({
        platform: 'meta',
        channel: 'ctwa',
        source_type: texto(r.source_type ?? r.sourceType, 40),
        source_id: texto(r.source_id ?? r.sourceId, 60),
        source_url: texto(r.source_url ?? r.sourceUrl, 500),
        headline: texto(r.headline ?? r.title),
        body: texto(r.body),
        media_type: texto(r.media_type ?? r.mediaType, 20),
        ctwa_clid: ctwaClid,
        // facebook | instagram — de onde veio o clique (só Baileys informa)
        app: texto(ctx.entryPointConversionApp ?? ctx.conversionSource, 40),
        waba_id: wabaId,
        capture_source: isCloud ? 'whatsapp_cloud_api' : 'evolution',
        captured_at: new Date().toISOString(),
    });

    return { canal: 'whatsapp', telefone, origem, idMeta: ctwaClid ?? null };
}

// ---------------------------------------------------------------------------
// Google Ads — webhook do formulário de lead
// ---------------------------------------------------------------------------

export function isGoogleLeadForm(payload: unknown): boolean {
    const p = payload as any;
    return Array.isArray(p?.user_column_data) || (p?.google_key !== undefined && p?.lead_id !== undefined);
}

/**
 * Reconhece as 4 perguntas de qualificação pelo texto da pergunta. As chaves
 * são as mesmas do CRM (entrada, pagamento, troca, prazo_compra).
 */
function chaveQualificacao(pergunta: string): string | null {
    const q = pergunta.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (/troca/.test(q)) return 'troca';
    if (/entrada/.test(q)) return 'entrada';
    if (/prazo|quando .*compra|quando pretende|em quanto tempo/.test(q)) return 'prazo_compra';
    if (/pagamento|pagar|financ|a vista|forma de compra/.test(q)) return 'pagamento';
    return null;
}

function ehPerguntaDeVeiculo(pergunta: string): boolean {
    const q = pergunta.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return /veiculo|modelo|carro|moto|interesse|vehicle|model/.test(q) && !/troca/.test(q);
}

export function extrairOrigemGoogle(payload: unknown): OrigemExtraida | null {
    const p = payload as any;
    const colunas: any[] = Array.isArray(p?.user_column_data) ? p.user_column_data : [];

    const porId = (id: string) =>
        colunas.find(c => String(c?.column_id || '').toUpperCase() === id)?.string_value as string | undefined;

    const telefone = soDigitos(porId('PHONE_NUMBER') || porId('WORK_PHONE') || '');
    if (telefone.length < 10) return null;

    const respostas: Record<string, string> = {};
    let vehicleInterest: string | null = null;
    for (const c of colunas) {
        const id = String(c?.column_id || '').toUpperCase();
        // Campos de contato já estão no lead — não duplicamos dado pessoal.
        if (['FULL_NAME', 'FIRST_NAME', 'LAST_NAME', 'PHONE_NUMBER', 'WORK_PHONE', 'EMAIL', 'WORK_EMAIL', 'POSTAL_CODE', 'STREET_ADDRESS'].includes(id)) continue;
        const pergunta = String(c?.column_name || id || '').trim();
        const valor = texto(c?.string_value);
        if (!pergunta || !valor) continue;

        const chave = chaveQualificacao(pergunta);
        if (chave) respostas[chave] = valor;
        else respostas[pergunta.slice(0, 80)] = valor;

        if (!vehicleInterest && ehPerguntaDeVeiculo(pergunta)) vehicleInterest = valor;
    }

    const origem = semVazios({
        platform: 'google',
        channel: 'lead_form',
        campaign_id: texto(p.campaign_id, 40),
        adgroup_id: texto(p.adgroup_id, 40),
        creative_id: texto(p.creative_id, 40),
        gclid: texto(p.gcl_id ?? p.gclid, 500),
        form_id: texto(p.form_id, 40),
        lead_id: texto(p.lead_id, 200),
        capture_source: 'google_ads_webhook',
        captured_at: new Date().toISOString(),
    });

    // Bruto sem o google_key (é o segredo do webhook) e sem os dados de contato.
    const { google_key: _segredo, user_column_data: _colunas, ...resto } = p || {};

    return {
        canal: 'google_lead_form',
        telefone,
        origem,
        vehicleInterest,
        respostas: Object.keys(respostas).length ? respostas : null,
        bruto: resto,
    };
}

// ---------------------------------------------------------------------------
// Site (funil SitecompraAtualizado → n8n)
// ---------------------------------------------------------------------------

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id'];
const CLICK_KEYS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'ttclid', 'msclkid'];

function plataformaDoSite(a: Record<string, any>): string {
    if (a.gclid || a.gbraid || a.wbraid) return 'google';
    if (a.fbclid) return 'meta';
    const src = String(a.utm_source || a.canal || '').toLowerCase();
    if (/google/.test(src)) return 'google';
    if (/facebook|instagram|\bfb\b|\big\b|meta/.test(src)) return 'meta';
    if (/tiktok/.test(src)) return 'tiktok';
    return src || 'site';
}

export function extrairOrigemSite(payload: unknown): OrigemExtraida | null {
    const p = payload as any;
    const a = p?.atribuicao;
    if (!a || typeof a !== 'object') return null;

    const telefone = soDigitos(p.phone || p.telefone || '');
    if (telefone.length < 10) return null;

    const origem: Record<string, unknown> = {
        platform: plataformaDoSite(a),
        channel: 'site_form',
    };
    for (const k of UTM_KEYS) if (a[k]) origem[k] = texto(a[k], 200);
    for (const k of CLICK_KEYS) if (a[k]) origem[k] = texto(a[k], 500);

    let referrerHost: string | undefined;
    try {
        referrerHost = a.referrer ? new URL(String(a.referrer)).hostname : undefined;
    } catch { /* referrer inválido — ignora */ }

    Object.assign(origem, semVazios({
        canal: texto(a.canal, 60),
        landing_page: texto(a.landing_page, 300),
        referrer_host: referrerHost,
        first_touch: a.first_touch && typeof a.first_touch === 'object' ? a.first_touch : undefined,
        // Liga o lead ao visitante do pixel do site (mesmo id nos dois lados).
        external_id: texto(p.external_id, 100),
        site_lead_id: texto(p.lead_id, 100),
        capture_source: 'site_funil',
        captured_at: texto(a.captured_at, 40) || new Date().toISOString(),
    }));

    return { canal: 'site', telefone, origem };
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------

/** Detecta o canal pelo formato do payload e extrai a origem. */
export function extrairOrigem(payload: unknown): OrigemExtraida | null {
    const p = payload as any;
    if (!p || typeof p !== 'object') return null;

    if (isGoogleLeadForm(p)) return extrairOrigemGoogle(p);
    if (p.atribuicao) return extrairOrigemSite(p);

    // Formato explícito (nó Code do n8n): { telefone, origem: {...}, id_meta? }
    if (p.origem && typeof p.origem === 'object' && (p.telefone || p.phone)) {
        const telefone = soDigitos(p.telefone || p.phone);
        if (telefone.length < 10) return null;
        return {
            canal: 'manual',
            telefone,
            origem: { ...p.origem, capture_source: p.origem.capture_source || 'manual' },
            idMeta: texto(p.id_meta, 500) ?? null,
            vehicleInterest: texto(p.vehicle_interest) ?? null,
        };
    }

    return extrairOrigemWhatsApp(p);
}

export interface ResultadoRegistro {
    ok: boolean;
    crm26_atualizados?: number;
    master_atualizados?: number;
    pendente?: boolean;
    motivo?: string;
}

export async function registrarOrigemLead(
    admin: SupabaseClient,
    o: OrigemExtraida
): Promise<ResultadoRegistro> {
    const extras = semVazios({
        vehicle_interest: o.vehicleInterest || undefined,
        respostas: o.respostas || undefined,
        bruto: o.bruto || undefined,
    });

    const { data, error } = await admin.rpc('registrar_origem_lead', {
        p_telefone: o.telefone,
        p_origem: o.origem,
        p_id_meta: o.idMeta || null,
        p_extras: Object.keys(extras).length ? extras : null,
    });

    if (error) {
        return { ok: false, motivo: error.message };
    }
    return data as ResultadoRegistro;
}
