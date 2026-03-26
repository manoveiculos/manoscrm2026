import { createClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { getAIContext } from '@/lib/services/aiFeedbackService';

export const maxDuration = 30;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * POST /api/lead/generate-proposal
 * Gera 3 cenários de proposta de financiamento para o vendedor apresentar.
 *
 * Input:  { leadId }
 * Output: { titulo, pitch, cenarios[], cta }
 */
export async function POST(req: NextRequest) {
    try {
        const { leadId } = await req.json();
        if (!leadId) return NextResponse.json({ error: 'leadId obrigatório' }, { status: 400 });

        const admin = createClient();
        const cleanId = leadId.toString().replace(/^(main_|crm26_|dist_|lead_|crm25_|master_)/, '');

        const { data: lead } = await admin
            .from('leads_manos_crm')
            .select('name, vehicle_interest, valor_investimento, carro_troca, ai_classification, source')
            .eq('id', cleanId)
            .maybeSingle();

        if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });

        const feedbackContext = await getAIContext(cleanId).catch(() => '');
        const nome = lead.name || 'Cliente';
        const veiculo = lead.vehicle_interest || 'veículo de interesse';
        const investimento = lead.valor_investimento || 'Não informado';
        const troca = lead.carro_troca || 'Sem troca';

        const res = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{
                role: 'system',
                content: 'Você é um consultor financeiro sênior da Manos Veículos (concessionária multimarcas, Rio Do Sul/SC). Crie propostas realistas baseadas em taxas médias de mercado (1,29% a 1,79% a.m.). Use valores arredondados. Seja direto e comercialmente agressivo.' + feedbackContext,
            }, {
                role: 'user',
                content: `Lead: ${nome}\nVeículo interesse: ${veiculo}\nInvestimento declarado: ${investimento}\nCarro na troca: ${troca}\n\nJSON (sem markdown):\n{\n  "titulo": "Proposta — [abreviação do veículo]",\n  "pitch": "1-2 frases de abertura para apresentar ao cliente",\n  "cenarios": [\n    { "label": "24x", "entrada": "R$ X.XXX", "parcela": "R$ X.XXX/mês", "obs": "1 frase de vantagem" },\n    { "label": "36x", "entrada": "R$ X.XXX", "parcela": "R$ X.XXX/mês", "obs": "1 frase de vantagem" },\n    { "label": "48x", "entrada": "R$ X.XXX", "parcela": "R$ X.XXX/mês", "obs": "1 frase de vantagem" }\n  ],\n  "cta": "Frase final de fechamento para o vendedor usar agora"\n}`,
            }],
            response_format: { type: 'json_object' },
            temperature: 0.3,
            max_tokens: 400,
        });

        const result = JSON.parse(res.choices[0]?.message?.content || '{}');

        return NextResponse.json({
            titulo: result.titulo || `Proposta — ${nome}`,
            pitch: result.pitch || '',
            cenarios: Array.isArray(result.cenarios) ? result.cenarios.slice(0, 3) : [],
            cta: result.cta || '',
        });
    } catch (err: any) {
        console.error('[generate-proposal]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
