import { getGeminiModel, AI_MODELS } from '@/lib/aiProviders';
import { logAiCall } from '@/lib/services/observability';
import { mimeBase } from './midia';
import { msgErro } from './erro';

/**
 * Transcrição de áudio do WhatsApp na chegada.
 *
 * Mesmo modelo e mesmo prompt de /api/lead/analyze-audio (Gemini Flash,
 * JSON com transcricao/sentimento/objecao/resumo_audio). A diferença: aqui não
 * depende de lead e não grava em whatsapp_messages — quem chama grava em
 * wa_mensagens.transcricao (texto literal, fica para sempre) e o resto em extra.
 */

export interface AnaliseAudio {
    transcricao: string;
    sentimento: string | null;
    objecao: string | null;
    resumo_audio: string | null;
}

// Mesmo texto de src/app/api/lead/analyze-audio/route.ts
const PROMPT = `Você é um Sales Copilot altamente experiente. Sua tarefa é transcrever e analisar o áudio enviado por um cliente interessado em comprar um veículo.
Responda EXCLUSIVAMENTE em formato JSON válido contendo as seguintes propriedades:
{
  "transcricao": "A transcrição literal e fiel do áudio, sem resumos no texto da transcrição em si.",
  "sentimento": "O sentimento do cliente (ex: muito interessado, indeciso, impaciente, confuso, desconfiado).",
  "objecao": "As objeções explícitas ou implícitas detectadas (ex: preço, parcelas, valor de troca, distância) ou null se não houver nenhuma.",
  "resumo_audio": "Um resumo de 1 linha da mensagem de áudio."
}`;

/** Requisição inline do Gemini aceita ~20 MB; base64 acima disso nem tenta. */
const LIMITE_BASE64 = 19 * 1024 * 1024;

export class AudioGrandeDemais extends Error {
    constructor() {
        super('áudio grande demais para transcrever inline');
        this.name = 'AudioGrandeDemais';
    }
}

function interpretar(texto: string): AnaliseAudio {
    const limpo = texto.replace(/```json/g, '').replace(/```/g, '').trim();
    try {
        const j = JSON.parse(limpo);
        const t = typeof j?.transcricao === 'string' ? j.transcricao.trim() : '';
        if (!t) throw new Error('sem transcricao');
        return {
            transcricao: t,
            sentimento: typeof j.sentimento === 'string' ? j.sentimento : null,
            objecao: typeof j.objecao === 'string' ? j.objecao : null,
            resumo_audio: typeof j.resumo_audio === 'string' ? j.resumo_audio : null,
        };
    } catch {
        // Mesmo fallback do analyze-audio: tenta pescar o campo; senão usa o texto cru.
        const m = limpo.match(/"transcricao"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        const t = (m ? m[1] : limpo).trim();
        if (!t) throw new Error('Gemini não devolveu transcrição');
        return { transcricao: t, sentimento: null, objecao: null, resumo_audio: null };
    }
}

export async function transcreverAudio(
    base64: string,
    mime: string | null,
): Promise<AnaliseAudio> {
    if (base64.length > LIMITE_BASE64) throw new AudioGrandeDemais();
    const model = getGeminiModel(AI_MODELS.GEMINI_FLASH);
    const t0 = Date.now();
    try {
        const result = await model.generateContent([
            { inlineData: { data: base64, mimeType: mimeBase(mime) || 'audio/ogg' } },
            PROMPT,
        ]);
        const usage = result.response.usageMetadata;
        logAiCall({
            model: AI_MODELS.GEMINI_FLASH,
            promptTokens: usage?.promptTokenCount || 0,
            completionTokens: usage?.candidatesTokenCount || 0,
            totalTokens: usage?.totalTokenCount || 0,
            latencyMs: Date.now() - t0,
            callerApi: '/api/wa/ingest#transcricao',
            status: 'success',
        });
        return interpretar(result.response.text());
    } catch (e) {
        logAiCall({
            model: AI_MODELS.GEMINI_FLASH,
            status: 'error',
            errorMessage: msgErro(e),
            callerApi: '/api/wa/ingest#transcricao',
        });
        throw e;
    }
}
