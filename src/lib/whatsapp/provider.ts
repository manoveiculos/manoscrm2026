/**
 * Contrato do provedor de WhatsApp da loja.
 *
 * Hoje o número (47) 3300-1352 roda na Evolution API (EvolutionProvider). Se um
 * dia a loja migrar para a Cloud API da Meta (decisão do Alexandre, item E27),
 * troca-se só a implementação; ingestão, telas e banco continuam iguais.
 *
 * Uso: conversa 1 a 1 com cliente. NUNCA para disparo em massa (a régua
 * anti-ban de campanha vive em outro lugar, com gap ≥ 60 s e circuit breaker).
 */

export interface EnvioResultado {
    ok: boolean;
    /** Id da mensagem no WhatsApp: é o provider_message_id em wa_mensagens. */
    providerMessageId: string | null;
    erro?: string;
}

export type TipoMidiaEnvio = 'imagem' | 'video' | 'documento';

export interface MidiaParaEnviar {
    tipo: TipoMidiaEnvio;
    /** base64 puro (sem "data:...;base64,") OU url pública/assinada. */
    base64?: string;
    url?: string;
    mime: string;
    nomeArquivo?: string;
    legenda?: string;
}

export interface AudioParaEnviar {
    /** ogg/opus gravado no navegador, em base64; ou url. */
    base64?: string;
    url?: string;
}

export interface RefMensagem {
    providerMessageId: string;
    remoteJid?: string;
    fromMe?: boolean;
    /** key + message crus do webhook; com eles a Evolution baixa direto do WhatsApp. */
    bruto?: { key: Record<string, unknown>; message: Record<string, unknown> } | null;
}

export interface MidiaBaixada {
    base64: string;
    mime: string | null;
    nomeArquivo: string | null;
    bytes: number;
}

export interface WhatsAppProvider {
    readonly nome: string;
    /** Instância/número em uso (para log e checagem do webhook). */
    readonly instancia: string;
    enviarTexto(para: string, texto: string, opts?: { citadaId?: string }): Promise<EnvioResultado>;
    enviarMidia(para: string, midia: MidiaParaEnviar): Promise<EnvioResultado>;
    enviarAudio(para: string, audio: AudioParaEnviar): Promise<EnvioResultado>;
    baixarMidia(ref: RefMensagem): Promise<MidiaBaixada>;
    marcarLida(ref: RefMensagem & { remoteJid: string }): Promise<boolean>;
}

export class ProviderNaoConfigurado extends Error {
    constructor(faltando: string[]) {
        super(`WhatsApp da loja sem configuração: falta ${faltando.join(', ')}`);
        this.name = 'ProviderNaoConfigurado';
    }
}
