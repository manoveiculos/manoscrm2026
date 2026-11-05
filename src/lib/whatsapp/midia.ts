/**
 * Regras de mídia do WhatsApp da loja. Arquivo PURO (sem import), testável
 * com `node --test`.
 *
 * Decisão do Alexandre (04/11/2026): mídia fica 30 dias no bucket privado
 * `whatsapp-midia`; texto, legenda e transcrição ficam para sempre.
 */

export const BUCKET_MIDIA = 'whatsapp-midia';
export const RETENCAO_DIAS = 30;

const MB = 1024 * 1024;

/** Limite por tipo. Acima disso guarda só a referência e avisa. */
export const LIMITE_BYTES: Record<string, number> = {
    imagem: 16 * MB,
    audio: 16 * MB,
    figurinha: 16 * MB,
    video: 100 * MB,
    documento: 100 * MB,
};

export function tipoTemMidia(tipo: string): boolean {
    return tipo in LIMITE_BYTES;
}

export function excedeLimite(tipo: string, bytes: number | null | undefined): boolean {
    const lim = LIMITE_BYTES[tipo];
    if (!lim || bytes === null || bytes === undefined) return false;
    return bytes > lim;
}

const EXT_POR_MIME: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'audio/ogg': 'ogg',
    'audio/opus': 'opus',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/amr': 'amr',
    'audio/wav': 'wav',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/plain': 'txt',
    'application/zip': 'zip',
};

const EXT_PADRAO: Record<string, string> = {
    imagem: 'jpg', audio: 'ogg', video: 'mp4', documento: 'bin', figurinha: 'webp',
};

/** "audio/ogg; codecs=opus" → "audio/ogg" */
export function mimeBase(mime: string | null | undefined): string | null {
    if (!mime) return null;
    const b = mime.split(';')[0].trim().toLowerCase();
    return b || null;
}

export function extensaoMidia(tipo: string, mime: string | null | undefined, nomeArquivo?: string | null): string {
    const base = mimeBase(mime);
    if (base && EXT_POR_MIME[base]) return EXT_POR_MIME[base];
    const doNome = nomeArquivo?.match(/\.([a-z0-9]{1,5})$/i)?.[1];
    if (doNome) return doNome.toLowerCase();
    return EXT_PADRAO[tipo] || 'bin';
}

/** Caminho no bucket: AAAA/MM/<conversa>/<mensagem>.<ext> (mês da mensagem, em UTC). */
export function caminhoMidia(conversaId: string, mensagemId: string, ext: string, quando: string | Date): string {
    const d = typeof quando === 'string' ? new Date(quando) : quando;
    const ok = !Number.isNaN(d.getTime()) ? d : new Date();
    const ano = ok.getUTCFullYear();
    const mes = String(ok.getUTCMonth() + 1).padStart(2, '0');
    const limpa = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '');
    return `${ano}/${mes}/${limpa(conversaId)}/${limpa(mensagemId)}.${limpa(ext) || 'bin'}`;
}

/** Data de corte da retenção: mídia recebida antes disso sai do bucket. */
export function corteRetencao(agora: Date = new Date(), dias = RETENCAO_DIAS): Date {
    return new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000);
}
