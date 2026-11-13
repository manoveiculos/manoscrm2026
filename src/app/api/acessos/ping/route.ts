import { NextRequest, NextResponse } from 'next/server';
import { consultorLogado } from '@/lib/fila/servidor';

export const dynamic = 'force-dynamic';

/**
 * POST /api/acessos/ping { evento: 'heartbeat' | 'navegacao', rota }
 * Presença do vendedor no CRM (aba aberta e visível). Grava só o caminho da tela —
 * sem query string, sem conteúdo. Admin não é registrado. Falha nunca atrapalha o uso: devolve 204.
 */
export async function POST(req: NextRequest) {
    const ctx = await consultorLogado();
    if (!ctx.ok || ctx.eu.perfil === 'admin' || !ctx.eu.consultorId) return new NextResponse(null, { status: 204 });
    try {
        const b = await req.json().catch(() => ({}));
        const evento = b?.evento === 'navegacao' ? 'navegacao' : 'heartbeat';
        const rota = String(b?.rota || '').split('?')[0].split('#')[0].slice(0, 120) || null;
        // Anti-abuso: no máximo 1 batimento a cada 30 s por pessoa.
        if (evento === 'heartbeat') {
            const { data: ult } = await ctx.admin.from('acessos_presenca').select('em')
                .eq('consultant_id', ctx.eu.consultorId).eq('evento', 'heartbeat').order('em', { ascending: false }).limit(1);
            if (ult?.[0] && Date.now() - new Date(ult[0].em).getTime() < 30_000) return new NextResponse(null, { status: 204 });
        }
        await ctx.admin.from('acessos_presenca').insert({ consultant_id: ctx.eu.consultorId, auth_uid: ctx.eu.authId, evento, rota });
    } catch (e: any) {
        console.warn('[acessos/ping]', e?.message);
    }
    return new NextResponse(null, { status: 204 });
}
