import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  try {
    const { records } = await req.json();
    if (!Array.isArray(records)) {
      return NextResponse.json({ success: false, error: 'Formato inválido. Esperado array.' }, { status: 400 });
    }

    const supabase = createAdminClient();
    
    // Fetch current database records to check and skip duplicates
    const { data: currentRecords, error: fetchError } = await supabase
      .from('records_cobrancamanos26')
      .select('id, cpfCnpj, vencimento, veiculo');

    if (fetchError) {
      console.error('[Supabase API Error] Fetch existing records failed:', fetchError.message);
      return NextResponse.json({ 
        success: false, 
        error: `A tabela 'records_cobrancamanos26' não foi encontrada. Verifique se a migration SQL foi aplicada.` 
      }, { status: 500 });
    }

    const currentList = currentRecords || [];

    const parsedInserts = records.map((rec: any, idx: number) => {
      const id = rec.id || `csv-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`;
      return {
        id,
        clienteFornecedor: rec.clienteFornecedor || 'Consumidor Final',
        cpfCnpj: rec.cpfCnpj || '000.000.000-00',
        telefone: rec.telefone || 'Sem Telefone',
        veiculo: rec.veiculo || 'Nenhum veículo cadastrado',
        vencimento: rec.vencimento,
        valor: Number(rec.valor) || 0,
        status: rec.status || 'PENDENTE',
        dataPagamento: rec.dataPagamento || null,
        observacoes: rec.observacoes || 'Importado por planilha CSV.'
      };
    });

    // Skip duplicates
    const uniqueInserts = parsedInserts.filter(newItem => {
      return !currentList.some(exist => 
        exist.cpfCnpj === newItem.cpfCnpj && 
        exist.vencimento === newItem.vencimento &&
        exist.veiculo === newItem.veiculo
      );
    });

    if (uniqueInserts.length > 0) {
      const { error: upsertError } = await supabase.from('records_cobrancamanos26').upsert(uniqueInserts);
      if (upsertError) {
        console.error('[Supabase API Error] CSV batch upsert failed:', upsertError.message);
        return NextResponse.json({ success: false, error: upsertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ 
      success: true, 
      importedCount: uniqueInserts.length, 
      skippedCount: parsedInserts.length - uniqueInserts.length 
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 550 });
  }
}
