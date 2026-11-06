import { NextResponse } from 'next/server';
import { contextoWa, listarConversas } from '@/lib/whatsapp/leituraServidor';
import { msgErro } from '@/lib/whatsapp/erro';

/**
 * GET /api/wa/conversas — lista da tela Conversas (Fase 3, leitura).
 * Vendedor recebe só as conversas dele; gestor/admin, todas (RLS do banco).
 *   ?lead=<tabela:id>  só a conversa daquele lead (link da Minha Fila e do perfil)
 */
const SEM_CACHE = { 'Cache-Control': 'no-store, private' };

export async function GET(req: Request) {
    const ctx = await contextoWa();
    if (!ctx.ok) return NextResponse.json({ success: false, error: ctx.erro }, { status: ctx.status, headers: SEM_CACHE });
    try {
        const lead = new URL(req.url).searchParams.get('lead');
        const conversas = await listarConversas(ctx, { leadUid: lead });
        return NextResponse.json(
            { success: true, perfil: ctx.eu.perfil, nome: ctx.eu.nome, conversas },
            { headers: SEM_CACHE },
        );
    } catch (e) {
        console.error('[wa/conversas]', msgErro(e));
        return NextResponse.json({ success: false, error: 'não foi possível carregar as conversas' }, { status: 500, headers: SEM_CACHE });
    }
}
