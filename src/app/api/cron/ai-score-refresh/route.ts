import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { getGlobalFeedbackContext } from '@/lib/services/aiFeedbackService';

export const maxDuration = 300; // 5 minutos para processar batch de 100 leads

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * GET /api/cron/ai-score-refresh
 * Executa diariamente às 07:00 UTC (04:00 BRT).
 * Recalcula ai_score de leads ativos sem análise recente.
 *
 * Critérios de elegibilidade:
 * - Status não final (não vendido/perdido)
 * - ai_score = 0 OU null (nunca analisado)
 * - Processa até 100 leads por execução, em batches de 5
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const log: string[] = [];
    let processed = 0;
    let skipped = 0;

    try {
        const { data: leads, error } = await supabase
            .from('leads_manos_crm')
            .select('id, name, vehicle_interest, source, origem, valor_investimento, carro_troca')
            .not('status', 'in', '("vendido","perdido","lost","comprado","lixo","duplicado","desqualificado")')
            .or('ai_score.is.null,ai_score.eq.0')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;

        if (!leads?.length) {
            return NextResponse.json({ success: true, message: 'Todos os leads já têm score.', processed: 0 });
        }

        log.push(`📋 ${leads.length} leads elegíveis para análise`);

        // Busca padrões globais de feedback UMA vez para todos os leads do batch
        const globalFeedbackContext = await getGlobalFeedbackContext().catch(() => '');
        const systemPrompt = 'Analista comercial da Manos Veiculos (concessionaria multimarcas). Retorne APENAS JSON valido.' + globalFeedbackContext;

        const BATCH_SIZE = 5;
        for (let i = 0; i < leads.length; i += BATCH_SIZE) {
            const batch = leads.slice(i, i + BATCH_SIZE);

            await Promise.allSettled(batch.map(async (lead) => {
                try {
                    const res = await openai.chat.completions.create({
                        model: 'gpt-4o-mini',
                        messages: [
                            { role: 'system', content: systemPrompt },
                            {
                            role: 'user',
                            content: `Lead de concessionaria multimarcas:\n- Nome: ${lead.name || 'Desconhecido'}\n- Interesse: ${lead.vehicle_interest || 'Nao informado'}\n- Origem: ${lead.source || lead.origem || 'Desconhecida'}\n- Investimento: ${lead.valor_investimento || 'Nao informado'}\n- Troca: ${lead.carro_troca || 'Sem troca'}\n\nJSON:\n{ "ai_score": 0-99, "ai_classification": "hot"|"warm"|"cold", "vehicle_interest_normalized": "Marca Modelo Ano", "proxima_acao": "Script exato 1-2 frases WhatsApp sem listas" }`,
                        }],
                        response_format: { type: 'json_object' },
                        temperature: 0.2,
                        max_tokens: 200,
                    });

                    const result = JSON.parse(res.choices[0]?.message?.content || '{}');

                    const updatePayload: Record<string, any> = {
                        ai_score: Math.min(99, Math.max(1, Number(result.ai_score) || 40)),
                        ai_classification: ['hot', 'warm', 'cold'].includes(result.ai_classification) ? result.ai_classification : 'warm',
                        next_step: result.proxima_acao || '',
                        proxima_acao: result.proxima_acao || '',
                    };

                    const normalized = (result.vehicle_interest_normalized || '').trim();
                    if (normalized.length > 3 && normalized.toLowerCase() !== 'vazio') {
                        updatePayload.vehicle_interest = normalized;
                    }

                    await supabase.from('leads_manos_crm').update(updatePayload).eq('id', lead.id);
                    processed++;
                    log.push(`✅ ${lead.name} → ${result.ai_score}% (${result.ai_classification})`);
                } catch (e: any) {
                    skipped++;
                    log.push(`❌ ${lead.name} → ${e.message}`);
                }
            }));

            // Respeita rate limits da OpenAI entre batches
            if (i + BATCH_SIZE < leads.length) {
                await new Promise(r => setTimeout(r, 600));
            }
        }

        return NextResponse.json({
            success: true,
            processed,
            skipped,
            leadsScanned: leads.length,
            log,
        });
    } catch (err: any) {
        console.error('[ai-score-refresh]', err);
        return NextResponse.json({ success: false, error: err.message, log }, { status: 500 });
    }
}
