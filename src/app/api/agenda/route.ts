import { NextResponse } from 'next/server';
import { requireVendedor, supabaseAdmin, startOfTodayBRT } from './_guard';
import { postAgendaWebhook } from '@/lib/agendaWebhook';

export const dynamic = 'force-dynamic';

const CAMPOS = ['lead_uid', 'cliente_nome', 'cliente_telefone', 'cliente_whatsapp', 'veiculo_interesse', 'tipo', 'endereco', 'data_hora', 'observacoes'];

// GET /api/agenda?scope=me|all — lista visitas de hoje em diante
export async function GET(request: Request) {
    const g = await requireVendedor();
    if (!g.ok) return g.res;
    const scope = new URL(request.url).searchParams.get('scope') || 'me';

    let q = supabaseAdmin.from('agendamentos').select('*')
        .neq('status', 'cancelado')
        .gte('data_hora', startOfTodayBRT())
        .order('data_hora', { ascending: true });
    if (!(g.isAdmin && scope === 'all')) q = q.eq('vendedor_id', g.authId);

    const { data, error } = await q;
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    // Resolve o nome do vendedor (útil na visão da gerência)
    const ids = [...new Set((data || []).map((a) => a.vendedor_id))];
    const nameById = new Map<string, string>();
    if (ids.length) {
        const { data: cons } = await supabaseAdmin.from('consultants_manos_crm').select('auth_id, name').in('auth_id', ids);
        for (const c of cons || []) nameById.set(c.auth_id, c.name);
    }

    return NextResponse.json({
        success: true,
        isAdmin: g.isAdmin,
        agendamentos: (data || []).map((a) => ({ ...a, vendedor_nome: (nameById.get(a.vendedor_id) || 'Vendedor').split(' ')[0] })),
    });
}

// POST /api/agenda — cria uma visita
export async function POST(request: Request) {
    const g = await requireVendedor();
    if (!g.ok) return g.res;
    const b = await request.json();

    if (!b.cliente_nome || !String(b.cliente_nome).trim()) return NextResponse.json({ success: false, error: 'Nome do cliente é obrigatório' }, { status: 400 });
    if (!['loja', 'externa'].includes(b.tipo)) return NextResponse.json({ success: false, error: 'Tipo inválido' }, { status: 400 });
    if (b.tipo === 'externa' && !String(b.endereco || '').trim()) return NextResponse.json({ success: false, error: 'Endereço é obrigatório para visita externa' }, { status: 400 });
    if (!b.data_hora) return NextResponse.json({ success: false, error: 'Data e hora são obrigatórias' }, { status: 400 });
    if (new Date(b.data_hora).getTime() < Date.now() - 120_000) return NextResponse.json({ success: false, error: 'Não dá pra agendar no passado' }, { status: 400 });

    const row: Record<string, any> = { vendedor_id: g.authId, status: 'agendado' };
    for (const k of CAMPOS) if (b[k] !== undefined && b[k] !== '') row[k] = b[k];

    const { data, error } = await supabaseAdmin.from('agendamentos').insert(row).select('*').single();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    // Confirma a criação no webhook n8n (best-effort: falha não bloqueia o agendamento)
    postAgendaWebhook(data, { evento: 'agendamento_criado', tipo_lembrete: 'criacao' })
        .catch((e) => console.warn('[agenda] webhook criação falhou:', e?.message));

    return NextResponse.json({ success: true, id: data.id });
}
