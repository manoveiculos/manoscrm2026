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
        const rawPhone = leadData.phone || leadData.telefone || leadData.whatsapp;
        const normalizedPhone = rawPhone ? normalizePhone(rawPhone) : "";
        const hashedPhone = normalizedPhone ? hashData(normalizedPhone) : null;
        const hashedEmail = leadData.email ? hashData(leadData.email) : null;

        const payload = {
            data: [
                {
                    event_name: eventName,
                    event_time: Math.floor(Date.now() / 1000),
                    action_source: "system_generated",
                    user_data: {
                        ph: hashedPhone ? [hashedPhone] : undefined,
                        em: hashedEmail ? [hashedEmail] : undefined,
                        lead_id: leadData.lead_id ? Number(leadData.lead_id) || leadData.lead_id : undefined,
                        external_id: leadData.id ? [hashData(String(leadData.id))] : undefined
                    },
                    custom_data: {
                        event_source: "crm",
                        lead_event_source: extraCustomData?.lead_event_source || "Manos CRM",
                        vehicle_interest: leadData.vehicle_interest || leadData.interesse,
                        source: leadData.source || leadData.origem,
                        ...extraCustomData
                    }
                }
            ]
        };

        const response = await fetch(`https://graph.facebook.com/v25.0/${pixelId}/events`, {
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
            console.log(`✅ Evento [${eventName}] enviado para Meta | Lead: ${leadData.name || leadData.nome || 'N/A'}`);
        }

        return result;
    } catch (error) {
        console.error(`❌ Falha ao disparar evento para Meta [${eventName}]:`, error);
    }
}
