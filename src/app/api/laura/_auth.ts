import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseValorBR } from '@/lib/qualificacao';

/**
 * As rotas /api/laura/* são ferramentas do agente no n8n (servidor → servidor).
 * Autenticação: Authorization: Bearer <LAURA_API_KEY>.
 */
export function autorizarLaura(req: NextRequest): NextResponse | null {
    const chave = process.env.LAURA_API_KEY;
    if (!chave) return NextResponse.json({ ok: false, error: 'LAURA_API_KEY não configurada' }, { status: 503 });
    const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (bearer !== chave) return NextResponse.json({ ok: false, error: 'não autorizado' }, { status: 401 });
    return null;
}

const FINAIS = ['vendido', 'perdido', 'lost', 'lost_by_inactivity', 'comprado', 'finalizado', 'arquivado'];

/** Lead de venda mais recente e ainda aberto para o telefone (8 últimos dígitos). */
export async function leadPorTelefone(admin: SupabaseClient, telefone: string): Promise<{ table: string; id: string } | null> {
    const sufixo = String(telefone || '').replace(/\D/g, '').slice(-8);
    if (sufixo.length < 8) return null;
    const fontes = [
        { table: 'leads_distribuicao_crm_26', tel: 'telefone', criado: 'criado_em' },
        { table: 'leads_manos_crm', tel: 'phone', criado: 'created_at' },
    ];
    for (const f of fontes) {
        const { data } = await admin.from(f.table)
            .select('id, status')
            .ilike(f.tel, `%${sufixo}`)
            .is('archived_at', null)
            .order(f.criado, { ascending: false })
            .limit(5);
        const aberto = (data || []).find((r: any) => !FINAIS.includes(String(r.status || '').toLowerCase()));
        if (aberto) return { table: f.table, id: String((aberto as any).id) };
    }
    return null;
}

/** Preços anunciados do estoque (R$), para o filtro de "preço diferente do anunciado". */
export async function precosAnunciados(admin: SupabaseClient): Promise<number[]> {
    const { data } = await admin.from('estoque').select('preco').limit(500);
    return (data || []).map((v: any) => parseValorBR(v.preco)).filter((n): n is number => n != null && n > 0);
}
