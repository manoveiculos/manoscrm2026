import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionToken } from '@/lib/extensionAuth';

export async function GET(req: NextRequest) {
    const authError = verifyExtensionToken(req);
    if (authError) return authError;

    // Scripts baseados no CRM V2 (src/app/v2/components/lead-profile/utils.ts)
    const scripts = [
        {
            id: 's1',
            title: '🤝 Saudação Tática',
            content: 'Olá! Aqui é o consultor da Manos Multimarcas. Vi que você se interessou no nosso estoque. Como posso acelerar sua conquista hoje?'
        },
        {
            id: 's2',
            title: '🎥 Vídeo do Arsenal',
            content: 'Tudo bem? Acabei de preparar um vídeo exclusivo do veículo pra você. Posso te enviar por aqui?'
        },
        {
            id: 's3',
            title: '💰 Qualificação Financeira',
            content: 'Para eu te passar a melhor condição, você pretende fazer uma entrada ou usar seu usado na troca?'
        },
        {
            id: 's4',
            title: '🏎️ Agendamento de Teste',
            content: 'O veículo está higienizado e pronto aqui no pátio. Consegue passar aqui hoje ou prefere amanhã cedo?'
        },
        {
            id: 's5',
            title: '🎯 Reengate Estratégico',
            content: 'Oi, ainda estou com o veículo reservado pra você. Surgiu uma condição de taxa nova aqui, quer que eu simule?'
        },
        {
            id: 's6',
            title: '📉 Baixa de Preço',
            content: 'Notícia boa! O veículo que você gostou acabou de entrar em oferta. Consegue falar agora?'
        }
    ];

    return NextResponse.json({ success: true, scripts });
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': 'https://web.whatsapp.com',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Credentials': 'true',
        },
    });
}
