import type {
    AudioParaEnviar, EnvioResultado, MidiaBaixada, MidiaParaEnviar, RefMensagem, WhatsAppProvider,
} from './provider';
import { ProviderNaoConfigurado } from './provider';
import { msgErro } from './erro';

type Json = Record<string, unknown>;

/**
 * Implementação do WhatsAppProvider sobre a Evolution API v2.
 *
 * Configuração (env, só no servidor):
 *   WA_LOJA_INSTANCIA      nome da instância do número da loja (47) 3300-1352
 *   WA_LOJA_TOKEN          apikey dessa instância (ou a chave global da Evolution)
 *   WA_LOJA_EVOLUTION_URL  opcional; sem ela usa EVOLUTION_BASE_URL
 *
 * Não usa EVOLUTION_INSTANCE_NAME de propósito: no .env.local ele é "teste" e
 * serve aos avisos para vendedor. Misturar os dois mandaria mensagem de cliente
 * pela instância errada.
 */

const TIMEOUT_ENVIO_MS = 15_000;
const TIMEOUT_MIDIA_MS = 60_000;

const MEDIATYPE: Record<MidiaParaEnviar['tipo'], string> = {
    imagem: 'image',
    video: 'video',
    documento: 'document',
};

function limpar(v: string | undefined): string {
    return (v || '').replace(/"/g, '').trim();
}

/** Número para a Evolution: só dígitos, com DDI 55 quando faltar. */
export function numeroParaEnvio(para: string): string {
    if (/@/.test(para)) return para; // JID completo (inclusive @lid) vai como está
    const d = para.replace(/\D/g, '');
    if (d.length === 10 || d.length === 11) return `55${d}`;
    return d;
}

function semPrefixoDataUrl(b64: string): string {
    const i = b64.indexOf('base64,');
    return i >= 0 ? b64.slice(i + 7) : b64;
}

export interface EvolutionConfig {
    baseUrl: string;
    instancia: string;
    token: string;
}

export function configEvolutionLoja(env: Record<string, string | undefined> = process.env): EvolutionConfig {
    const baseUrl = limpar(env.WA_LOJA_EVOLUTION_URL || env.EVOLUTION_BASE_URL).replace(/\/+$/, '');
    const instancia = limpar(env.WA_LOJA_INSTANCIA);
    const token = limpar(env.WA_LOJA_TOKEN);
    const faltando = [
        !baseUrl && 'WA_LOJA_EVOLUTION_URL/EVOLUTION_BASE_URL',
        !instancia && 'WA_LOJA_INSTANCIA',
        !token && 'WA_LOJA_TOKEN',
    ].filter(Boolean) as string[];
    if (faltando.length) throw new ProviderNaoConfigurado(faltando);
    return { baseUrl, instancia, token };
}

export class EvolutionProvider implements WhatsAppProvider {
    readonly nome = 'evolution';
    readonly instancia: string;
    private readonly baseUrl: string;
    private readonly token: string;

    constructor(cfg: EvolutionConfig = configEvolutionLoja()) {
        this.baseUrl = cfg.baseUrl;
        this.instancia = cfg.instancia;
        this.token = cfg.token;
    }

    private async post(caminho: string, corpo: unknown, timeoutMs = TIMEOUT_ENVIO_MS): Promise<Json> {
        const url = `${this.baseUrl}${caminho}/${encodeURIComponent(this.instancia)}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { apikey: this.token, 'Content-Type': 'application/json' },
            body: JSON.stringify(corpo),
            signal: AbortSignal.timeout(timeoutMs),
        });
        const texto = await res.text().catch(() => '');
        if (!res.ok) {
            // Não devolve o corpo inteiro: pode ecoar dado do cliente.
            throw new Error(`Evolution ${caminho} HTTP ${res.status}: ${texto.slice(0, 200)}`);
        }
        try {
            const j: unknown = texto ? JSON.parse(texto) : {};
            return j && typeof j === 'object' && !Array.isArray(j) ? (j as Json) : {};
        } catch {
            return {};
        }
    }

    private resultado(r: Json): EnvioResultado {
        const key = (r.key ?? (r.data as Json | undefined)?.key) as Json | undefined;
        const id = typeof key?.id === 'string' ? key.id : null;
        return { ok: Boolean(id), providerMessageId: id, erro: id ? undefined : 'resposta_sem_id' };
    }

    private async enviar(caminho: string, corpo: unknown): Promise<EnvioResultado> {
        try {
            return this.resultado(await this.post(caminho, corpo));
        } catch (e) {
            return { ok: false, providerMessageId: null, erro: msgErro(e, 'erro_evolution') };
        }
    }

    enviarTexto(para: string, texto: string, opts?: { citadaId?: string }): Promise<EnvioResultado> {
        return this.enviar('/message/sendText', {
            number: numeroParaEnvio(para),
            text: texto,
            linkPreview: false,
            ...(opts?.citadaId ? { quoted: { key: { id: opts.citadaId } } } : {}),
        });
    }

    enviarMidia(para: string, midia: MidiaParaEnviar): Promise<EnvioResultado> {
        const media = midia.base64 ? semPrefixoDataUrl(midia.base64) : midia.url;
        if (!media) return Promise.resolve({ ok: false, providerMessageId: null, erro: 'midia_vazia' });
        return this.enviar('/message/sendMedia', {
            number: numeroParaEnvio(para),
            mediatype: MEDIATYPE[midia.tipo],
            mimetype: midia.mime,
            media,
            ...(midia.legenda ? { caption: midia.legenda } : {}),
            ...(midia.nomeArquivo ? { fileName: midia.nomeArquivo } : {}),
        });
    }

    enviarAudio(para: string, audio: AudioParaEnviar): Promise<EnvioResultado> {
        const conteudo = audio.base64 ? semPrefixoDataUrl(audio.base64) : audio.url;
        if (!conteudo) return Promise.resolve({ ok: false, providerMessageId: null, erro: 'audio_vazio' });
        // sendWhatsAppAudio entrega como nota de voz (ptt), igual áudio gravado no celular.
        return this.enviar('/message/sendWhatsAppAudio', {
            number: numeroParaEnvio(para),
            audio: conteudo,
            encoding: true,
        });
    }

    async baixarMidia(ref: RefMensagem): Promise<MidiaBaixada> {
        const message = ref.bruto
            ? { key: ref.bruto.key, message: ref.bruto.message }
            : { key: { id: ref.providerMessageId, ...(ref.remoteJid ? { remoteJid: ref.remoteJid } : {}), fromMe: ref.fromMe ?? false } };
        const r = await this.post('/chat/getBase64FromMediaMessage', { message, convertToMp4: false }, TIMEOUT_MIDIA_MS);
        const base64 = typeof r.base64 === 'string' ? semPrefixoDataUrl(r.base64) : '';
        if (!base64) throw new Error('Evolution devolveu mídia vazia');
        const bytesInformados = Number((r.size as Json | undefined)?.fileLength ?? r.fileLength);
        return {
            base64,
            mime: typeof r.mimetype === 'string' ? r.mimetype : null,
            nomeArquivo: typeof r.fileName === 'string' ? r.fileName : null,
            bytes: Number.isFinite(bytesInformados) && bytesInformados > 0
                ? bytesInformados
                : Math.floor((base64.length * 3) / 4),
        };
    }

    async marcarLida(ref: RefMensagem & { remoteJid: string }): Promise<boolean> {
        try {
            await this.post('/chat/markMessageAsRead', {
                readMessages: [{ remoteJid: ref.remoteJid, fromMe: ref.fromMe ?? false, id: ref.providerMessageId }],
            });
            return true;
        } catch {
            return false;
        }
    }
}

/** Provedor do número da loja. Lança ProviderNaoConfigurado se faltar env. */
export function providerLoja(): WhatsAppProvider {
    return new EvolutionProvider();
}
