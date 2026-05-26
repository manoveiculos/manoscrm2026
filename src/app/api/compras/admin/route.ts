import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

const supabaseAdmin = createClient();
const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'manos_intel_secret_key';

function isAuthorized(request: Request) {
  const authHeader = request.headers.get('Authorization');
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('admin_key') || (authHeader ? authHeader.replace('Bearer ', '') : null);
  return token === ADMIN_SECRET_KEY;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action'); // 'stats' ou 'repasses'

  if (action === 'repasses') {
    const limit = Math.min(Number(searchParams.get('limit') || 50), 100);
    const page = Math.max(Number(searchParams.get('page') || 1), 1);
    const query = searchParams.get('query') || '';
    
    const fromOffset = (page - 1) * limit;
    const toOffset = fromOffset + limit - 1;

    try {
      let selectBuilder = supabaseAdmin
        .from('repassecentral')
        .select('*', { count: 'exact' });

      if (query) {
        selectBuilder = selectBuilder.or(`marca.ilike.%${query}%,modelo.ilike.%${query}%,nome_anunciante.ilike.%${query}%`);
      }

      const { data: repasses, count, error } = await selectBuilder
        .order('data_hora_recebimento', { ascending: false })
        .range(fromOffset, toOffset);

      if (error) throw error;

      return NextResponse.json({
        success: true,
        repasses: repasses || [],
        total: count || 0,
        page,
        limit
      });
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
  } else {
    // Default: estatísticas de tabelas
    const tables = [
      { key: 'repassecentral', name: 'Oportunidades (repassecentral)' },
      { key: 'tracking_leads', name: 'Leads de Rastreamento (tracking_leads)' },
      { key: 'leads_master', name: 'Leads Master' },
      { key: 'leads_distribuicao', name: 'Leads de Distribuição' },
      { key: 'leads_compra', name: 'Leads de Compra' },
      { key: 'raw_messages', name: 'Mensagens Brutas (raw_messages)' },
      { key: 'offers', name: 'Ofertas Classificadas (offers)' },
      { key: 'fipe_cache', name: 'Cache FIPE' }
    ];

    try {
      const stats = await Promise.all(
        tables.map(async (t) => {
          try {
            const { count, error } = await supabaseAdmin
              .from(t.key)
              .select('*', { count: 'exact', head: true });

            if (error) {
              return { key: t.key, name: t.name, count: 0, active: false, error: error.message };
            }
            return { key: t.key, name: t.name, count: count || 0, active: true };
          } catch (err: any) {
            return { key: t.key, name: t.name, count: 0, active: false, error: err.message };
          }
        })
      );
      return NextResponse.json({ success: true, stats });
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
  }
}

export async function DELETE(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action'); // 'repasse' ou 'database'

  if (action === 'repasse') {
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'ID é obrigatório para exclusão.' }, { status: 400 });
    }
    try {
      const { error } = await supabaseAdmin.from('repassecentral').delete().eq('id', id);
      if (error) throw error;
      return NextResponse.json({ success: true, message: `Registro ${id} excluído.` });
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
  } else if (action === 'database') {
    const tableName = searchParams.get('table');
    if (!tableName) {
      return NextResponse.json({ success: false, error: 'Parâmetro "table" é obrigatório.' }, { status: 400 });
    }
    const allowedTables = [
      'repassecentral',
      'tracking_leads',
      'leads_master',
      'leads_distribuicao',
      'leads_compra',
      'raw_messages',
      'offers',
      'fipe_cache'
    ];
    if (!allowedTables.includes(tableName)) {
      return NextResponse.json({ success: false, error: 'Exclusão não permitida.' }, { status: 403 });
    }
    try {
      const { error, count } = await supabaseAdmin.from(tableName).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
      return NextResponse.json({ success: true, message: `Tabela ${tableName} limpa.`, deletedRows: count });
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
  } else {
    return NextResponse.json({ success: false, error: 'Ação inválida.' }, { status: 400 });
  }
}
