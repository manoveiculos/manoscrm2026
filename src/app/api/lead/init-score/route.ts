import { createClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { getAIContext } from '@/lib/services/aiFeedbackService';

export const maxDuration = 30;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * POST /api/lead/init-score
 * Análise inicial leve (GPT-4o mini) para leads recém-criados.
 * Seta: ai_score, ai_classification, proxima_acao, next_step
 * e normaliza vehicle_interest para "Marca Modelo Ano".
 *
 * Chamado em background por:
 * - NewLeadModalV2 (fire-and-forget client-side)
 * - extension/create-lead (after())
 * - cron/ai-score-refresh (batch)
 */
export async function POST(req: NextRequest) {
    try {
        const { leadId } = await req.json();
        if (!leadId) return NextResponse.json({ error: 'leadId é obrigatório' }, { status: 400 });

        const admin = createClient();
        const cleanId = leadId.toString().replace(/^(main_|crm26_|dist_|lead_|crm25_|master_)/, '');

        const { data: lead } = await admin
            .from('leads_manos_crm')
            .select('id, name, vehicle_interest, source, origem, valor_investimento, carro_troca, status')
            .eq('id', cleanId)
            .maybeSingle();

        if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });

        const feedbackContext = await getAIContext(cleanId).catch(() => '');

        const res = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{
                role: 'system',
                content: 'Você é um analista comercial da Manos Veículos (concessionária multimarcas, Tijucas/SC). Classifique o lead e crie o script de primeiro contato. Retorne APENAS JSON válido.' + feedbackContext,
            }, {
                role: 'user',
                content: `Lead:\n- Nome: ${lead.name || 'Desconhecido'}\n- Interesse: ${lead.vehicle_interest || 'Não informado'}\n- Origem: ${lead.source || lead.origem || 'Desconhecida'}\n- Investimento: ${lead.valor_investimento || 'Não informado'}\n- Troca: ${lead.carro_troca || 'Sem troca'}\n\nJSON esperado:\n{\n  "ai_score": 0-99,\n  "ai_classification": "hot"|"warm"|"cold",\n  "vehicle_interest_normalized": "Marca Modelo Ano (ou vazio se nao informado)",\n  "proxima_acao": "Script EXATO de 1-2 frases para WhatsApp. Sem listas. Sem gerundismo. Comece pelo nome do lead.",\n  "diagnostico": "1 linha sobre o perfil do lead"\n}`,
            }],
            response_format: { type: 'json_object' },
            temperature: 0.3,
            max_tokens: 250,
        });

        const result = JSON.parse(res.choices[0]?.message?.content || '{}');

        const updatePayload: Record<string, any> = {
            ai_score: Math.min(99, Math.max(1, Number(result.ai_score) || 40)),
            ai_classification: ['hot', 'warm', 'cold'].includes(result.ai_classification) ? result.ai_classification : 'warm',
            ai_reason: result.diagnostico || '',
            next_step: result.proxima_acao || '',
            proxima_acao: result.proxima_acao || '',
        };

        // Normaliza vehicle_interest apenas se a IA retornou algo útil
        const normalized = (result.vehicle_interest_normalized || '').trim();
        if (normalized.length > 3 && normalized.toLowerCase() !== 'vazio') {
            updatePayload.vehicle_interest = normalized;
        }

        await admin.from('leads_manos_crm').update(updatePayload).eq('id', cleanId);

        // Indexar embedding em background (busca semântica)
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
        fetch(`${siteUrl}/api/ai/embed-lead`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lead_id: cleanId }),
        }).catch(() => {});

        return NextResponse.json({ success: true, leadId: cleanId, ...updatePayload });
    } catch (err: any) {
        console.error('[init-score]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
