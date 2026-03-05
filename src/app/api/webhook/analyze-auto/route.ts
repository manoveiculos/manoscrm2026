import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { OpenAI } from 'openai';

export const maxDuration = 60; // Limite de 60s na Vercel

let openaiInstance: OpenAI | null = null;
function getOpenAI() {
    if (!openaiInstance && process.env.OPENAI_API_KEY) {
        openaiInstance = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return openaiInstance;
}

export async function POST(req: NextRequest) {
    try {
        const payload = await req.json();
        const leadId = payload.lead_id;

        if (!leadId) {
            return NextResponse.json({ success: false, error: 'lead_id é obrigatório' }, { status: 400 });
        }

        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { cookies: { get: () => undefined, set: () => { }, remove: () => { } } }
        );

        // 1. Fetch Lead
        const { data: lead, error: leadError } = await supabase
            .from('leads_distribuicao_crm_26')
            .select('*')
            .eq('id', leadId)
            .single();

        if (leadError || !lead) {
            return NextResponse.json({ success: false, error: 'Lead não encontrado' }, { status: 404 });
        }

        // 2. Fetch Messages History
        const { data: messages, error: messagesError } = await supabase
            .from('whatsapp_messages')
            .select('*')
            .eq('lead_id', leadId)
            .order('created_at', { ascending: true });

        // Monta o texto do chat. Se não tiver tabela ou mensagens, usa o 'resumo'
        let chatText = '';
        if (messages && messages.length > 0) {
            chatText = messages.map(m => `[${m.direction === 'inbound' ? 'CLIENTE' : 'VENDEDOR'}]: ${m.message_text}`).join('\n');
        } else {
            chatText = lead.resumo || 'Sem histórico de conversa estruturado ainda.';
        }

        // 3. Setup OpenAI
        const openai = getOpenAI();
        if (!openai) {
            return NextResponse.json({ success: false, error: 'OpenAI não configurada' }, { status: 500 });
        }

        // 4. Chamada p/ IA
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'Você é a IA de Vendas Sênior do Manos CRM. Analise a conversa de WhatsApp de forma CRONOLÓGICA (Top-to-Bottom). O topo é o início (mais antigo), a base é o final (mais recente). Use as datas das mensagens para garantir que entendeu a sequência correta da negociação.'
                },
                {
                    role: 'user',
                    content: `NOME DO LEAD: ${lead.nome}\nCONVERSA (DO TOPO PARA BAIXO - CRONOLÓGICO):\n${chatText}\n\n
RETORNE UM JSON EXATAMENTE COM ESTAS CHAVES:
{
  "score": number (de 0 a 100 com chance de venda),
  "classification": "hot" | "warm" | "cold",
  "reason": "Resumo de 1 frase justificando o interesse",
  "sentiment": "Positivo", "Neutro", "Frustrado", "Decidido" ou "Curioso",
  "intentions": ["Array de strings", "Ex: Compra imediata", "Busca financiamento", "Quer avaliar troca"],
  "next_step": "Aja como roteirista. Qual a exata PRÓXIMA PERGUNTA ou MENSAGEM que o vendedor deve enviar para puxar o cliente para a loja?",
  "closing_probability": number (probabilidade atual em %),
  "ai_summary": "Resumo executivo completo da negociação até agora para o Cockpit do Vendedor",
  "urgency": "high" | "medium" | "low"
}`
                }
            ],
            response_format: { type: "json_object" }
        }, { timeout: 45000 });

        const output_text = response.choices[0]?.message?.content;
        if (!output_text) throw new Error("A IA retornou vazio.");

        const aiData = JSON.parse(output_text);

        // 5. Salva de volta no Lead
        const behavioralPayload = {
            sentiment: aiData.sentiment || 'Neutro',
            intentions: aiData.intentions || ['Curiosidade inicial'],
            closing_probability: aiData.closing_probability || 50,
            urgency: aiData.urgency || 'medium'
        };

        const { error: updateError } = await supabase
            .from('leads_distribuicao_crm_26')
            .update({
                ai_score: aiData.score || 50,
                ai_classification: aiData.classification || 'warm',
                ai_reason: aiData.reason || 'Análise automática realizada.',
                next_step: aiData.next_step || 'Aguardar contato.',
                ai_summary: aiData.ai_summary || chatText.substring(0, 100),
                behavioral_profile: behavioralPayload,
                atualizado_em: new Date().toISOString()
            })
            .eq('id', leadId);

        if (updateError) throw updateError;

        return NextResponse.json({ success: true, message: 'Reanálise automática concluída.' });

    } catch (error: any) {
        console.error('Auto Analyze Error:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
