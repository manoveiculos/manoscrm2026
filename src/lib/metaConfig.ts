/**
 * metaConfig — fonte unica do pixel/token da Meta. Server-side only.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 *
 * A resolucao estava espalhada e cada lugar usava uma cadeia diferente:
 *
 *   meta-service:     META_PIXEL_ID || NEXT_PUBLIC_META_PIXEL_ID || '995826668986455'
 *   admin route:      META_PIXEL_ID || NEXT_PUBLIC_META_PIXEL_ID || '995826668986455'
 *   vehicle route:    META_PIXEL_ID || '995826668986455'
 *
 * Medido em producao (19/09/2026): META_PIXEL_ID NAO esta definida e
 * NEXT_PUBLIC_META_PIXEL_ID = 1422926202228119 ("Pixel de Anuncios BR - Manos
 * WhatsApp", sem disparo desde marco/2026). Ou seja, quem usava a cadeia longa
 * enderecava os eventos pro pixel ERRADO, enquanto o diagnostico da rota nova
 * mostrava 995826668986455 ("CRM+SITE ATUALIZADOS OFICIAL") — o painel mentia
 * sobre o destino real.
 *
 * Regras agora:
 *   1. NEXT_PUBLIC_* NAO entra na cadeia. Prefixo NEXT_PUBLIC significa "pode ir
 *      pro navegador" — token de API nunca deveria ter esse prefixo, e um pixel
 *      antigo esquecido la nao pode sequestrar o destino dos eventos.
 *   2. Cadeia unica: META_PIXEL_ID -> DEFAULT_PIXEL_ID.
 *   3. Divergencia entre a env publica e a usada de verdade gera aviso no log.
 */

/** Pixel oficial CRM+SITE, o mesmo ligado ao catalogo Altimus_Veiculos. */
export const DEFAULT_PIXEL_ID = '995826668986455';

/** Dataset a ser usado nos envios. */
export function getMetaPixelId(): string {
    const configured = (process.env.META_PIXEL_ID || '').trim();
    const pixelId = configured || DEFAULT_PIXEL_ID;

    const publico = (process.env.NEXT_PUBLIC_META_PIXEL_ID || '').trim();
    if (publico && publico !== pixelId) {
        console.warn(
            `⚠️ [meta] NEXT_PUBLIC_META_PIXEL_ID=${publico} diverge do pixel em uso (${pixelId}). ` +
            `A variavel publica foi IGNORADA de proposito. Se ${publico} for o destino correto, ` +
            `defina META_PIXEL_ID=${publico}; senao, remova a variavel publica pra evitar confusao.`
        );
    }

    return pixelId;
}

/**
 * Token da Graph API. Server-side apenas.
 * NEXT_PUBLIC_META_ACCESS_TOKEN foi removida da cadeia: credencial com prefixo
 * NEXT_PUBLIC e publicada no bundle assim que qualquer componente de cliente a
 * ler. Hoje so codigo de servidor lia (conferido no bundle de producao: o valor
 * nao estava la), mas o risco ficava a um import de distancia.
 */
export function getMetaAccessToken(): string | undefined {
    const token = (process.env.META_ACCESS_TOKEN || '').trim();
    if (token) return token;

    if ((process.env.NEXT_PUBLIC_META_ACCESS_TOKEN || '').trim()) {
        console.error(
            '❌ [meta] META_ACCESS_TOKEN ausente e existe NEXT_PUBLIC_META_ACCESS_TOKEN definida. ' +
            'A versao publica NAO e usada (credencial nao pode ter prefixo NEXT_PUBLIC). ' +
            'Copie o valor para META_ACCESS_TOKEN e APAGUE a variavel publica.'
        );
    }
    return undefined;
}

export function getMetaApiVersion(): string {
    return (process.env.META_API_VERSION || '').trim() || 'v26.0';
}

/** URL de envio de eventos da Conversions API. */
export function getMetaEventsUrl(): string {
    return `https://graph.facebook.com/${getMetaApiVersion()}/${getMetaPixelId()}/events`;
}
