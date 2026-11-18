/**
 * Higgsfield (API oficial) — edição de foto do carro. Substitui o webhook do n8n "vitrine-trata-foto".
 *
 * Modelo: Qwen Image 3 Edit (alibaba/qwen-image-3/edit), escolhido porque edita só por prompt,
 * aceita 4:3 (proporção das fotos do estoque) e tem seed. Contrato conferido em docs.higgsfield.ai:
 *   POST https://api.higgsfield.ai/alibaba/qwen-image-3/edit  { prompt, image_urls[1..3], aspect_ratio, resolution }
 *   → { request_id, status_url }; GET status_url até "completed" → images[0].url
 *   Authorization: Key <id>:<secret>
 *
 * Regra da Manos: a IA muda só fundo e luz. O carro (lataria, rodas, placa, avarias) não pode mudar.
 */

const BASE = 'https://api.higgsfield.ai';
const MODELO = 'alibaba/qwen-image-3/edit';

export class HiggsfieldError extends Error {
    constructor(message: string, public readonly status?: number) { super(message); }
}

function cabecalhos(extra: Record<string, string> = {}): Record<string, string> {
    const id = process.env.HIGGSFIELD_API_KEY?.trim();
    const segredo = process.env.HIGGSFIELD_API_SECRET?.trim();
    if (!id || !segredo) throw new HiggsfieldError('Faltam HIGGSFIELD_API_KEY e HIGGSFIELD_API_SECRET nas variáveis de ambiente do CRM.');
    return { Authorization: `Key ${id}:${segredo}`, 'Content-Type': 'application/json', ...extra };
}

const dormir = (ms: number) => new Promise(r => setTimeout(r, ms));

async function chamar(url: string, init: RequestInit, tentativas = 3): Promise<Record<string, unknown>> {
    for (let i = 1; ; i++) {
        const r = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
        const texto = await r.text();
        let corpo: Record<string, any> = {};
        try { corpo = JSON.parse(texto); } catch { /* não é JSON */ }
        if (r.ok) return corpo;
        if ((r.status === 429 || r.status >= 500) && i < tentativas) {
            await dormir(Math.min(Number(r.headers.get('retry-after')) || 2 ** i, 15) * 1000);
            continue;
        }
        if (r.status === 401) throw new HiggsfieldError('Higgsfield recusou as credenciais (401). Confira HIGGSFIELD_API_KEY e HIGGSFIELD_API_SECRET.', 401);
        throw new HiggsfieldError(`Higgsfield respondeu ${r.status}: ${String(corpo?.detail?.message ?? corpo?.message ?? texto).slice(0, 300)}`, r.status);
    }
}

const REGRA_DO_CARRO = 'Edit this photo of a used car for a dealership ad. Keep the car EXACTLY as in the photo: same body shape, paint color, wheels, badges, license plate, dents and condition. Do not add, remove or alter any part of the car. No people, no text, no added logos, no extra vehicles.';

export const montarPrompt = (instrucao: string) => `${REGRA_DO_CARRO} Only change this: ${instrucao.trim()}`;

export interface ResultadoEdicao { buffer: Buffer; contentType: string }

/**
 * Edita a foto e devolve a imagem pronta. `fotoUrl` precisa ser uma URL pública ou assinada (https).
 * Espera até `limiteMs` (a rota roda em função com tempo máximo): estoura com mensagem clara.
 */
export async function editarFoto(fotoUrl: string, instrucao: string, limiteMs = 100_000): Promise<ResultadoEdicao> {
    const envio = await chamar(`${BASE}/${MODELO}`, {
        method: 'POST',
        headers: cabecalhos(),
        body: JSON.stringify({ prompt: montarPrompt(instrucao), image_urls: [fotoUrl], aspect_ratio: '4:3', resolution: '2k' }),
    });
    const statusUrl = (envio.status_url as string | undefined) ?? (envio.request_id ? `${BASE}/requests/${envio.request_id}/status` : undefined);
    if (!statusUrl) throw new HiggsfieldError('Higgsfield não devolveu o endereço de acompanhamento do pedido.');

    const inicio = Date.now();
    let espera = 1500;
    for (;;) {
        await dormir(espera);
        espera = Math.min(espera * 1.4, 6000);
        const s = await chamar(statusUrl, { headers: cabecalhos() }) as { status?: string; images?: { url?: string }[] };
        if (s.status === 'completed') {
            const url = s.images?.[0]?.url;
            if (!url) throw new HiggsfieldError('Higgsfield terminou, mas sem a imagem na resposta.');
            const img = await fetch(url, { signal: AbortSignal.timeout(30_000) });
            if (!img.ok) throw new HiggsfieldError(`Não consegui baixar a imagem tratada (${img.status}).`);
            return { buffer: Buffer.from(await img.arrayBuffer()), contentType: img.headers.get('content-type') || 'image/png' };
        }
        if (s.status === 'failed' || s.status === 'nsfw' || s.status === 'canceled') {
            throw new HiggsfieldError(`Higgsfield encerrou o pedido como "${s.status}" (não cobrado).`);
        }
        if (Date.now() - inicio > limiteMs) throw new HiggsfieldError('O Higgsfield demorou demais para tratar a foto. Tente de novo em instantes.');
    }
}
