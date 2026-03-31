import { NextRequest, NextResponse } from 'next/server';
import { runEliteCloser } from '@/lib/services/ai-closer-service';

export const maxDuration = 60;

/**
 * POST /api/lead/next-steps
 * Endpoint para disparar manualmente a análise estratégica (Elite Closer).
 */
export async function POST(req: NextRequest) {
    try {
        const { leadId, messages, consultantName } = await req.json();

        if (!leadId) {
            return NextResponse.json({ error: 'Lead ID é obrigatório' }, { status: 400 });
        }

        const result = await runEliteCloser(leadId, messages || [], consultantName);

        return NextResponse.json({
            success: true,
            diagnostico: result.diagnostico,
            orientacao: result.orientacao,
            proximos_passos: [result.scriptWhatsApp],
            script_options: result.scriptOptions,
            urgency_score: result.urgencyScore,
            temperature: result.temperature === 'hot' ? 'quente' : result.temperature === 'warm' ? 'morno' : 'frio',
            model_used: result.modelUsed,
            detected_name: result.detectedName || null,
        });

    } catch (err: any) {
        const msg = err?.message || (typeof err === 'string' ? err : JSON.stringify(err)) || 'Erro desconhecido';
        console.error("[next-steps] ERRO:", msg, err);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
