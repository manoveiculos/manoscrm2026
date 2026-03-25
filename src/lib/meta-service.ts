import { createHash } from 'crypto';

/**
 * Normaliza o telefone para o formato exigido pela Meta:
 * 1. Remove tudo que não for número.
 * 2. Garante o prefixo DDI 55 (Brasil).
 */
export function normalizePhone(phone: string): string {
    if (!phone) return "";

    // Remove tudo que não for número
    let digits = phone.replace(/\D/g, '');

    // Se começar com 55 e tiver mais de 10 dígitos, assume que já tem DDI
    // Se não tiver 55, adiciona
    if (!digits.startsWith('55') || digits.length < 12) {
        // Se começar com 0, remove o zero (comum em alguns formatos)
        if (digits.startsWith('0')) digits = digits.substring(1);
        digits = '55' + digits;
    }

    return digits;
}

/**
 * Gera hash SHA256 em minúsculo conforme exigência da Meta.
 */
export function hashData(data: string): string {
    if (!data) return "";
    return createHash('sha256').update(data.toLowerCase().trim()).digest('hex');
}

/**
 * Envia um evento de conversão para a Meta (Conversions API).
 * @param leadData Dados do lead (nome, telefone, email, lead_id, etc)
 * @param eventName Nome do evento (ex: 'Lead', 'Contact', 'Purchase')
 */
export async function sendMetaConversion(leadData: any, eventName: string = 'Lead', extraCustomData?: Record<string, any>) {
    const pixelId = process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID;
    const accessToken = process.env.META_ACCESS_TOKEN || process.env.NEXT_PUBLIC_META_ACCESS_TOKEN;

    if (!pixelId || !accessToken) {
        console.error('❌ Erro Meta: META_PIXEL_ID ou META_ACCESS_TOKEN não configurados no .env.local');
        return;
    }

    try {
        const normalizedPhone = normalizePhone(leadData.phone || leadData.telefone);
        const hashedPhone = hashData(normalizedPhone);
        const hashedEmail = leadData.email ? hashData(leadData.email) : undefined;

        const payload = {
            data: [
                {
                    event_name: eventName,
                    event_time: Math.floor(Date.now() / 1000),
                    action_source: "system_generated",
                    user_data: {
                        ph: [hashedPhone],
                        em: hashedEmail ? [hashedEmail] : undefined,
                        external_id: leadData.lead_id || leadData.id_meta || undefined,
                        // O Facebook também aceita lead_id diretamente se vier de um formulário
                        lead_id: leadData.lead_id || undefined
                    },
                    custom_data: {
                        vehicle_interest: leadData.vehicle_interest || leadData.interesse,
                        source: leadData.source || leadData.origem,
                        ...extraCustomData
                    }
                }
            ]
        };

        const response = await fetch(`https://graph.facebook.com/v19.0/${pixelId}/events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.error) {
            console.error(`❌ Erro Meta Conversions API [${eventName}]:`, result.error.message);
        } else {
            console.log(`✅ Evento [${eventName}] enviado para Meta | Lead ID: ${leadData.lead_id || 'N/A'}`);
        }

        return result;
    } catch (error) {
        console.error(`❌ Falha ao disparar evento para Meta [${eventName}]:`, error);
    }
}
