import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { withHeartbeat } from '@/lib/services/cronHeartbeat';
import { configEspelho } from '@/lib/espelho/mapear';
import { sincronizarEspelho } from '@/lib/espelho/sincronizar';

/**
 * GET /api/cron/wa-espelho — espelho do WhatsApp (Gestão → WhatsApp).
 *
 * Agendado no pg_cron (job wa-espelho, a cada minuto) via call_cron_endpoint,
 * com Authorization: Bearer <CRON_SECRET>. Lê a Evolution (só leitura) e grava
 * em wa_espelho_*: primeiro as mensagens novas, depois continua a importação do
 * histórico até acabar o orçamento. Não responde ninguém, não muda a instância.
 */

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const ORCAMENTO_MS = 50_000; // pg_net corta a chamada em 60 s

export async function GET(request: Request) {
    if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const cfg = configEspelho(process.env);
    if ('faltando' in cfg) {
        return NextResponse.json({ ok: false, skipped: true, faltando: cfg.faltando });
    }
    return await withHeartbeat('wa-espelho', async () => {
        const r = await sincronizarEspelho(createClient(), cfg, { orcamentoMs: ORCAMENTO_MS });
        if (!r.ok) throw new Error(r.erro || 'falha na sincronização');
        return {
            result: NextResponse.json(r),
            metrics: { novas: r.novas, recuperadas: r.recuperadas, importadas: r.importadas, paginas: r.paginasLidas, importacao_pagina: r.importacaoPagina },
        };
    });
}
