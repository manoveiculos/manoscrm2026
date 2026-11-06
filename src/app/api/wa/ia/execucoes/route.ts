import { NextResponse } from 'next/server';
import { contextoWa } from '@/lib/whatsapp/leituraServidor';
import { rodadasDaConversa } from '@/lib/whatsapp/ia/leituraEnsaio';
import { msgErro } from '@/lib/whatsapp/erro';

/**
 * GET /api/wa/ia/execucoes?conversa=<id> — ensaio da Laura do CRM, lado a lado:
 * o que foi de fato enviado (n8n ou vendedor) × o rascunho que o CRM escreveu.
 * Só gestor/admin (o RLS de wa_ia_execucoes também barra o vendedor).
 */
const SEM_CACHE = { 'Cache-Control': 'no-store, private' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
    const ctx = await contextoWa();
    if (!ctx.ok) return NextResponse.json({ success: false, error: ctx.erro }, { status: ctx.status, headers: SEM_CACHE });
    if (ctx.eu.perfil !== 'admin' && ctx.eu.perfil !== 'gestor') {
        return NextResponse.json({ success: false, error: 'só gestor ou admin' }, { status: 403, headers: SEM_CACHE });
    }
    const conversa = new URL(req.url).searchParams.get('conversa') || '';
    if (!UUID.test(conversa)) {
        return NextResponse.json({ success: false, error: 'conversa inválida' }, { status: 400, headers: SEM_CACHE });
    }
    try {
        const rodadas = await rodadasDaConversa(ctx.sessao, conversa);
        return NextResponse.json({ success: true, rodadas }, { headers: SEM_CACHE });
    } catch (e) {
        console.error('[wa/ia/execucoes]', msgErro(e));
        return NextResponse.json({ success: false, error: 'não foi possível carregar o ensaio' }, { status: 500, headers: SEM_CACHE });
    }
}
