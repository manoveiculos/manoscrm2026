import { NextResponse } from 'next/server';
import { contextoEspelho, SEM_CACHE } from '@/lib/espelho/leitura';
import { sincronizarEspelho } from '@/lib/espelho/sincronizar';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/espelho-wa/sincronizar — botão "Atualizar" da tela (só admin).
 * Busca só as mensagens novas na Evolution (a importação do histórico fica com o cron).
 */
export async function POST() {
    const ctx = await contextoEspelho();
    if (!ctx.ok) return ctx.res;
    if (!ctx.cfg) return NextResponse.json({ success: false, error: 'Evolution do espelho não configurada' }, { status: 503, headers: SEM_CACHE });
    const r = await sincronizarEspelho(ctx.admin, ctx.cfg, { orcamentoMs: 25_000, importar: false });
    return NextResponse.json({ success: r.ok, ...r, ...(r.erro ? { error: 'Falha ao ler a Evolution' } : {}) }, { status: r.ok ? 200 : 502, headers: SEM_CACHE });
}
