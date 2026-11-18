import { NextResponse } from 'next/server';
import { consultorLogado } from '@/lib/fila/servidor';
import { gravarEspera } from '@/lib/whatsapp/ia/espera';
import { telefoneKey } from '@/lib/whatsapp/evolutionParser';
import { rankingDeDemanda, type PedidoLinha } from '@/lib/espera/ranking';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const headers = { 'Cache-Control': 'no-store' };
const erro = (status: number, error: string) => NextResponse.json({ success: false, error }, { status, headers });
const COLUNAS = 'id, telefone_key, lead_uid, consultor_id, nome_cliente, texto_original, chave, ano_min, preco_max, cambio, origem, status, criado_em, expira_em, avisado_em';

/**
 * GET /api/espera — lista de espera de carros ("Procurando carro").
 *  vendedor: só os pedidos dos clientes dele; gestor/admin: todos (?scope=me mostra só os seus).
 *  gestor/admin também recebem o ranking de demanda (o que mais falta no estoque).
 */
export async function GET(request: Request) {
    const ctx = await consultorLogado();
    if (!ctx.ok) return ctx.res;
    const { admin, eu } = ctx;
    const veTudo = eu.perfil !== 'vendedor' && new URL(request.url).searchParams.get('scope') !== 'me';
    if (!veTudo && !eu.consultorId) return NextResponse.json({ success: true, perfil: eu.perfil, pedidos: [], ranking: [] }, { headers });

    const desde = new Date(Date.now() - 30 * 86_400_000).toISOString();
    let q = admin.from('carro_espera').select(COLUNAS).in('status', ['aguardando', 'avisado']).gte('criado_em', desde)
        .order('criado_em', { ascending: false }).limit(500);
    if (!veTudo) q = q.eq('consultor_id', eu.consultorId!);
    const { data, error } = await q;
    if (error) return erro(500, error.message);
    const pedidos = data || [];
    return NextResponse.json({
        success: true, perfil: eu.perfil, veTudo, pedidos,
        ranking: veTudo ? rankingDeDemanda(pedidos as PedidoLinha[]).slice(0, 20) : [],
    }, { headers });
}

/** POST /api/espera — o consultor cadastra um pedido na mão: { telefone, nome?, carro, preco_max?, ano_min? } */
export async function POST(request: Request) {
    const ctx = await consultorLogado();
    if (!ctx.ok) return ctx.res;
    const { admin, eu } = ctx;
    const b = await request.json().catch(() => ({})) as Record<string, unknown>;
    const tel = telefoneKey(typeof b.telefone === 'string' ? b.telefone : '');
    const carro = typeof b.carro === 'string' ? b.carro.trim() : '';
    if (!tel) return erro(400, 'telefone inválido');
    if (carro.length < 3) return erro(400, 'diga qual carro o cliente quer');
    const preco = Number(b.preco_max), ano = Number(b.ano_min);
    const r = await gravarEspera(admin, {
        telefoneKey: tel, leadUid: null, conversaId: null, consultorId: eu.consultorId,
        nomeCliente: typeof b.nome === 'string' && b.nome.trim() ? b.nome.trim().slice(0, 80) : null, origem: 'consultor',
    }, { texto: carro, marca: null, modelo: null, carroceria: null, anoMin: ano > 1950 ? ano : null, precoMax: preco > 0 ? preco : null, cambio: null });
    if (!r.ok) return erro(500, r.erro || 'falha ao gravar');
    return NextResponse.json({ success: true, acao: r.acao }, { headers });
}

/** PATCH /api/espera — { id, status: 'atendido' | 'cancelado' }. Vendedor só mexe nos dele. */
export async function PATCH(request: Request) {
    const ctx = await consultorLogado();
    if (!ctx.ok) return ctx.res;
    const { admin, eu } = ctx;
    const b = await request.json().catch(() => ({})) as Record<string, unknown>;
    const id = typeof b.id === 'string' ? b.id : '';
    if (!id || (b.status !== 'atendido' && b.status !== 'cancelado')) return erro(400, 'id e status (atendido ou cancelado) são obrigatórios');
    let q = admin.from('carro_espera').update({ status: b.status, atualizado_em: new Date().toISOString() }).eq('id', id);
    if (eu.perfil === 'vendedor') q = q.eq('consultor_id', eu.consultorId ?? '00000000-0000-0000-0000-000000000000');
    const { data, error } = await q.select('id');
    if (error) return erro(500, error.message);
    if (!data?.length) return erro(404, 'pedido não encontrado');
    return NextResponse.json({ success: true }, { headers });
}
