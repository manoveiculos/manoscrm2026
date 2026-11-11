import { NextRequest, NextResponse } from 'next/server';
import { consultorLogado, leadDoConsultor } from '@/lib/fila/servidor';

export const dynamic = 'force-dynamic';

const DIA = 86_400_000;
const MAX_DIAS = 60;

/**
 * POST /api/fila/retorno — marca o próximo contato com o cliente (botão
 * "Agendar → Retorno" da Minha Fila). O lead sai da fila até a data.
 *
 * Grava em follow_ups (tabela que já existe; sem migration). Quase todo lead
 * ativo está em leads_distribuicao_crm_26, de id inteiro, e follow_ups.lead_id
 * é uuid — então o lead vai em metadata.lead_uid e lead_id só é preenchido
 * para leads de id uuid.
 *
 * Body: { uid: "tabela:id", quando: ISO, nota?: string }
 */
export async function POST(req: NextRequest) {
    const ctx = await consultorLogado();
    if (!ctx.ok) return ctx.res;
    const { admin, eu } = ctx;

    let body: any;
    try { body = await req.json(); } catch { body = null; }
    const quando = new Date(String(body?.quando || ''));
    if (Number.isNaN(quando.getTime())) return NextResponse.json({ success: false, error: 'Informe a data do retorno.' }, { status: 400 });
    if (quando.getTime() < Date.now() - 60_000) return NextResponse.json({ success: false, error: 'O retorno precisa ser no futuro.' }, { status: 400 });
    if (quando.getTime() > Date.now() + MAX_DIAS * DIA) return NextResponse.json({ success: false, error: `Marque o retorno em até ${MAX_DIAS} dias.` }, { status: 400 });

    const r = await leadDoConsultor(admin, eu, body?.uid, 'status');
    if (!r.ok) return r.res;
    const uid = `${r.table}:${r.id}`;
    const dono = r.lead.assigned_consultant_id || eu.consultorId;
    if (!dono) return NextResponse.json({ success: false, error: 'Lead sem vendedor: atribua antes de marcar retorno.' }, { status: 400 });

    // Um retorno pendente por lead: o anterior vira "reagendado".
    const agoraIso = new Date().toISOString();
    const { error: errAnterior } = await admin
        .from('follow_ups')
        .update({ status: 'completed', result: 'reagendado', completed_at: agoraIso })
        .eq('type', 'retorno_fila')
        .eq('status', 'pending')
        .eq('metadata->>lead_uid', uid);
    if (errAnterior) console.warn('[fila/retorno] anterior:', errAnterior.message);

    const nota = typeof body?.nota === 'string' ? body.nota.trim().slice(0, 300) : '';
    const { data, error } = await admin
        .from('follow_ups')
        .insert({
            lead_id: typeof r.id === 'string' ? r.id : null,
            user_id: dono,
            scheduled_at: quando.toISOString(),
            type: 'retorno_fila',
            note: nota || 'Retorno marcado na Minha Fila',
            priority: 'medium',
            status: 'pending',
            metadata: { lead_uid: uid, origem: 'minha_fila', marcado_por: eu.consultorId },
        })
        .select('id')
        .single();
    if (error) {
        console.error('[fila/retorno] insert:', error.message);
        return NextResponse.json({ success: false, error: `O retorno não foi salvo: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data.id, quando: quando.toISOString() });
}
