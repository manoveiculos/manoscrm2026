import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { getAIContext } from '@/lib/services/aiFeedbackService';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export const maxDuration = 60;

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
    try {
        const { leadId, messages, consultantName } = await req.json();

        if (!leadId) {
            return NextResponse.json({ error: 'Lead ID é obrigatório' }, { status: 400 });
        }

        const cleanId = leadId.replace(/main_|crm26_|dist_/, '');
        const isCRM26 = leadId.startsWith('crm26_');
        const table = isCRM26 ? 'leads_distribuicao_crm_26' : 'leads_manos_crm';

        // 1. Fetch Lead Details & Inventory Summary
        const [{ data: lead }, { data: inventory }] = await Promise.all([
            supabaseAdmin.from(table).select('*').eq('id', cleanId).maybeSingle(),
            supabaseAdmin.from('inventory_manos_crm').select('marca, modelo, ano, preco').limit(30)
        ]);

        if (!lead) {
            return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });
        }

        const inventorySummary = (inventory || []).map(i => `- ${i.marca} ${i.modelo} (${i.ano}) - R$ ${i.preco}`).join('\n');
        
        let chatText = "Nenhuma mensagem sincronizada no WhatsApp ainda.";
        if (messages && messages.length > 0) {
            chatText = messages.map((m: any) => `[${m.created_at ? new Date(m.created_at).toLocaleString('pt-BR') : 'Agora'}] ${m.direction === 'inbound' ? 'CLIENTE' : 'VENDEDOR'}: ${m.content}`).join('\n');
        }

        const consultor = consultantName || 'Consultor Especialista';

        // 2. BUSCAR CONTEXTO DE APRENDIZADO DA IA (Reportes dos vendedores)
        const feedbackContext = await getAIContext(leadId);

        // 3. OpenAI Elite Closers Protocol (V3 - Feedback Aware)
        const prompt = `Você é o "Mano’s Elite Closer" – o maior fechador de carros do Brasil. Sua missão não é apenas dar conselhos, é ENTREGAR A VENDA na mão do consultor ${consultor}.
        
        ### PERFIL DO LEAD (CONTEXTO CIRÚRGICO)
        - Nome: ${lead.nome || lead.name || 'Desconhecido'}
        - Status: ${lead.status || 'Novo'}
        - Interesse: ${lead.interesse || lead.vehicle_interest || 'Não informado'}
        
        ### CONVERSA REAL (ESTUDE O TOM E A DOR):
        ${chatText}
        
        ### ESTOQUE ATUAL (USE PARA FECHAR OU OFERECER ALTERNATIVA):
        ${inventorySummary}
        
        ${feedbackContext}
        
        ### PROTOCOLO ELITE DE FECHAMENTO (Siga Rigorosamente):
        1. **PONTO DE CONTATO (HOOK)**: Nunca comece com "Oi, tudo bem?". Comece com algo real do chat ou uma oferta de valor.
        2. **GATILHOS PSICOLÓGICOS**:
           - **Escassez**: O carro está sendo muito procurado.
           - **Autoridade**: Você (Consultor) conseguiu uma condição única com a gerência.
           - **Alternativa**: Sempre dê duas opções de horário ou de modelo.
        3. **ZERO ROBOTIZAÇÃO**: Banido 100% o uso de listas, tópicos ou verbos no infinitivo no script final.
        4. **BANIMENTO DE GERUNDISMO**: Não use "vou estar verificando". Use "vi aqui agora", "consegui pra você".
        5. **LINGUAGEM REGIONAL**: Seja humano, use gírias leves de vendas ("fera", "meu amigo", "opa", "show"), mas mantenha o nível de autoridade.
        6. **SCORING CIRÚRGICO**: 90-100 é só pra quem vai fechar HOJE. 70-89 é interesse alto. Abaixo de 40 é gelado.
        7. **PROVA DE SCORE**: O campo "por_que_este_script" deve justificar o SCORE escolhido com base no guia.
        
        ### JSON OBRIGATÓRIO (Elite Mode):
        {
          "diagnostico_360": "Análise da mente do lead e do erro/acerto do vendedor.",
          "orientacao_tativa_vendedor": "INSTRUÇÃO CIRÚRGICA: O que o vendedor deve fazer AGORA.",
          "script_whatsapp_agora": "O texto EXATO: 1-2 frases CURTAS, IMPACTANTES, HUMANAS.",
          "urgency_score": number,
          "temperature": "frio" | "morno" | "quente",
          "recommended_status": "new" | "attempt" | "contacted" | "negotiation" | "proposed",
          "por_que_este_script": "A técnica de fechamento usada."
        }`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: `Você é o Mano’s Elite Closer. Você é ambicioso e estratégico. Defina o status operacional do lead com base na evolução da conversa: 
                - 'new': Recém chegado.
                - 'attempt': Vendedor tentou mas não houve conversa fluida.
                - 'contacted': Conversa ativa e em andamento.
                - 'negotiation': Falando de valores, prazos ou modelos específicos.
                - 'proposed': Em fase final de fechamento/proposta enviada.` },
                { role: 'user', content: prompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.7,
        });

        const iaResult = JSON.parse(response.choices[0]?.message?.content || '{}');
        const diagnostico = iaResult.diagnostico_360 || iaResult.diagnostico_do_mentor || "Análise não concluída.";
        const orientacao = iaResult.orientacao_tativa_vendedor || "Aja com naturalidade.";
        const scriptWhatsApp = iaResult.script_whatsapp_agora || "Oi!"; 
        const urgencyScore = iaResult.urgency_score || 0;
        const temperature = iaResult.temperature || 'morno';
        const recommendedStatus = iaResult.recommended_status || lead.status;

        // --- PERSISTENCE LOGIC ---
        const timestamp = new Date().toLocaleString('pt-BR');
        const timelineNote = `[${timestamp}] 👨‍🏫 MENTORIA IA (ELITE CLOSER):\nSTATUS RECOMENDADO: ${recommendedStatus}\nDIAGNÓSTICO: ${diagnostico}\n\nORIENTAÇÃO: ${orientacao}\n\n`;

        const updateData: any = {
            [isCRM26 ? 'resumo_consultor' : 'ai_reason']: `${diagnostico} | ORIENTAÇÃO: ${orientacao}`,
            [isCRM26 ? 'resumo' : 'ai_summary']: timelineNote + (lead?.ai_summary || lead?.resumo || ''),
            ai_score: urgencyScore,
            ai_classification: temperature === 'quente' ? 'hot' : temperature === 'morno' ? 'warm' : 'cold',
            next_step: scriptWhatsApp,
            proxima_acao: scriptWhatsApp,
            status: recommendedStatus // AUTO STATUS UPDATE
        };

        await supabaseAdmin
            .from(table)
            .update(updateData)
            .eq('id', cleanId);
        
        console.log(`[NextSteps API] Elite V2 analysis persisted for lead ${leadId} (Score: ${urgencyScore}, Status: ${recommendedStatus})`);

        return NextResponse.json({
            success: true,
            diagnostico,
            orientacao,
            proximos_passos: [scriptWhatsApp],
            urgency_score: urgencyScore,
            temperature,
            status: recommendedStatus
        });

    } catch (err: any) {
        console.error("Next Steps API Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
