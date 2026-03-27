import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionToken } from '@/lib/extensionAuth';
import { getAIContext } from '@/lib/services/aiFeedbackService';
import { analyzeMultiModalChat } from '@/lib/gemini';
import { openai, AI_MODELS } from '@/lib/aiProviders';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const maxDuration = 60;

export async function POST(req: NextRequest) {
    const authError = verifyExtensionToken(req);
    if (authError) return authError;

    try {
        const body = await req.json();
        const { messages, leadId, consultantName, attachments = [] } = body;

        if (!messages || messages.length === 0) {
            return NextResponse.json({ error: 'Nenhuma mensagem para analisar' }, { status: 400 });
        }

        const consultor = consultantName || 'Consultor Especialista';
        const cleanId = leadId?.replace(/^(main_|crm26_|dist_|master_|lead_)/, '');
        const isCRM26 = leadId?.startsWith('crm26_');
        const isMaster = leadId?.startsWith('master_');
        const table = isCRM26 ? 'leads_distribuicao_crm_26' : (isMaster ? 'leads_master' : 'leads_manos_crm');

        const { data: lead } = await supabaseAdmin
            .from(table)
            .select('*')
            .eq('id', cleanId)
            .maybeSingle();

        const chatText = messages
            .map((m: any) => '[' + (m.direction === 'inbound' ? 'CLIENTE' : 'VENDEDOR') + ']: ' + m.content)
            .join('\n');

        const feedbackContext = cleanId ? await getAIContext(cleanId).catch(() => '') : '';
        const leadNome = lead?.nome || lead?.name || 'Desconhecido';

        // ── Tentativa 1: Gemini Flash (multimodal, mais barato) ───────────────
        try {
            const geminiResult = await analyzeMultiModalChat(chatText, attachments, leadNome);

            return NextResponse.json({
                success: true,
                provider: 'gemini',
                classificacao: geminiResult.classificacao || 'WARM',
                urgency_score: geminiResult.score || 50,
                diagnostico_360: geminiResult.resumo_estrategico,
                orientacao_tativa_vendedor: geminiResult.recomendacao_abordagem,
                script_whatsapp_agora: geminiResult.recomendacao_abordagem,
                por_que_este_script: geminiResult.resumo_detalhado,
                // Campos extras do Gemini
                estagio_funil: geminiResult.estagio_funil,
                proxima_acao: geminiResult.proxima_acao,
                probabilidade_fechamento: geminiResult.probabilidade_fechamento,
                intencao_compra: geminiResult.intencao_compra,
                objecoes: geminiResult.objecoes,
                behavioral_profile: geminiResult.behavioral_profile,
                vehicle_interest: geminiResult.vehicle_interest,
                valor_investimento: geminiResult.valor_investimento,
            });

        } catch (geminiErr: any) {
            console.warn('[analyze-chat] Gemini falhou, usando fallback GPT-4o:', geminiErr.message);
        }

        // ── Fallback: GPT-4o (Elite Closer V3 original) ───────────────────────
        const leadStatus = lead?.status || 'Novo';
        const leadInteresse = lead?.interesse || lead?.vehicle_interest || 'Nao informado';

        const prompt = [
            'Voce e o "Manos Elite Closer" - o maior fechador de carros do Brasil.',
            'Sua missao nao e apenas analisar, e ENTREGAR A VENDA na mao do consultor ' + consultor + '.',
            feedbackContext,
            '',
            '### PERFIL DO LEAD (CONTEXTO CIRURGICO)',
            '- Nome: ' + leadNome,
            '- Status Atual: ' + leadStatus,
            '- Interesse: ' + leadInteresse,
            '',
            '### CONVERSA REAL (ESTUDE A DOR E O TOM):',
            chatText,
            '',
            '### PROTOCOLO ELITE DE FECHAMENTO (Siga Rigorosamente):',
            '1. **PONTO DE CONTATO (HOOK)**: Nunca comece com "Oi, tudo bem?". Comece com algo real do chat ou uma oferta de valor.',
            '2. **GATILHOS PSICOLOGICOS**:',
            '   - **Escassez**: O carro esta sendo muito procurado.',
            '   - **Autoridade**: Voce (Consultor) conseguiu uma condicao unica com a gerencia.',
            '   - **Alternativa**: Sempre de duas opcoes (horario ou modelo).',
            '3. **ZERO ROBOTIZACAO**: Banido 100% o uso de listas, topicos ou verbos no infinitivo no script final.',
            '4. **BANIMENTO DE GERUNDISMO**: Nao use "vou estar verificando". Use "vi aqui agora", "consegui pra voce".',
            '5. **LINGUAGEM REGIONAL**: Seja humano, use girias leves de vendas, mas mantenha o nivel de autoridade.',
            '6. **SCORING CIRURGICO**: 90-100 e so pra quem vai fechar HOJE. 70-89 e interesse alto. Abaixo de 40 e gelado.',
            '7. **PROVA DE SCORE**: O campo "por_que_este_script" deve justificar o SCORE escolhido com base no guia.',
            '',
            '### JSON OBRIGATORIO (Elite Mode):',
            '{',
            '  "classificacao": "HOT" | "WARM" | "COLD",',
            '  "urgency_score": number,',
            '  "diagnostico_do_mentor": "Sua analise psicologica curta (2 linhas) para o vendedor.",',
            '  "orientacao_tativa_vendedor": "INSTRUCAO CIRURGICA: O que o vendedor deve fazer AGORA.",',
            '  "script_whatsapp_agora": "O texto EXATO: 1-2 frases CURTAS, IMPACTANTES, HUMANAS. SEM LISTAS. SEM INFINITIVO.",',
            '  "por_que_este_script": "A tecnica de fechamento usada."',
            '}',
        ].join('\n');

        const response = await openai.chat.completions.create({
            model: AI_MODELS.OPENAI_FULL,
            messages: [
                {
                    role: 'system',
                    content: `Voce e o Manos Elite Closer. Voce e ambicioso, persuasivo e protetor do faturamento da empresa. Voce nao da tarefas, voce da a tatica de xeque-mate. Use o nome do consultor (${consultor}).`,
                },
                { role: 'user', content: prompt },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.7,
        });

        const result = JSON.parse(response.choices[0]?.message?.content || '{}');

        return NextResponse.json({
            success: true,
            provider: 'openai',
            classificacao: result.classificacao || 'WARM',
            urgency_score: result.urgency_score || 50,
            diagnostico_360: result.diagnostico_do_mentor,
            orientacao_tativa_vendedor: result.orientacao_tativa_vendedor,
            script_whatsapp_agora: result.script_whatsapp_agora,
            por_que_este_script: result.por_que_este_script,
        });

    } catch (err: any) {
        console.error('Analyze Chat API Error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
