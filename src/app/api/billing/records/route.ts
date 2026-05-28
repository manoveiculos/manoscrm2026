import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { initQueueProcessor } from '@/lib/billing-queue';

export async function GET() {
  // Gracefully initialize queue ticks on the first API call
  initQueueProcessor();
  
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('v_billing_controle')
    .select('*')
    .order('vencimento', { ascending: true });

  if (error) {
    console.error('[Supabase API Error] Fetch billing records failed:', error.message);
    return NextResponse.json([]);
  }

  // Mapeia os campos da view de volta para as propriedades camelCase esperadas pelo front-end
  const mappedData = (data || []).map((item: any) => ({
    ...item,
    clienteFornecedor: item.cliente,
    cpfCnpj: item.cpf_cnpj,
    dataPagamento: item.data_pagamento
  }));

  return NextResponse.json(mappedData);
}

export async function POST(req: Request) {
  try {
    const record = await req.json();
    if (!record.id) {
      record.id = `rec-${crypto.randomUUID()}`;
    }

    // Sanitizar campos computados da view para persistência na tabela records_cobrancamanos26
    const {
      dias_atraso,
      faixa_atraso,
      acordos_ativos,
      juridico_envios,
      ultima_msg_whatsapp,
      ai_classification,
      risk_score,
      vendedor_nome,
      cliente,
      cpf_cnpj,
      data_pagamento,
      ...cleanRecord
    } = record;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('records_cobrancamanos26')
      .upsert(cleanRecord)
      .select();

    if (error) {
      console.error('[Supabase API Error] Upsert record failed:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, record: data ? data[0] : record });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
