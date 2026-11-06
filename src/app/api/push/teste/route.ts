import { NextResponse } from 'next/server';
import { consultorLogado } from '@/lib/fila/servidor';
import { enviarPushParaConsultor } from '@/lib/push/enviarPush';

export const dynamic = 'force-dynamic';

/**
 * POST /api/push/teste — manda um aviso de teste para os celulares do próprio
 * consultor (logo depois de ativar, para ele ver que funciona).
 */
export async function POST() {
    const ctx = await consultorLogado();
    if (!ctx.ok) return ctx.res;
    const r = await enviarPushParaConsultor(ctx.eu.consultorId, {
        titulo: 'Avisos do Manos CRM ligados ✅',
        corpo: 'É assim que o CRM vai te chamar quando um lead quente esperar ou tiver visita.',
        url: '/fila',
        tag: 'teste',
    });
    return NextResponse.json({ success: !r.desligado && r.enviados > 0, ...r }, { headers: { 'Cache-Control': 'no-store' } });
}
