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
 * Prepara o payload para o evento de Lead da Meta Conversions API.
 */
export function prepareMetaLeadPayload(phone: string) {
    const normalizedPhone = normalizePhone(phone);
    const hashedPhone = hashData(normalizedPhone);

    return {
        data: [
            {
                event_name: "Lead",
                event_time: Math.floor(Date.now() / 1000),
                action_source: "system_generated",
                user_data: {
                    ph: hashedPhone
                }
            }
        ]
    };
}
