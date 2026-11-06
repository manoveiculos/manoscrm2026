import { NextRequest, NextResponse } from 'next/server';
import { consultorLogado, leadDoConsultor, COLUNAS_LEAD } from '@/lib/fila/servidor';

export const dynamic = 'force-dynamic';

/**
 * POST /api/fila/contato — o vendedor tocou em "Ligar" na Minha Fila.
 *
 * Registra o toque como contato humano (ultima_interacao_humana + nota na
 * timeline), para o lead não continuar como "sem resposta". NÃO grava
 * first_contact_at: tocar em ligar não prova que a ligação aconteceu, e esse
 * campo alimenta o painel de conversão (Fase 7 decide como medir).
 *
 * Body: { uid: "tabela:id" }
 */
export async function POST(req: NextRequest) {
    const ctx = await consultorLogado();
    if (!ctx.ok) return ctx.res;
    const { admin, eu } = ctx;

    let body: any;
    try { body = await req.json(); } catch { body = null; }
    const r = await leadDoConsultor(admin, eu, body?.uid, 'status');
    if (!r.ok) return r.res;

    const agora = new Date().toISOString();
    const { error } = await admin
        .from(r.table)
        .update({ ultima_interacao_humana: agora, [COLUNAS_LEAD[r.table].atualizado]: agora })
        .eq('id', r.id);
    if (error) {
        console.error('[fila/contato] update:', error.message);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const isUUID = typeof r.id === 'string';
    const { error: tlErr } = await admin.from('interactions_manos_crm').insert({
        [isUUID ? 'lead_id' : 'lead_id_v1']: String(r.id),
        type: 'ligacao',
        notes: `📞 ${eu.nome || 'Vendedor'} tocou em Ligar na Minha Fila`,
        consultant_id: eu.consultorId,
        user_name: eu.nome || 'Vendedor',
        created_at: agora,
    });
    if (tlErr) console.warn('[fila/contato] timeline:', tlErr.message);

    return NextResponse.json({ success: true });
}
