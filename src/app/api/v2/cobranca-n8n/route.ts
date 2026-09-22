import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const webhookUrl = 'https://n8n.drivvoo.com/webhook/c7ea306f-b1dc-462c-971b-fd084c45c58f';

        const payload = {
            event: 'cobranca_vendedor_24h',
            lead_id: body.lead_id,
            lead_name: body.lead_name,
            lead_phone: body.lead_phone,
            vendedor_id: body.vendedor_id,
            vendedor_nome: body.vendedor_nome,
            vendedor_telefone: body.vendedor_telefone,
            veiculo_interesse: body.veiculo_interesse || 'Não informado',
            resumo_ia: body.resumo_ia,
            score: body.score,
            created_at: body.created_at,
            last_interaction_at: body.last_interaction_at,
            mensagem_cobranca: body.mensagem_cobranca,
            disparado_em: new Date().toISOString()
        };

        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'ManosCRM-Priority48h/2.0'
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errorText = await res.text().catch(() => '');
            return NextResponse.json(
                { success: false, error: `Webhook n8n retornou código ${res.status}: ${errorText}` },
                { status: res.status }
            );
        }

        return NextResponse.json({
            success: true,
            message: `Cobrança do lead ${body.lead_name} enviada com sucesso para o n8n!`,
            payload
        });
    } catch (err: any) {
        console.error('Erro na rota de cobrança n8n:', err);
        return NextResponse.json(
            { success: false, error: err.message || 'Erro ao disparar webhook para n8n' },
            { status: 500 }
        );
    }
}
