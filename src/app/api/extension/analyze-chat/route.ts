import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { verifyExtensionToken } from '@/lib/extensionAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
    const authError = verifyExtensionToken(req);
    if (authError) return authError;

    try {
        const body = await req.json();
        const { messages, leadId, consultantName } = body;

        if (!messages || messages.length === 0) {
            return NextResponse.json({ error: 'Nenhuma mensagem para analisar' }, { status: 400 });
        }

        const consultor = consultantName || 'Consultor Especialista';
        const cleanId = leadId?.replace(/main_|crm26_|dist_/, '');
        const isCRM26 = leadId?.startsWith('crm26_');
        const table = isCRM26 ? 'leads_distribuicao_crm_26' : 'leads_manos_crm';

        // 1. Fetch Lead context for deeper logic
        const { data: lead } = await supabaseAdmin
            .from(table)
            .select('*')
            .eq('id', cleanId)
            .maybeSingle();

        const chatText = messages.map((m: any) => `[${m.direction === 'inbound' ? 'CLIENTE' : 'VENDEDOR'}]: ${m.content}`).join('\n');

        // 2. OpenAI Elite Closers Protocol (V2)
        const prompt = `Você é o "Mano’s Elite Closer" – o maior fechador de carros do Brasil. Sua missão não é apenas analisar, é ENTREGAR A VENDA na mão do consultor ${consultor}.
        
        ### PERFIL DO LEAD (CONTEXTO CIRÚRGICO)
        - Nome: ${lead?.nome || lead?.name || 'Desconhecido'}
        - Status Atual: ${lead?.status || 'Novo'}
        - Interesse: ${lead?.interesse || lead?.vehicle_interest || 'Não informado'}
        
        ### CONVERSA REAL (ESTUDE A DOR E O TOM):
        ${chatText}
        
        ### PROTOCOLO ELITE DE FECHAMENTO (Siga Rigorosamente):
        1. **PONTO DE CONTATO (HOOK)**: Nunca comece com "Oi, tudo bem?". Comece com algo real do chat ou uma oferta de valor.
        2. **GATILHOS PSICOLÓGICOS**:
           - **Escassez**: O carro está sendo muito procurado.
           - **Autoridade**: Você (Consultor) conseguiu uma condição única com a gerência.
           - **Alternativa**: Sempre dê duas opções (horário ou modelo).
        3. **ZERO ROBOTIZAÇÃO**: Banido 100% o uso de listas, tópicos ou verbos no infinitivo no script final.
        4. **BANIMENTO DE GERUNDISMO**: Não use "vou estar verificando". Use "vi aqui agora", "consegui pra você".
        5. **LINGUAGEM REGIONAL**: Seja humano, use gírias leves de vendas ("fera", "meu amigo", "opa", "show"), mas mantenha o nível de autoridade.
        6. **SCORING CIRÚRGICO**: 90-100 é só pra quem vai fechar HOJE. 70-89 é interesse alto. Abaixo de 40 é gelado.
        7. **PROVA DE SCORE**: O campo "por_que_este_script" deve justificar o SCORE escolhido com base no guia.
        
        ### JSON OBRIGATÓRIO (Elite Mode):
        {
          "classificacao": "HOT" | "WARM" | "COLD",
          "urgency_score": number, 
          "diagnostico_do_mentor": "Sua análise psicológica curta (2 linhas) para o vendedor.",
          "orientacao_tativa_vendedor": "INSTRUÇÃO CIRÚRGICA: O que o vendedor deve fazer AGORA.",
          "script_whatsapp_agora": "O texto EXATO: 1-2 frases CURTAS, IMPACTANTES, HUMANAS. SEM LISTAS. SEM INFINITIVO.",
          "por_que_este_script": "A técnica de fechamento usada."
        }`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { role: 'system', content: `Você é o Mano’s Elite Closer. Você é ambicioso, persuasivo e protetor do faturamento da empresa. Você não dá tarefas, você dá a tática de xeque-mate. Use o nome do consultor (${consultor}).` },
                { role: 'user', content: prompt }
            ],
            response_format: { type: "json_object" },
            temperature: 0.7,
        });

        const result = JSON.parse(response.choices[0]?.message?.content || '{}');

        return NextResponse.json({
            success: true,
            classificacao: result.classificacao || 'WARM',
            urgency_score: result.urgency_score || 50,
            diagnostico_360: result.diagnostico_do_mentor,
            orientacao_tativa_vendedor: result.orientacao_tativa_vendedor,
            script_whatsapp_agora: result.script_whatsapp_agora,
            por_que_este_script: result.por_que_este_script
        });

    } catch (err: any) {
        console.error("Analyze Chat API Error:", err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
