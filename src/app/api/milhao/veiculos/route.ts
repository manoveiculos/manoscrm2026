import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient();

const CAMPOS = [
    'estoque_id_externo', 'marca', 'modelo', 'versao', 'ano', 'placa', 'km', 'cor',
    'valor_compra', 'custos_reconto', 'valor_fipe', 'valor_anuncio', 'valor_venda',
    'data_compra', 'data_venda', 'status', 'consultor', 'obs',
];

// Colunas NOT NULL (com DEFAULT no banco): nunca gravar null — omitir deixa o DEFAULT valer
const NOT_NULL_COLS = new Set(['marca', 'modelo', 'valor_compra', 'custos_reconto', 'data_compra', 'status']);

function sanitize(body: any) {
    const row: Record<string, any> = {};
    for (const k of CAMPOS) {
        if (body[k] === undefined) continue;
        const v = body[k];
        if (v === '' || v === null) {
            if (NOT_NULL_COLS.has(k)) continue; // deixa o DEFAULT do banco (0 / hoje / 'estoque')
            row[k] = null;                       // colunas nuláveis podem ser limpas
        } else {
            row[k] = v;
        }
    }
    return row;
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        if (!body.marca || !body.modelo) {
            return NextResponse.json({ success: false, error: 'Marca e modelo são obrigatórios.' }, { status: 400 });
        }
        const row = sanitize(body);
        // Se marcou como vendido sem data, assume hoje
        if (row.status === 'vendido' && !row.data_venda) {
            row.data_venda = new Date().toISOString().slice(0, 10);
        }
        const { data, error } = await supabaseAdmin
            .from('milhao_veiculos')
            .insert(row)
            .select()
            .single();
        if (error) throw error;
        return NextResponse.json({ success: true, veiculo: data });
    } catch (err: any) {
        console.error('[API Milhão veículos POST] erro:', err?.message);
        return NextResponse.json({ success: false, error: err?.message || 'erro' }, { status: 500 });
    }
}
