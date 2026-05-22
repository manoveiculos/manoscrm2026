import { createClient } from '@/lib/supabase/admin';

// Tabela de preços de IA por 1.000.000 de tokens (em dólares)
const TOKEN_PRICES: Record<string, { input: number; output: number }> = {
    'gpt-4o-mini': { input: 0.150, output: 0.600 },
    'gpt-4o': { input: 2.500, output: 10.000 },
    'gemini-2.0-flash': { input: 0.075, output: 0.300 },
    'claude-3-5-sonnet': { input: 3.000, output: 15.000 },
    'claude-sonnet-4-6': { input: 3.000, output: 15.000 },
    'text-embedding-3-small': { input: 0.020, output: 0.000 }
};

interface AiCallLogParams {
    model: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    latencyMs?: number;
    callerApi?: string;
    leadId?: string;
    status?: 'success' | 'error';
    errorMessage?: string;
}

/**
 * Calcula o custo estimado de uma chamada de LLM em dólares.
 */
function calculateCost(model: string, inputTokens = 0, outputTokens = 0): number {
    const key = Object.keys(TOKEN_PRICES).find(k => model.toLowerCase().includes(k));
    if (!key) return 0;
    const price = TOKEN_PRICES[key];
    const inputCost = (inputTokens / 1_000_000) * price.input;
    const outputCost = (outputTokens / 1_000_000) * price.output;
    return inputCost + outputCost;
}

/**
 * Registra uma métrica de chamada de IA de forma assíncrona (fire-and-forget).
 * Protegida internamente para nunca falhar a requisição principal do usuário.
 */
export function logAiCall(params: AiCallLogParams): void {
    // Roda de forma assíncrona sem dar await no fluxo principal do CRM
    Promise.resolve().then(async () => {
        try {
            const promptTokens = params.promptTokens || 0;
            const completionTokens = params.completionTokens || 0;
            const totalTokens = params.totalTokens || (promptTokens + completionTokens);
            const cost = calculateCost(params.model, promptTokens, completionTokens);

            const admin = createClient();
            const { error } = await admin
                .from('ai_metrics_log')
                .insert({
                    model: params.model,
                    prompt_tokens: promptTokens,
                    completion_tokens: completionTokens,
                    total_tokens: totalTokens,
                    estimated_cost: cost,
                    latency_ms: params.latencyMs || null,
                    caller_api: params.callerApi || null,
                    lead_id: params.leadId || null,
                    status: params.status || 'success',
                    error_message: params.errorMessage || null
                });

            if (error) {
                console.warn('[Observability] Falha ao gravar log no banco:', error.message);
            }
        } catch (e: any) {
            console.warn('[Observability] Exceção silenciosa no logAiCall:', e?.message);
        }
    });
}
