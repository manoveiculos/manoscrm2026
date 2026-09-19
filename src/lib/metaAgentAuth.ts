import { NextRequest, NextResponse } from 'next/server';

/**
 * Valida a autenticação do Meta Business Agent Connector.
 * O Meta Business Agent envia o token via Header: Authorization: Bearer <TOKEN>
 */
export function validateMetaAgentAuth(req: NextRequest): { valid: boolean; response?: NextResponse } {
    const expectedToken = process.env.META_AGENT_CONNECTOR_TOKEN || 'manos_meta_agent_sec_2026';
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');

    if (!authHeader) {
        return {
            valid: false,
            response: NextResponse.json({ error: 'Cabeçalho Authorization de autenticação ausente' }, { status: 401 })
        };
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (token !== expectedToken) {
        return {
            valid: false,
            response: NextResponse.json({ error: 'Token de acesso do Meta Business Agent inválido' }, { status: 403 })
        };
    }

    return { valid: true };
}
