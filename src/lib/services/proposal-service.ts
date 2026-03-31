import { createClient } from '@supabase/supabase-js';
import { OpenAI } from 'openai';
import { getAIContext } from '@/lib/services/aiFeedbackService';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export interface ProposalResult {
    titulo: string;
    pitch: string;
    cenarios: any[];
    cta: string;
}

export async function runGenerateProposal(leadId: string): Promise<ProposalResult> {
    const cleanId = leadId.replace(/^(main_|crm26_|dist_|lead_|crm25_|master_)/, '');

    const { data: lead } = await supabaseAdmin
        .from('leads_manos_crm')
        .select('name, vehicle_interest, valor_investimento, carro_troca, ai_classification, source')
        .eq('id', cleanId)
        .maybeSingle();

    if (!lead) throw new Error('Lead não encontrado para gerar proposta');

    const feedbackContext = await getAIContext(cleanId).catch(() => '');
    const nome = lead.name || 'Cliente';
    const veiculo = lead.vehicle_interest || 'veículo de interesse';
    const investimento = lead.valor_investimento || 'Não informado';
    const troca = lead.carro_troca || 'Sem troca';

    const res = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
            role: 'system',
            content: 'Você é um consultor financeiro sênior da Manos Veículos. Crie propostas realistas. ' + feedbackContext,
        }, {
            role: 'user',
            content: `Lead: ${nome}\nVeículo interesse: ${veiculo}\nInvestimento declarado: ${investimento}\nCarro na troca: ${troca}\n\nJSON (sem markdown):\n{\n  "titulo": "Proposta — [abreviação do veículo]",\n  "pitch": "1-2 frases de abertura",\n  "cenarios": [\n    { "label": "24x", "entrada": "R$ X.XXX", "parcela": "R$ X.XXX/mês", "obs": "1 frase" },\n    { "label": "36x", "entrada": "R$ X.XXX", "parcela": "R$ X.XXX/mês", "obs": "1 frase" },\n    { "label": "48x", "entrada": "R$ X.XXX", "parcela": "R$ X.XXX/mês", "obs": "1 frase" }\n  ],\n  "cta": "Frase final"\n}`,
        }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 400,
    });

    const result = JSON.parse(res.choices[0]?.message?.content || '{}');

    const proposal = {
        titulo: result.titulo || `Proposta — ${nome}`,
        pitch: result.pitch || '',
        cenarios: Array.isArray(result.cenarios) ? result.cenarios.slice(0, 3) : [],
        cta: result.cta || '',
    };

    // Persiste no banco
    await supabaseAdmin.from('leads_manos_crm').update({
        last_proposal_json: proposal,
        last_proposal_at: new Date().toISOString(),
    }).eq('id', cleanId);

    // REGISTRO NA TIMELINE
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(cleanId);
    await supabaseAdmin.from('interactions_manos_crm').insert({
        [isUUID ? 'lead_id' : 'lead_id_v1']: cleanId,
        type: 'note',
        notes: `📄 PROPOSTA GERADA AUTOMATICAMENTE (IA): ${proposal.titulo}. ${proposal.pitch}`,
        created_at: new Date().toISOString(),
        user_name: 'SISTEMA (IA)'
    });

    return proposal;
}
