import { createClient } from '@/lib/supabase/admin';
import { OpenAI } from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MIN_MESSAGES_FOR_ANALYSIS = 2;
const MAX_MESSAGES_TO_ANALYZE = 30;
const SLOW_REPLY_THRESHOLD_HOURS = 24;

type Attribution = 'client_disengaged' | 'consultant_abandoned' | 'external_factor' | 'no_history';

interface WhatsAppMessage {
    direction: 'inbound' | 'outbound';
    message_text: string;
    created_at: string;
}

interface AnalysisResult {
    loss_attribution: Attribution;
    loss_attribution_reason: string;
    consultant_response_score: number;
}

/**
 * Busca mensagens WhatsApp do lead, fazendo o bridge entre leads_manos_crm
 * (que não tem FK direto para whatsapp_messages) e leads_distribuicao_crm_26
 * via telefone (sufixo 8 dígitos).
 */
async function fetchLeadMessages(
    admin: ReturnType<typeof createClient>,
    phone: string
): Promise<WhatsAppMessage[]> {
    if (!phone) return [];
    const cleanPhone = phone.replace(/\D/g, '');
    const phoneSuffix = cleanPhone.slice(-8);
    if (!phoneSuffix) return [];

    // Acha o lead correspondente em crm_26 (que é o que whatsapp_messages referencia)
    const { data: crm26Lead } = await admin
        .from('leads_distribuicao_crm_26')
        .select('id')
        .ilike('telefone', `%${phoneSuffix}%`)
        .limit(1)
        .maybeSingle();

    if (!crm26Lead?.id) return [];

    const { data: messages } = await admin
        .from('whatsapp_messages')
        .select('direction, message_text, created_at')
        .eq('lead_id', crm26Lead.id)
        .order('created_at', { ascending: true })
        .limit(MAX_MESSAGES_TO_ANALYZE);

    return (messages || []) as WhatsAppMessage[];
}

/**
 * Calcula o score de proatividade do vendedor (0-100) baseado em:
 *  - Quem mandou a última mensagem? (vendedor=bom, cliente=ruim)
 *  - Tempo médio entre msg do cliente → resposta do vendedor
 *  - Quantas msgs do cliente ficaram sem resposta
 */
function computeResponseScore(messages: WhatsAppMessage[]): number {
    if (messages.length < MIN_MESSAGES_FOR_ANALYSIS) return 50;

    let score = 100;
    const last = messages[messages.length - 1];

    // Penalty 1: cliente foi quem mandou por último (vendedor não respondeu)
    if (last.direction === 'inbound') {
        const hoursSinceLast = (Date.now() - new Date(last.created_at).getTime()) / 3_600_000;
        if (hoursSinceLast > SLOW_REPLY_THRESHOLD_HOURS) score -= 50;
        else score -= 20;
    }

    // Penalty 2: tempo médio de resposta do vendedor
    let totalResponseMs = 0;
    let responseCount = 0;
    let unansweredFromClient = 0;

    for (let i = 0; i < messages.length - 1; i++) {
        if (messages[i].direction !== 'inbound') continue;
        const next = messages[i + 1];
        if (next.direction === 'outbound') {
            const delta = new Date(next.created_at).getTime() - new Date(messages[i].created_at).getTime();
            totalResponseMs += delta;
            responseCount++;
        } else {
            unansweredFromClient++;
        }
    }

    if (responseCount > 0) {
        const avgHours = totalResponseMs / responseCount / 3_600_000;
        if (avgHours > 24) score -= 30;
        else if (avgHours > 6) score -= 15;
        else if (avgHours > 1) score -= 5;
    }

    score -= Math.min(30, unansweredFromClient * 10);

    return Math.max(0, Math.min(100, score));
}

/**
 * Pede ao GPT-4o mini para classificar a atribuição da culpa.
 * Recebe o histórico já truncado e o motivo informado pelo vendedor.
 */
async function classifyAttributionWithAI(
    messages: WhatsAppMessage[],
    consultantReason: string,
    responseScore: number
): Promise<{ attribution: Attribution; reason: string }> {
    const transcript = messages
        .map(m => `[${m.direction === 'inbound' ? 'CLIENTE' : 'VENDEDOR'}] ${m.message_text}`)
        .join('\n');

    const res = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
            role: 'system',
            content: `Você é auditor de qualidade comercial. Analise o histórico do WhatsApp e classifique a CULPA real pela perda da venda. Seja honesto: vendedores tendem a justificar perdas como "sem interesse" para se livrar de leads — sua função é detectar isso.

Categorias:
- client_disengaged: cliente disse claramente "não tenho interesse / já comprei / não posso agora" OU sumiu sem responder mesmo com follow-ups do vendedor
- consultant_abandoned: cliente respondeu, demonstrou interesse, e o vendedor NÃO retornou ou demorou mais de 24h
- external_factor: crédito negado, problema técnico do veículo, mudança de cidade — fora do controle do vendedor

Responda APENAS JSON válido.`,
        }, {
            role: 'user',
            content: `Motivo informado pelo vendedor: "${consultantReason}"
Score de proatividade do vendedor (calculado por algoritmo, 0-100): ${responseScore}

Histórico:
${transcript}

Responda:
{
  "attribution": "client_disengaged" | "consultant_abandoned" | "external_factor",
  "reason": "1 frase explicando a decisão (ex: 'Cliente disse que comprou em outra loja' ou 'Vendedor não respondeu última msg do cliente há 3 dias')"
}`,
        }],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 200,
    });

    const parsed = JSON.parse(res.choices[0]?.message?.content || '{}');
    const valid: Attribution[] = ['client_disengaged', 'consultant_abandoned', 'external_factor'];
    const attribution = valid.includes(parsed.attribution) ? parsed.attribution : 'external_factor';
    const reason = (parsed.reason || '').toString().slice(0, 280);
    return { attribution, reason };
}

/**
 * Pipeline completo de atribuição de perda.
 * Chamado fire-and-forget pelo /api/lead/finish quando finish_type === 'perda'.
 */
export async function analyzeLossAttribution(
    leadId: string,
    phone: string,
    consultantReason: string
): Promise<AnalysisResult> {
    const admin = createClient();
    const messages = await fetchLeadMessages(admin, phone);

    let result: AnalysisResult;

    if (messages.length < MIN_MESSAGES_FOR_ANALYSIS) {
        result = {
            loss_attribution: 'no_history',
            loss_attribution_reason: 'Sem mensagens WhatsApp suficientes para análise.',
            consultant_response_score: 50,
        };
    } else {
        const responseScore = computeResponseScore(messages);
        const ai = await classifyAttributionWithAI(messages, consultantReason, responseScore);
        result = {
            loss_attribution: ai.attribution,
            loss_attribution_reason: ai.reason,
            consultant_response_score: responseScore,
        };
    }

    await admin
        .from('leads_manos_crm')
        .update({
            loss_attribution: result.loss_attribution,
            loss_attribution_reason: result.loss_attribution_reason,
            consultant_response_score: result.consultant_response_score,
            loss_analyzed_at: new Date().toISOString(),
        })
        .eq('id', leadId);

    return result;
}
