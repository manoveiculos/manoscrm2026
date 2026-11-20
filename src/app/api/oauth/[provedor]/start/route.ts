import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { requireAdmin } from '../../../marketing/_guard';
import { enderecoDeRetorno, faltaConfigurar, provedorValido, urlDeAutorizacao } from '@/lib/conexoes/oauth';

export const dynamic = 'force-dynamic';

const VOLTAR = '/admin/marketing/campanhas';

/**
 * GET /api/oauth/<google|meta>/start — o botão "Conectar".
 * Só admin. Manda o usuário para a tela OFICIAL de login e autorização do Google ou do Meta.
 * A senha é digitada lá; o CRM nunca a vê.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provedor: string }> }) {
    const { provedor } = await ctx.params;
    const voltar = (qs: string) => NextResponse.redirect(new URL(`${VOLTAR}?${qs}`, req.nextUrl.origin));

    const guard = await requireAdmin();
    if (!guard.ok) return guard.res;
    if (!provedorValido(provedor)) return NextResponse.json({ success: false, error: 'provedor inválido' }, { status: 404 });

    const falta = faltaConfigurar(provedor);
    if (falta.length) return voltar(`conectar=falta&provedor=${provedor}&vars=${encodeURIComponent(falta.join(','))}`);

    const state = randomBytes(24).toString('hex');
    const retorno = enderecoDeRetorno(provedor, req.nextUrl.origin);
    const res = NextResponse.redirect(urlDeAutorizacao(provedor, retorno, state));
    // Anti-falsificação: o retorno só vale se trouxer o mesmo "state" que está neste cookie.
    res.cookies.set(`oauth_state_${provedor}`, state, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/oauth', maxAge: 600,
    });
    return res;
}
