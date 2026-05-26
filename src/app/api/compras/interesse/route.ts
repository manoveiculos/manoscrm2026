import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

const supabaseAdmin = createClient();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      nome_cliente, 
      telefone_cliente, 
      cidade_cliente,
      veiculo,
      grupo_anuncio,
      data_anuncio,
      cidade_anuncio,
      oportunidade_id
    } = body;

    if (!nome_cliente || !telefone_cliente || !cidade_cliente) {
      return NextResponse.json(
        { success: false, error: 'Por favor, preencha todos os campos obrigatórios.' },
        { status: 400 }
      );
    }

    // Tenta obter a fonte de dados real do banco a partir do ID da oportunidade
    let realGroupName = grupo_anuncio || 'Grupo de Repasse';
    if (oportunidade_id) {
      try {
        const { data: offerData } = await supabaseAdmin
          .from('offers')
          .select(`
            sources:source_id ( name )
          `)
          .eq('id', oportunidade_id)
          .single();

        if (offerData && offerData.sources) {
          realGroupName = (offerData.sources as any).name;
        }
      } catch (dbErr: any) {
        console.warn('[Webhook] Erro ao recuperar fonte real do banco para interesse:', dbErr.message);
      }
    }

    // Webhook destino
    const webhookUrl = 'https://n8n.drivvoo.com/webhook/d0d8da9b-707a-4a99-930a-ef2ce0479e03';

    // Monta o payload de envio para o n8n
    const payload = {
      veiculo_interesse: veiculo,
      grupo_anuncio: realGroupName,
      data_anuncio: data_anuncio || new Date().toISOString(),
      cidade_anuncio: cidade_anuncio || 'Não informada',
      telefone_interessado: telefone_cliente,
      nome_interessado: nome_cliente,
      cidade_interessado: cidade_cliente
    };

    console.log('[Webhook] Enviando payload para o n8n:', payload);

    // Faz a chamada externa servidor-servidor (livre de CORS)
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[Webhook WARNING] Webhook respondeu com erro ${response.status}. Certifique-se de ativar o workflow no n8n. Detalhes:`, errorText);
    } else {
      console.log('[Webhook] Enviado com sucesso para o n8n!');
    }

    return NextResponse.json({
      success: true,
      message: 'Interesse registrado com sucesso!'
    });

  } catch (err: any) {
    console.error('[API Interesse] Erro no webhook:', err.message);
    return NextResponse.json(
      { success: false, error: 'Ocorreu um erro ao registrar seu interesse. Tente novamente.' },
      { status: 500 }
    );
  }
}
