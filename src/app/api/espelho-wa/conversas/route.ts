import { NextResponse } from 'next/server';
import { contextoEspelho, listarConversas, SEM_CACHE } from '@/lib/espelho/leitura';

export const dynamic = 'force-dynamic';

/**
 * GET /api/espelho-wa/conversas — lista do WhatsApp espelhado (Gestão → WhatsApp). Só admin.
 *   ?busca=   nome, telefone ou texto de mensagem
 *   ?antes=   ISO da última conversa da página anterior (paginação)
 * Também devolve o estado da sincronização com a Evolution.
 */
export async function GET(req: Request) {
    const ctx = await contextoEspelho();
    if (!ctx.ok) return ctx.res;
    if (!ctx.cfg) {
        return NextResponse.json({ success: true, configurado: false, conversas: [], temMais: false, sync: null }, { headers: SEM_CACHE });
    }
    const sp = new URL(req.url).searchParams;
    try {
        const [lista, { data: sync }] = await Promise.all([
            listarConversas(ctx.admin, ctx.cfg.instancia, { busca: sp.get('busca') || '', antes: sp.get('antes') }),
            ctx.admin.from('wa_espelho_sync')
                .select('ultima_sync_em, importacao_concluida, importacao_pagina, total_evolution, ultimo_erro, ultimo_erro_em')
                .eq('instancia', ctx.cfg.instancia).maybeSingle(),
        ]);
        return NextResponse.json({ success: true, configurado: true, instancia: ctx.cfg.instancia, ...lista, sync }, { headers: SEM_CACHE });
    } catch (e) {
        console.error('[espelho-wa/conversas]', e);
        return NextResponse.json({ success: false, error: 'Não consegui carregar as conversas.' }, { status: 500, headers: SEM_CACHE });
    }
}
