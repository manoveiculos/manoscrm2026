import { NextRequest, NextResponse } from 'next/server';
import { getGeminiModel, AI_MODELS } from '@/lib/aiProviders';
import { createClient } from '@/lib/supabase/admin';
import { logAiCall } from '@/lib/services/observability';

export async function POST(req: NextRequest) {
    const body = await req.json();
    const { audioUrl, audioBase64, mimeType = 'audio/ogg', leadId, leadTable = 'leads_distribuicao_crm_26' } = body;

    try {
        if (!audioUrl && !audioBase64) {
            return NextResponse.json({ success: false, error: 'É necessário fornecer a url do áudio (audioUrl) ou o áudio em base64 (audioBase64).' }, { status: 400 });
        }

        if (!leadId) {
            return NextResponse.json({ success: false, error: 'O parâmetro leadId é obrigatório.' }, { status: 400 });
        }

        let base64Data = '';
        if (audioBase64) {
            base64Data = audioBase64.includes(',') ? audioBase64.split(',')[1] : audioBase64;
        } else if (audioUrl) {
            console.log(`[AnalyzeAudio] Baixando áudio de: ${audioUrl}`);
            const response = await fetch(audioUrl);
            if (!response.ok) {
                return NextResponse.json({ success: false, error: `Falha ao baixar áudio da URL fornecida: HTTP ${response.status}` }, { status: 400 });
            }
            const arrayBuffer = await response.arrayBuffer();
            base64Data = Buffer.from(arrayBuffer).toString('base64');
        }

        console.log(`[AnalyzeAudio] Enviando áudio de tamanho ${base64Data.length} bytes para o Gemini 2.0 Flash...`);
        const model = getGeminiModel(AI_MODELS.GEMINI_FLASH);

        const prompt = `Você é um Sales Copilot altamente experiente. Sua tarefa é transcrever e analisar o áudio enviado por um cliente interessado em comprar um veículo.
Responda EXCLUSIVAMENTE em formato JSON válido contendo as seguintes propriedades:
{
  "transcricao": "A transcrição literal e fiel do áudio, sem resumos no texto da transcrição em si.",
  "sentimento": "O sentimento do cliente (ex: muito interessado, indeciso, impaciente, confuso, desconfiado).",
  "objecao": "As objeções explícitas ou implícitas detectadas (ex: preço, parcelas, valor de troca, distância) ou null se não houver nenhuma.",
  "resumo_audio": "Um resumo de 1 linha da mensagem de áudio."
}`;

        const t0 = Date.now();
        const result = await model.generateContent([
            {
                inlineData: {
                    data: base64Data,
                    mimeType: mimeType
                }
            },
            prompt
        ]);
        const latencyMs = Date.now() - t0;

        const text = result.response.text();
        const usage = result.response.usageMetadata;
        console.log('[AnalyzeAudio] Resposta do Gemini:', text);
        
        // Log de Telemetria
        logAiCall({
            model: AI_MODELS.GEMINI_FLASH,
            promptTokens: usage?.promptTokenCount || 0,
            completionTokens: usage?.candidatesTokenCount || 0,
            totalTokens: usage?.totalTokenCount || 0,
            latencyMs,
            callerApi: '/api/lead/analyze-audio',
            leadId: String(leadId),
            status: 'success'
        });
        
        let analysis;
        try {
            const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
            analysis = JSON.parse(cleanJson);
        } catch (jsonErr) {
            console.error('[AnalyzeAudio] Erro ao parsear JSON do Gemini, usando regex:', jsonErr);
            const transcricaoMatch = text.match(/"transcricao":\s*"([^"]+)"/);
            const sentimentoMatch = text.match(/"sentimento":\s*"([^"]+)"/);
            const objecaoMatch = text.match(/"objecao":\s*"([^"]+)"/);
            
            analysis = {
                transcricao: transcricaoMatch ? transcricaoMatch[1] : text,
                sentimento: sentimentoMatch ? sentimentoMatch[1] : 'indefinido',
                objecao: objecaoMatch ? objecaoMatch[1] : null,
                resumo_audio: 'Transcrição processada com fallback.'
            };
        }

        // Salva a mensagem no histórico de WhatsApp como "[Áudio Transcrito]: ..."
        const admin = createClient();
        const transcriptionLabel = `🎙️ [Áudio Transcrito - Resumo: ${analysis.resumo_audio}]:\n"${analysis.transcricao}"\n\n(Sentimento: ${analysis.sentimento}${analysis.objecao ? ` | Objeção: ${analysis.objecao}` : ''})`;

        const msgPayload: any = {
            direction: 'inbound',
            message_text: transcriptionLabel,
            message_id: `audio_transcription_${Date.now()}`
        };

        if (leadTable === 'leads_compra') {
            msgPayload.lead_compra_id = leadId;
        } else {
            msgPayload.lead_id = String(leadId);
        }

        const { error: dbError } = await admin
            .from('whatsapp_messages')
            .insert(msgPayload);

        if (dbError) {
            console.warn('[AnalyzeAudio] Erro ao salvar transcrição na tabela whatsapp_messages:', dbError.message);
        }

        // Se o lead tiver um campo de resumo ou IA na tabela do lead, atualizamos também
        try {
            const { data: currentLead } = await admin
                .from(leadTable)
                .select('ai_summary')
                .eq('id', leadId)
                .maybeSingle();

            if (currentLead) {
                const currentSummary = currentLead.ai_summary || '';
                const updatedSummary = `[Análise Áudio ${new Date().toLocaleDateString('pt-BR')}]: ${analysis.resumo_audio} (${analysis.sentimento})\n${currentSummary}`;
                await admin
                    .from(leadTable)
                    .update({ ai_summary: updatedSummary.slice(0, 1500) })
                    .eq('id', leadId);
            }
        } catch (leadUpdateErr) {
            console.warn('[AnalyzeAudio] Não foi possível atualizar o ai_summary do lead:', leadUpdateErr);
        }

        return NextResponse.json({
            success: true,
            analysis
        });
    } catch (e: any) {
        console.error('[AnalyzeAudio] Critical error:', e);
        
        logAiCall({
            model: AI_MODELS.GEMINI_FLASH,
            status: 'error',
            errorMessage: e?.message || 'Erro desconhecido',
            callerApi: '/api/lead/analyze-audio',
            leadId: String(leadId),
        });

        return NextResponse.json({ success: false, error: e?.message || 'Internal Server Error' }, { status: 500 });
    }
}
