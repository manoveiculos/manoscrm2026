import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { OpenAI } from 'openai';

export const maxDuration = 30;

let openaiInstance: OpenAI | null = null;
function getOpenAI() {
    if (!openaiInstance && process.env.OPENAI_API_KEY) {
        openaiInstance = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return openaiInstance;
}

/**
 * POST /api/lead/handoff-brief
 * Gera resumo de passagem de bastão para o novo consultor.
 * Só executa se havia um consultor anterior (redistribuição real, não atribuição inicial).
 */
export async function POST(req: NextRequest) {
    try {
        const { leadId, newConsultantId, newConsultantName, previousConsultantId } = await req.json();

        if (!leadId || !newConsultantId) {
            return NextResponse.json({ error: 'leadId e newConsultantId são obrigatórios' }, { status: 400 });
        }

        // Não gera briefing em atribuição inicial
        if (!previousConsultantId || previousConsultantId === newConsultantId) {
            return NextResponse.json({ skipped: true, reason: 'Atribuição inicial ou mesmo consultor' });
        }

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { get: () => undefined, set: () => { }, remove: () => { } } }
        );

        const { data: lead } = await supabase
            .from('leads_unified')
            .select('table_name, name, status, vehicle_interest, ai_score, ai_summary, next_step, proxima_acao, source, behavioral_profile, ai_classification')
            .eq('native_id', leadId)
            .single();

        if (!lead) {
            return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });
        }

        const openai = getOpenAI();
        if (!openai) {
            return NextResponse.json({ error: 'OpenAI não configurada' }, { status: 500 });
        }

        const leadName = lead.name || 'Cliente';
        const vehicle = lead.vehicle_interest || 'não informado';
        const nextAction = lead.next_step || lead.proxima_acao || 'sem ação definida';
        const profile = lead.behavioral_profile as any;
        const sentiment = profile?.sentiment || 'Neutro';
        const urgency = profile?.urgency || 'medium';

        const res = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.25,
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: 'Você é um especialista em transferência de leads automotivos. Gere um briefing de passagem de bastão objetivo e acionável para o novo consultor.'
                },
                {
                    role: 'user',
                    content: `Novo consultor: ${newConsultantName || 'Consultor'}
Lead: ${leadName}
Veículo de interesse: ${vehicle}
Etapa: ${lead.status}
Score IA: ${lead.ai_score}% (${lead.ai_classification || 'warm'})
Sentimento detectado: ${sentiment} | Urgência: ${urgency}
Resumo da negociação: ${lead.ai_summary || 'Sem histórico de análise'}
Próxima ação recomendada: ${nextAction}
Origem: ${lead.source || 'não informada'}

Retorne JSON: {
  "handoff_summary": "Briefing em 3-4 frases para ${newConsultantName || 'o novo consultor'}: contexto da negociação, onde o cliente está emocionalmente, ponto crítico de atenção e exata próxima ação recomendada. Máximo 220 chars."
}`
                }
            ],
            max_tokens: 200,
        }, { timeout: 20000 });

        const parsed = JSON.parse(res.choices[0]?.message?.content || '{}');
        const summary = String(parsed.handoff_summary || '').slice(0, 280);

        if (!summary) {
            return NextResponse.json({ error: 'IA retornou vazio' }, { status: 500 });
        }

        const now = new Date().toISOString();

        // Salva no lead (na tabela original correta)
        await supabase
            .from(lead.table_name || 'leads_manos_crm')
            .update({ handoff_summary: summary, handoff_at: now })
            .eq('id', leadId);

        // Alerta para o novo consultor no Cowork IA
        await supabase.from('cowork_alerts').insert({
            type: 'handoff',
            title: `Lead redistribuído — ${leadName}`,
            message: summary,
            priority: lead.ai_classification === 'hot' || (lead.ai_score || 0) >= 70 ? 1 : 2,
            target_consultant_id: newConsultantId,
            is_active: true,
            metadata: { lead_id: leadId, previous_consultant_id: previousConsultantId, ai_score: lead.ai_score },
        });

        // Log na timeline
        await supabase.from('interactions_manos_crm').insert({
            lead_id: leadId,
            notes: `[HANDOFF] Lead redistribuído para ${newConsultantName || 'novo consultor'}. Briefing: "${summary}"`,
            new_status: lead.status,
            type: 'redistribuicao',
            created_at: now,
        }).then(null, () => {});

        return NextResponse.json({ success: true, handoff_summary: summary });

    } catch (err: any) {
        console.error('[handoff-brief]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
