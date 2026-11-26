import { NextResponse } from 'next/server';
import { consultorLogado } from '@/lib/fila/servidor';
import { enviarAvisoVendedor } from '@/lib/avisos/webhookVendedor';

/**
 * POST /api/admin/avisos/teste
 * Manda uma mensagem de teste a cada consultor ativo com telefone cadastrado (só admin e gestor) e devolve o
 * resultado de cada envio. Serve para conferir, depois de um deploy ou de trocar a instância, se TODOS recebem.
 * Cada envio fica em avisos_enviados com tipo "teste".
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const SEM_CACHE = { 'Cache-Control': 'no-store, private' };
const ESPERA_MS = 4_000;

export async function POST() {
    const c = await consultorLogado();
    if (!c.ok) return c.res;
    if (c.eu.perfil === 'vendedor') return NextResponse.json({ success: false, error: 'Só para admin e gestor.' }, { status: 403, headers: SEM_CACHE });

    const { data, error } = await c.admin.from('consultants_manos_crm').select('id, name, phone, phone_verified_at, is_active').eq('is_active', true).not('phone', 'is', null).order('name');
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: SEM_CACHE });

    const resultados: { nome: string; telefone: string | null; ok: boolean; erro?: string; verificado: boolean }[] = [];
    for (const [i, p] of (data || []).entries()) {
        if (i > 0) await new Promise(r => setTimeout(r, ESPERA_MS));
        const primeiro = String(p.name || '').trim().split(/\s+/)[0] || 'time';
        const x = await enviarAvisoVendedor({
            nome: p.name as string, telefone: p.phone as string, tipo: 'teste', consultorId: p.id as string, origem: 'adminTeste',
            mensagem: `✅ *Teste de aviso do CRM*\nOi, ${primeiro}! Se você leu esta mensagem, os avisos do CRM estão chegando no seu WhatsApp. Não precisa responder.`,
        });
        resultados.push({ nome: p.name as string, telefone: p.phone as string, ok: x.ok, erro: x.erro, verificado: Boolean(p.phone_verified_at) });
    }
    return NextResponse.json({ success: true, enviados: resultados.filter(r => r.ok).length, falhas: resultados.filter(r => !r.ok).length, resultados }, { headers: SEM_CACHE });
}
