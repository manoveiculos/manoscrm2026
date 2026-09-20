import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { requireSquadSecret } from '../_guard';

export const dynamic = 'force-dynamic';

const SQUADS = ['perito', 'vitrine', 'sentinela', 'captador', 'recepcao'] as const;
type Squad = typeof SQUADS[number];

/**
 * POST /api/marketing/runs
 *
 * Cada skill do squad de agentes de IA (Perito, Vitrine, Sentinela, Captador,
 * Recepção — playbook em "Agentes de marketing"/CLAUDE.md) chama isso ao
 * terminar uma execução, pra alimentar o painel /admin/marketing.
 *
 * Auth: header X-Marketing-Squad-Secret (env MARKETING_SQUAD_API_SECRET).
 *
 * Body:
 * {
 *   "squad": "perito",                 // obrigatório — um de: perito|vitrine|sentinela|captador|recepcao
 *   "skill_name": "laudo-relampago",   // opcional — nome da skill que rodou
 *   "run_type": "laudo_proposta",      // obrigatório — identifica o tipo de execução
 *   "status": "success",               // opcional — success|error|pending_approval (default success)
 *   "title": "Fusion Titanium 2013 — ABC1D23",   // obrigatório — resumo curto pra lista
 *   "summary": "Nota 7/10 ...",        // opcional — descrição mais longa
 *   "input_ref": "link do laudo",      // opcional
 *   "output_ref": "link do resultado", // opcional
 *   "metrics": { "nota_compra": 7 },   // opcional — livre, por tipo de run
 *   "requires_approval": true,         // opcional — entra na fila de aprovação humana
 *   "error_message": "...",            // opcional — se status=error
 *   "duration_ms": 4200                // opcional
 * }
 */
export async function POST(req: NextRequest) {
    const guard = requireSquadSecret(req);
    if (!guard.ok) return guard.res;

    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ success: false, error: 'JSON inválido' }, { status: 400 });
    }

    const { squad, skill_name, run_type, status, title, summary, input_ref, output_ref, metrics, requires_approval, error_message, duration_ms } = body || {};

    if (!squad || !SQUADS.includes(squad)) {
        return NextResponse.json({ success: false, error: `squad obrigatório — um de: ${SQUADS.join(', ')}` }, { status: 400 });
    }
    if (!run_type || typeof run_type !== 'string') {
        return NextResponse.json({ success: false, error: 'run_type obrigatório' }, { status: 400 });
    }
    if (!title || typeof title !== 'string') {
        return NextResponse.json({ success: false, error: 'title obrigatório' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
        .from('marketing_agent_runs')
        .insert({
            squad: squad as Squad,
            skill_name: skill_name || null,
            run_type,
            status: status || (requires_approval ? 'pending_approval' : 'success'),
            title,
            summary: summary || null,
            input_ref: input_ref || null,
            output_ref: output_ref || null,
            metrics: metrics || {},
            requires_approval: !!requires_approval,
            error_message: error_message || null,
            duration_ms: typeof duration_ms === 'number' ? duration_ms : null,
            source: 'claude_cowork',
        })
        .select('id')
        .single();

    if (error) {
        console.error('Erro ao gravar marketing_agent_runs:', error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, id: data.id });
}
