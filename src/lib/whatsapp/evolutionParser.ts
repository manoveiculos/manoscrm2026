/**
 * Parser dos webhooks da Evolution API (Baileys) para o modelo do CRM.
 *
 * Arquivo PURO: sem import, sem rede, sem banco. Assim os testes rodam com
 * `node --test` direto (o Node 22 remove os tipos sozinho) e o mesmo código é
 * usado pela rota antiga (/api/webhook/whatsapp) e pela ingestão nova
 * (/api/wa/ingest).
 *
 * Formatos aceitos:
 *   - Evolution v2: { event: 'messages.upsert', instance, data: { key, message, ... } }
 *   - Evolution v1: { event: 'MESSAGES_UPSERT', ... } e messages.update em lista
 *   - o mesmo corpo embrulhado pelo nó Webhook do n8n: { headers, body: {...} }
 *
 * Saída: lista de EventoWa (um webhook pode trazer mais de uma atualização).
 * Nada aqui decide autor (cliente/laura/vendedor): isso é da ingestão.
 */

export type WaTipo =
    | 'texto' | 'imagem' | 'audio' | 'video' | 'documento'
    | 'figurinha' | 'localizacao' | 'contato' | 'reacao';

export type WaStatusEntrega = 'enviada' | 'entregue' | 'lida' | 'falhou';

export interface WaMidia {
    mime: string | null;
    bytes: number | null;
    duracaoS: number | null;
    nomeArquivo: string | null;
    /** Áudio gravado na hora (nota de voz). */
    ptt: boolean;
    /** Base64 que a Evolution manda quando "webhook_base64" está ligado. */
    base64: string | null;
    /**
     * key + message crus, para pedir o arquivo à Evolution
     * (getBase64FromMediaMessage baixa direto do WhatsApp com a mediaKey).
     */
    ref: { key: Record<string, unknown>; message: Record<string, unknown> } | null;
}

export interface WaLocalizacao {
    lat: number | null;
    lng: number | null;
    nome: string | null;
    endereco: string | null;
}

export interface WaContato {
    nome: string | null;
    telefones: string[];
}

interface EventoBase {
    instancia: string | null;
    providerMessageId: string;
    remoteJid: string;
    /** Só dígitos, como vem do WhatsApp (com DDI). */
    telefone: string;
    /** DDD + número com 9º dígito (11) para celular BR; fixo BR tem 10. */
    telefoneKey: string;
    fromMe: boolean;
}

export interface EventoMensagem extends EventoBase {
    kind: 'mensagem';
    nomeContato: string | null;
    tipo: WaTipo;
    /** Tipo cru da Evolution (conversation, imageMessage, ...). */
    tipoOriginal: string;
    texto: string | null;
    legenda: string | null;
    midia: WaMidia | null;
    citadaMessageId: string | null;
    localizacao: WaLocalizacao | null;
    contatos: WaContato[] | null;
    /** Mensagem alvo de uma reação. */
    reacaoAlvoId: string | null;
    enviadaEm: string;
    dispositivo: string | null;
}

export interface EventoEdicao extends EventoBase {
    kind: 'edicao';
    novoTexto: string | null;
    editadaEm: string;
}

export interface EventoApagada extends EventoBase {
    kind: 'apagada';
    apagadaEm: string;
}

export interface EventoStatus {
    kind: 'status';
    instancia: string | null;
    providerMessageId: string;
    status: WaStatusEntrega;
    em: string;
}

export interface EventoIgnorado {
    kind: 'ignorado';
    motivo: string;
    providerMessageId?: string | null;
}

export type EventoWa = EventoMensagem | EventoEdicao | EventoApagada | EventoStatus | EventoIgnorado;

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

// JSON cru da Evolution: sem esquema fixo, por isso any aqui (e só aqui).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = Record<string, any>;

function isObj(v: unknown): v is Obj {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
    if (typeof v === 'string') {
        const t = v.trim();
        return t.length ? t : null;
    }
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return null;
}

