import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { requireAdmin } from '../../../marketing/_guard';
import { salvarCredencial } from '@/lib/conexoes/credenciais';
import { enderecoDeRetorno, provedorValido, trocarCodigo } from '@/lib/conexoes/oauth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const VOLTAR = '/admin/marketing/campanhas';

function iguais(a: string, b: string): boolean {
    const x = Buffer.from(a), y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * GET /api/oauth/<google|meta>/callback — para onde o Google/Meta devolvem o usuário depois do "Permitir".
 * Confere o "state", troca o código pelo acesso e guarda em oauth_conexoes. Nunca mostra token.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ provedor: string }> }) {
    const { provedor } = await ctx.params;
    const voltar = (qs: string) => {
        const r = NextResponse.redirect(new URL(`${VOLTAR}?${qs}`, req.nextUrl.origin));
        r.cookies.delete({ name: `oauth_state_${provedor}`, path: '/api/oauth' });
        return r;
    };

    const guard = await requireAdmin();
    if (!guard.ok) return guard.res;
    if (!provedorValido(provedor)) return NextResponse.json({ success: false, error: 'provedor inválido' }, { status: 404 });

    const q = req.nextUrl.searchParams;
    if (q.get('error')) return voltar(`conectar=negado&provedor=${provedor}`); // o usuário clicou em Cancelar
    const code = q.get('code') || '';
    const state = q.get('state') || '';
    const guardado = req.cookies.get(`oauth_state_${provedor}`)?.value || '';
    if (!code || !state || !guardado || !iguais(state, guardado)) return voltar(`conectar=invalido&provedor=${provedor}`);

    const troca = await trocarCodigo(provedor, code, enderecoDeRetorno(provedor, req.nextUrl.origin));
    if (!troca.ok) return voltar(`conectar=erro&provedor=${provedor}&motivo=${encodeURIComponent(troca.erro)}`);

    const salvo = await salvarCredencial(provedor, { ...troca.tokens, conectado_por: guard.email });
    if (!salvo.ok) {
        const tabela = /oauth_conexoes|relation|does not exist/i.test(salvo.erro);
        return voltar(`conectar=erro&provedor=${provedor}&motivo=${encodeURIComponent(tabela ? 'A tabela oauth_conexoes ainda não existe no banco: rode a migration 20261125_oauth_conexoes.sql.' : 'Não consegui guardar o acesso.')}`);
    }
    return voltar(`conectado=${provedor}`);
}
