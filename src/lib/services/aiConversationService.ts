import { OpenAI } from 'openai';
import { supabase, supabaseAdmin } from '@/lib/supabase';

function getOpenAIClient(): OpenAI | null {
    const apiKey = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    if (!apiKey) return null;
    return new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
}

export interface ConversationSummaryResult {
    summary: string;
    messageCount: number;
    mediaCount: number;
    hasTradeIn: boolean;
    hasCredit: boolean;
    lastMessageTime?: string;
    messages: Array<{
        id: string;
        direction: 'inbound' | 'outbound';
        text: string;
        timestamp: string;
        sender_name?: string;
        has_media?: boolean;
    }>;
}

/**
 * SERVIÇO DE ANÁLISE DE CONVERSAS DO WHATSAPP (SKILL IA)
 * Busca o histórico real de mensagens do lead e gera um resumo estratégico sucinto.
 */
export async function summarizeLeadConversation(params: {
    leadId: string;
    phone?: string;
    leadName?: string;
    vehicleInterest?: string;
}): Promise<ConversationSummaryResult> {
    if (typeof window !== 'undefined') {
        try {
            const res = await fetch('/api/v2/resumo-ia', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });
            const data = await res.json();
            if (data.success && data.data) {
                return data.data;
            }
        } catch (e) {
            console.warn('[aiConversationService] Delegando para rota API /api/v2/resumo-ia:', e);
        }
    }

    const client = supabaseAdmin || supabase;
    const { leadId, phone, leadName, vehicleInterest } = params;

    const cleanPhone = phone ? phone.replace(/\D/g, '') : '';
    const phoneVariants = cleanPhone
        ? [`55${cleanPhone}`, cleanPhone, cleanPhone.slice(-8)]
        : [];

    let rawMessages: any[] = [];

    try {
        // 1. Busca por lead_id ou por telefone em whatsapp_messages
        let query = client.from('whatsapp_messages').select('*');
        if (/^\d+$/.test(leadId.replace(/\D/g, ''))) {
            const numId = parseInt(leadId.replace(/\D/g, ''));
            query = query.or(`lead_id.eq.${numId},sender_phone.in.(${phoneVariants.join(',')}),receiver_phone.in.(${phoneVariants.join(',')})`);
        } else if (phoneVariants.length > 0) {
            query = query.or(`sender_phone.in.(${phoneVariants.join(',')}),receiver_phone.in.(${phoneVariants.join(',')})`);
        }

        const { data, error } = await query.order('created_at', { ascending: true }).limit(30);

        if (!error && data) {
            rawMessages = data;
        }
    } catch (err) {
        console.warn('[aiConversationService] Erro ao buscar whatsapp_messages:', err);
    }

    // Fallback: se whatsapp_messages estiver vazio, busca de interactions_manos_crm
    if (rawMessages.length === 0 && leadId) {
        try {
            const cleanUuid = leadId.replace(/^(main_|crm26_|master_|lead_)/, '');
            const { data: interactions } = await client
                .from('interactions_manos_crm')
                .select('*')
                .eq('lead_id', cleanUuid)
                .order('created_at', { ascending: true })
                .limit(20);

            if (interactions) {
                rawMessages = interactions.map((i: any) => ({
                    id: i.id,
                    direction: i.type === 'whatsapp_out' ? 'outbound' : 'inbound',
                    message_text: i.notes || '',
                    created_at: i.created_at,
                    sender_name: i.user_name || (i.type === 'whatsapp_out' ? 'Vendedor' : 'Cliente')
                }));
            }
        } catch (err) {
            console.warn('[aiConversationService] Erro ao buscar interactions_manos_crm:', err);
        }
    }

    const messages = rawMessages.map((m: any) => ({
        id: String(m.id || Math.random()),
        direction: (m.direction === 'inbound' || m.type === 'whatsapp_in' ? 'inbound' : 'outbound') as 'inbound' | 'outbound',
        text: m.message_text || m.text || m.body || m.notes || '',
        timestamp: m.created_at || m.timestamp || new Date().toISOString(),
        sender_name: m.sender_name || (m.direction === 'inbound' ? (leadName || 'Cliente') : 'Vendedor'),
        has_media: !!(m.media_url || m.has_media || /audio|foto|imagem|documento|pdf/i.test(m.message_text || ''))
    }));

    const messageCount = messages.length;
    const mediaCount = messages.filter(m => m.has_media).length;
    const lastMessageTime = messages.length > 0 ? messages[messages.length - 1].timestamp : undefined;

    const allText = messages.map(m => m.text).join(' ');
    const hasTradeIn = /troca|avaliar|usado|oferece|carro/i.test(allText);
    const hasCredit = /financ|crédit|parcela|score|aprova|cpf/i.test(allText);

    // 2. Se não houver mensagens gravadas, gera um resumo heurístico baseado na intenção
    if (messages.length === 0) {
        const veh = vehicleInterest ? `interesse em ${vehicleInterest}` : 'interesse no estoque';
        const fallbackSummary = `Lead cadastrado com ${veh}. Sem histórico recente de mensagens salvas. Aguardando retorno inicial do vendedor.`;
        return {
            summary: fallbackSummary,
            messageCount: 0,
            mediaCount: 0,
            hasTradeIn,
            hasCredit,
            messages: []
        };
    }

    // 3. Formata histórico para o prompt GPT
    const historyText = messages
        .map(m => `[${m.direction === 'inbound' ? 'CLIENTE' : 'VENDEDOR'}]: ${m.text}`)
        .join('\n');

    const openai = getOpenAIClient();

    if (!openai) {
        const lastMsg = messages[messages.length - 1];
        const lastSender = lastMsg ? (lastMsg.direction === 'inbound' ? 'cliente' : 'vendedor') : 'cliente';
        const lastSnippet = lastMsg ? `"${lastMsg.text.slice(0, 100)}..."` : 'Mensagens registradas';
        return {
            summary: `Último contato do ${lastSender}: ${lastSnippet}. Aguardando acompanhamento do vendedor.`,
            messageCount,
            mediaCount,
            hasTradeIn,
            hasCredit,
            lastMessageTime,
            messages
        };
    }

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `Você é um Assistente Gerencial de CRM de Concessionária.
Sua função é ler o histórico de conversas do WhatsApp com o lead e gerar um RESUMO TÁTICO E CURTO (máximo de 2 ou 3 frases, limite de 220 caracteres).
O resumo deve dizer:
1) O objetivo principal do cliente (veículo de interesse, valor, simulação de entrada).
2) Se ele mandou áudio/documentos/fotos ou quer dar carro na troca.
3) Qual o status atual da conversa e por que ele precisa de cobrança/retorno do vendedor.
NÃO use aspas, não faça saudações, vá direto ao ponto.`
                },
                {
                    role: 'user',
                    content: `Lead: ${leadName || 'Cliente'}\nVeículo de Interesse: ${vehicleInterest || 'Não informado'}\n\nHISTÓRICO DE MENSAGENS:\n${historyText}`
                }
            ],
            temperature: 0.3,
            max_tokens: 150
        });

        const summary = (response.choices[0]?.message?.content || '').trim();

        return {
            summary: summary || `Conversa com ${messageCount} mensagens. Último contato do ${messages[messages.length - 1]?.direction === 'inbound' ? 'cliente' : 'vendedor'}.`,
            messageCount,
            mediaCount,
            hasTradeIn,
            hasCredit,
            lastMessageTime,
            messages
        };
    } catch (err: any) {
        console.warn('[aiConversationService] Falha ao chamar OpenAI para resumo:', err?.message || err);
        return {
            summary: `Conversa com ${messageCount} mensagens salvas. Cliente interessado em ${vehicleInterest || 'veículo'}.`,
            messageCount,
            mediaCount,
            hasTradeIn,
            hasCredit,
            lastMessageTime,
            messages
        };
    }
}