/** Long do protobuf ({low, high}), string ou número → número. */
export function numero(v: unknown): number | null {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string') {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    if (isObj(v) && typeof v.low === 'number') {
        const high = typeof v.high === 'number' ? v.high : 0;
        return high * 2 ** 32 + (v.low >>> 0);
    }
    return null;
}

function digitos(s: string | null | undefined): string {
    return (s || '').replace(/\D/g, '');
}

/**
 * Chave do telefone usada em wa_conversas.telefone_key.
 *   - celular BR: DDD + 9 + 8 dígitos (11). Se o JID vier sem o 9º dígito
 *     (comum em números antigos), ele é recolocado.
 *   - fixo BR: DDD + 8 dígitos (10).
 *   - estrangeiro: o número inteiro com DDI.
 * Mesma regra de public.wa_telefone_key() na migration.
 */
export function telefoneKey(raw: string | null | undefined): string | null {
    let d = digitos(raw).replace(/^0+/, '');
    if (d.length < 8) return null;
    if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
    else if (d.length > 11) return d; // estrangeiro
    if (d.length === 10 && /[6-9]/.test(d[2])) d = d.slice(0, 2) + '9' + d.slice(2);
    if (d.length === 10 || d.length === 11) return d;
    return null;
}

function paraIso(ts: unknown, fallback?: unknown): string {
    const n = numero(ts);
    if (n && n > 0) {
        // segundos (WhatsApp) ou milissegundos
        const ms = n < 1e12 ? n * 1000 : n;
        return new Date(ms).toISOString();
    }
    const f = str(fallback);
    if (f) {
        const d = new Date(f);
        if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    return new Date().toISOString();
}

/** Tira o embrulho do nó Webhook do n8n ({ headers, body }) e listas de 1 item. */
export function desembrulhar(payload: unknown): Obj | null {
    let p: unknown = payload;
    if (Array.isArray(p) && p.length === 1) p = p[0];
    if (isObj(p) && isObj(p.body) && (p.body.event || p.body.data)) p = p.body;
    if (isObj(p) && isObj(p.json) && (p.json.event || p.json.data)) p = p.json;
    return isObj(p) ? p : null;
}

function nomeEvento(p: Obj): string {
    return String(p.event || p.type || '').toLowerCase().replace(/_/g, '.');
}

/** Resolve o telefone do JID. Com o "LID" novo do WhatsApp o número vem em outro campo. */
function resolverTelefone(key: Obj, data: Obj): { jid: string; telefone: string } | null {
    const jid = str(key.remoteJid) || str(data.remoteJid);
    if (!jid) return null;
    if (/@g\.us$|@broadcast$|@newsletter$/.test(jid) || jid === 'status@broadcast') return null;
    let fonte: string | null = jid;
    if (/@lid$/.test(jid)) {
        fonte = str(key.remoteJidAlt) || str(key.senderPn) || str(data.senderPn) || str(key.participantAlt) || null;
        if (!fonte) return null;
    }
    const telefone = digitos(fonte.split('@')[0].split(':')[0]);
    if (!telefone) return null;
    return { jid, telefone };
}

const EMBRULHOS = [
    'ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension',
    'documentWithCaptionMessage', 'editedMessage',
];

/** Abre ephemeral/viewOnce/documentWithCaption até chegar no conteúdo real. */
function abrirMensagem(message: unknown): Obj {
    let m: Obj = isObj(message) ? message : {};
    for (let i = 0; i < 4; i++) {
        const emb = EMBRULHOS.find(k => isObj(m[k]) && isObj(m[k].message));
        if (!emb) break;
        // editedMessage é tratado como edição antes de chegar aqui
        if (emb === 'editedMessage') break;
        m = m[emb].message;
    }
    return m;
}

function contextInfo(data: Obj, m: Obj): Obj | null {
    if (isObj(data.contextInfo)) return data.contextInfo;
    for (const k of Object.keys(m)) {
        if (isObj(m[k]) && isObj(m[k].contextInfo)) return m[k].contextInfo;
    }
    return null;
}

function telefonesDoVcard(vcard: unknown): string[] {
    const v = str(vcard);
    if (!v) return [];
    const out: string[] = [];
    for (const linha of v.split(/\r?\n/)) {
        if (!/^(item\d+\.)?TEL/i.test(linha)) continue;
        const waid = linha.match(/waid=(\d+)/i);
        const d = waid ? waid[1] : digitos(linha.split(':').slice(1).join(':'));
        if (d && !out.includes(d)) out.push(d);
    }
    return out;
}

function semBase64(message: Obj): Obj {
    if (!('base64' in message)) return message;
    const resto = { ...message };
    delete resto.base64;
    return resto;
}

function midiaDe(node: Obj, data: Obj, m: Obj, ptt = false): WaMidia {
    return {
        mime: str(node.mimetype),
        bytes: numero(node.fileLength),
        duracaoS: numero(node.seconds),
        nomeArquivo: str(node.fileName) || str(node.title),
        ptt: ptt || node.ptt === true,
        base64: str(m.base64) || str(data.base64) || null,
        ref: isObj(data.key) && isObj(data.message) ? { key: data.key, message: semBase64(data.message) } : null,
    };
}

// ---------------------------------------------------------------------------
// Status de entrega
// ---------------------------------------------------------------------------

/** Baileys: 0 ERROR, 1 PENDING, 2 SERVER_ACK, 3 DELIVERY_ACK, 4 READ, 5 PLAYED. */
export function mapearStatus(v: unknown): WaStatusEntrega | null {
    if (v === null || v === undefined) return null;
    const s = String(v).toUpperCase();
    switch (s) {
        case '0': case 'ERROR': case 'FAILED': return 'falhou';
        case '2': case 'SERVER_ACK': case 'SENT': return 'enviada';
        case '3': case 'DELIVERY_ACK': case 'DELIVERED': return 'entregue';
        case '4': case '5': case 'READ': case 'PLAYED': return 'lida';
        default: return null; // PENDING e desconhecidos não mudam nada
    }
}

const ORDEM_STATUS: Record<WaStatusEntrega, number> = { enviada: 1, entregue: 2, lida: 3, falhou: 0 };

/** Status só avança (enviada → entregue → lida). "falhou" só entra sobre nada/enviada. */
export function statusAvanca(atual: WaStatusEntrega | null, novo: WaStatusEntrega): boolean {
    if (!atual) return true;
    if (novo === 'falhou') return atual === 'enviada';
    if (atual === 'falhou') return true;
    return ORDEM_STATUS[novo] > ORDEM_STATUS[atual];
}

function parseStatus(p: Obj, data: unknown): EventoWa[] {
    const itens = Array.isArray(data) ? data : [data];
    const out: EventoWa[] = [];
    for (const it of itens) {
        if (!isObj(it)) continue;
        const key = isObj(it.key) ? it.key : {};
        const id = str(it.keyId) || str(key.id) || null;
        const bruto = isObj(it.update) ? it.update.status : it.status;
        // messages.update da v1 também carrega edição
        if (isObj(it.update) && isObj(it.update.message)) {
            const ed = parseUpsert(p, { key: { ...key, id: key.id || id }, message: it.update.message, messageTimestamp: it.update.messageTimestamp });
            out.push(...ed);
            continue;
        }
        const status = mapearStatus(bruto);
        if (!id) { out.push({ kind: 'ignorado', motivo: 'status_sem_id' }); continue; }
        // Status de entrega só vale para mensagem ENVIADA pela loja. "Lida" numa
        // mensagem do cliente é a loja lendo, não o cliente.
        if ((it.fromMe ?? key.fromMe) === false) {
            out.push({ kind: 'ignorado', motivo: 'status_de_mensagem_recebida', providerMessageId: id });
            continue;
        }
        if (!status) { out.push({ kind: 'ignorado', motivo: `status_${String(bruto ?? 'vazio').toLowerCase()}`, providerMessageId: id }); continue; }
        out.push({ kind: 'status', instancia: str(p.instance), providerMessageId: id, status, em: paraIso(it.datetime ?? it.timestamp, p.date_time) });
    }
    return out;
}

// ---------------------------------------------------------------------------
// Mensagem nova (messages.upsert)
// ---------------------------------------------------------------------------

function parseUpsert(p: Obj, data: Obj): EventoWa[] {
    const key: Obj = isObj(data.key) ? data.key : {};
    const id = str(key.id);
    if (!id) return [{ kind: 'ignorado', motivo: 'mensagem_sem_id' }];

    const tel = resolverTelefone(key, data);
    if (!tel) {
        const jid = str(key.remoteJid) || '';
        const motivo = /@g\.us$/.test(jid) ? 'grupo'
            : /@lid$/.test(jid) ? 'lid_sem_telefone'
            : /broadcast|newsletter/.test(jid) ? 'broadcast' : 'sem_telefone';
        return [{ kind: 'ignorado', motivo, providerMessageId: id }];
    }
    const telKey = telefoneKey(tel.telefone);
    if (!telKey) return [{ kind: 'ignorado', motivo: 'telefone_invalido', providerMessageId: id }];

    const base = {
        instancia: str(p.instance),
        remoteJid: tel.jid,
        telefone: tel.telefone,
        telefoneKey: telKey,
        fromMe: key.fromMe === true,
    };
    const quando = paraIso(data.messageTimestamp, p.date_time);
    const bruto: Obj = isObj(data.message) ? data.message : {};

    // --- Protocolo: edição e apagamento -------------------------------------
    const proto: Obj | null =
        (isObj(bruto.protocolMessage) && bruto.protocolMessage)
        || (isObj(bruto.editedMessage) && isObj(bruto.editedMessage.message) && isObj(bruto.editedMessage.message.protocolMessage) && bruto.editedMessage.message.protocolMessage)
        || null;
    if (proto) {
        const alvo = str(isObj(proto.key) ? proto.key.id : null) || id;
        const tipoProto = String(proto.type ?? '').toUpperCase();
        if (tipoProto === '0' || tipoProto === 'REVOKE') {
            return [{ ...base, kind: 'apagada', providerMessageId: alvo, apagadaEm: quando }];
        }
        if (tipoProto === '14' || tipoProto === 'MESSAGE_EDIT' || isObj(proto.editedMessage)) {
            const novo = isObj(proto.editedMessage) ? abrirMensagem(proto.editedMessage) : {};
            const novoTexto = str(novo.conversation) || str(novo.extendedTextMessage?.text)
                || str(novo.imageMessage?.caption) || str(novo.videoMessage?.caption) || null;
            return [{ ...base, kind: 'edicao', providerMessageId: alvo, novoTexto, editadaEm: quando }];
        }
        return [{ kind: 'ignorado', motivo: `protocolo_${tipoProto.toLowerCase() || 'desconhecido'}`, providerMessageId: id }];
    }

    const m = abrirMensagem(bruto);
    const ctx = contextInfo(data, m);
    const citada = str(ctx?.stanzaId) || null;

    const msg: EventoMensagem = {
        ...base,
        kind: 'mensagem',
        providerMessageId: id,
        nomeContato: key.fromMe === true ? null : str(data.pushName),
        tipo: 'texto',
        tipoOriginal: str(data.messageType) || Object.keys(m).find(k => k !== 'messageContextInfo' && k !== 'base64') || 'desconhecido',
        texto: null,
        legenda: null,
        midia: null,
        citadaMessageId: citada,
        localizacao: null,
        contatos: null,
        reacaoAlvoId: null,
        enviadaEm: quando,
        dispositivo: str(data.source),
    };

    if (str(m.conversation)) {
        msg.texto = str(m.conversation);
    } else if (isObj(m.extendedTextMessage)) {
        msg.texto = str(m.extendedTextMessage.text);
    } else if (isObj(m.imageMessage)) {
        msg.tipo = 'imagem';
        msg.legenda = str(m.imageMessage.caption);
        msg.midia = midiaDe(m.imageMessage, data, m);
    } else if (isObj(m.audioMessage)) {
        msg.tipo = 'audio';
        msg.midia = midiaDe(m.audioMessage, data, m);
    } else if (isObj(m.videoMessage) || isObj(m.ptvMessage)) {
        const v = isObj(m.videoMessage) ? m.videoMessage : m.ptvMessage;
        msg.tipo = 'video';
        msg.legenda = str(v.caption);
        msg.midia = midiaDe(v, data, m);
    } else if (isObj(m.documentMessage)) {
        msg.tipo = 'documento';
        msg.legenda = str(m.documentMessage.caption);
        msg.midia = midiaDe(m.documentMessage, data, m);
    } else if (isObj(m.stickerMessage)) {
        msg.tipo = 'figurinha';
        msg.midia = midiaDe(m.stickerMessage, data, m);
    } else if (isObj(m.locationMessage) || isObj(m.liveLocationMessage)) {
        const l = isObj(m.locationMessage) ? m.locationMessage : m.liveLocationMessage;
        msg.tipo = 'localizacao';
        msg.localizacao = {
            lat: numero(l.degreesLatitude),
            lng: numero(l.degreesLongitude),
            nome: str(l.name),
            endereco: str(l.address),
        };
        msg.texto = [msg.localizacao.nome, msg.localizacao.endereco].filter(Boolean).join(' — ') || null;
    } else if (isObj(m.contactMessage)) {
        msg.tipo = 'contato';
        msg.contatos = [{ nome: str(m.contactMessage.displayName), telefones: telefonesDoVcard(m.contactMessage.vcard) }];
        msg.texto = msg.contatos[0].nome;
    } else if (isObj(m.contactsArrayMessage)) {
        msg.tipo = 'contato';
        const lista = Array.isArray(m.contactsArrayMessage.contacts) ? m.contactsArrayMessage.contacts : [];
        msg.contatos = lista.filter(isObj).map((c: Obj) => ({ nome: str(c.displayName), telefones: telefonesDoVcard(c.vcard) }));
        msg.texto = msg.contatos.map(c => c.nome).filter(Boolean).join(', ') || str(m.contactsArrayMessage.displayName);
    } else if (isObj(m.reactionMessage)) {
        msg.tipo = 'reacao';
        // texto vazio = cliente tirou a reação
        msg.texto = typeof m.reactionMessage.text === 'string' ? m.reactionMessage.text : null;
        msg.reacaoAlvoId = str(isObj(m.reactionMessage.key) ? m.reactionMessage.key.id : null);
        msg.citadaMessageId = msg.reacaoAlvoId;
    } else if (isObj(m.buttonsResponseMessage)) {
        msg.texto = str(m.buttonsResponseMessage.selectedDisplayText) || str(m.buttonsResponseMessage.selectedButtonId);
    } else if (isObj(m.listResponseMessage)) {
        msg.texto = str(m.listResponseMessage.title) || str(m.listResponseMessage.singleSelectReply?.selectedRowId);
    } else if (isObj(m.templateButtonReplyMessage)) {
        msg.texto = str(m.templateButtonReplyMessage.selectedDisplayText);
    } else {
        // Tipo que o CRM ainda não desenha (enquete, pagamento...). Não perde a
        // mensagem: grava como texto com o tipo original.
        msg.texto = `[mensagem do tipo ${msg.tipoOriginal}]`;
    }

    return [msg];
}

// ---------------------------------------------------------------------------
// Entrada pública
// ---------------------------------------------------------------------------

export function parseEvolutionWebhook(payload: unknown): EventoWa[] {
    const p = desembrulhar(payload);
    if (!p) return [{ kind: 'ignorado', motivo: 'payload_invalido' }];
    const evt = nomeEvento(p);
    const data = p.data;

    if (/^messages\.(upsert|set|new)$|^send\.message$/.test(evt) || (!evt && isObj(data) && isObj(data.key))) {
        if (Array.isArray(data)) return data.filter(isObj).flatMap(d => parseUpsert(p, d));
        if (isObj(data) && Array.isArray(data.messages)) return data.messages.filter(isObj).flatMap((d: Obj) => parseUpsert(p, d));
        if (!isObj(data)) return [{ kind: 'ignorado', motivo: 'sem_data' }];
        return parseUpsert(p, data);
    }
    if (evt === 'messages.update') return parseStatus(p, data);
    if (evt === 'messages.edited') {
        if (!isObj(data)) return [{ kind: 'ignorado', motivo: 'sem_data' }];
        // Algumas versões mandam o conteúdo novo sem protocolMessage: vira edição do mesmo id.
        return parseUpsert(p, data).map((e): EventoWa => e.kind !== 'mensagem' ? e : {
            kind: 'edicao', instancia: e.instancia, providerMessageId: e.providerMessageId, remoteJid: e.remoteJid,
            telefone: e.telefone, telefoneKey: e.telefoneKey, fromMe: e.fromMe,
            novoTexto: e.texto ?? e.legenda, editadaEm: e.enviadaEm,
        });
    }
    if (evt === 'messages.delete') {
        const d: Obj = isObj(data) ? (isObj(data.key) ? { ...data, ...data.key } : data) : {};
        const id = str(d.id) || str(d.keyId);
        const tel = resolverTelefone(d, d);
        const k = tel ? telefoneKey(tel.telefone) : null;
        if (!id || !tel || !k) return [{ kind: 'ignorado', motivo: 'delete_incompleto', providerMessageId: id }];
        return [{
            kind: 'apagada', instancia: str(p.instance), providerMessageId: id, remoteJid: tel.jid,
            telefone: tel.telefone, telefoneKey: k, fromMe: d.fromMe === true, apagadaEm: paraIso(null, p.date_time),
        }];
    }
    return [{ kind: 'ignorado', motivo: evt ? `evento_${evt}` : 'sem_evento' }];
}

/**
 * Cópia do payload para guardar em webhook_errors sem segredo nem binário:
 * tira apikey/headers e corta base64 e miniaturas.
 */
export function payloadSeguro(payload: unknown): unknown {
    const CORTAR = new Set(['apikey', 'headers', 'authorization', 'base64', 'jpegThumbnail', 'thumbnail', 'waveform', 'mediaKey']);
    const visitar = (v: unknown, prof: number): unknown => {
        if (prof > 12) return '[profundo]';
        if (Array.isArray(v)) return v.slice(0, 50).map(x => visitar(x, prof + 1));
        if (isObj(v)) {
            const out: Obj = {};
            for (const [k, val] of Object.entries(v)) {
                out[k] = CORTAR.has(k) ? '[removido]' : visitar(val, prof + 1);
            }
            return out;
        }
        if (typeof v === 'string' && v.length > 2000) return v.slice(0, 2000) + '…';
        return v;
    };
    return visitar(payload, 0);
}

/** Texto curto para a rota antiga e para logs: o que a pessoa "disse". */
export function textoResumo(e: EventoMensagem): string | null {
    if (e.texto && e.tipo !== 'reacao') return e.texto;
    if (e.legenda) return e.legenda;
    switch (e.tipo) {
        case 'imagem': return '[imagem]';
        case 'audio': return '[áudio]';
        case 'video': return '[vídeo]';
        case 'documento': return `[documento${e.midia?.nomeArquivo ? `: ${e.midia.nomeArquivo}` : ''}]`;
        case 'figurinha': return '[figurinha]';
        case 'reacao': return e.texto ? `[reação ${e.texto}]` : '[reação removida]';
        default: return e.texto;
    }
}
