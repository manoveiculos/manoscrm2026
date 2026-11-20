import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { precisaRegistrar, verificarLogins, type EstadoLogin } from '@/lib/conexoes/login';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/cron/conexoes-login — confere se o login do Meta e o do Google ainda valem.
 * Auth: Authorization: Bearer <CRON_SECRET> (a Vercel manda sozinha; o agente de tráfego também usa).
 *
 * Só registra na TRANSIÇÃO (caiu / voltou), para não encher a fila de aviso igual toda rodada.
 * O registro vai para marketing_agent_runs (squad "sentinela"), e aparece em Conexões e nos erros do painel.
 * Nunca devolve token nem senha: só o motivo e o caminho para reconectar.
 */
export async function GET(req: NextRequest) {
    if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ success: false, error: 'não autorizado' }, { status: 401 });
    }

    const admin = createAdminClient();
    const resultados = await verificarLogins();
    const registrados: { id: string; evento: string }[] = [];

    for (const r of resultados) {
        const { data: ultimoRun } = await admin.from('marketing_agent_runs')
            .select('metrics').eq('run_type', 'conexao_login').contains('metrics', { login: r.id })
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
        const ultimo = ((ultimoRun?.metrics as { estado?: EstadoLogin } | null)?.estado ?? null) as EstadoLogin | null;
        const evento = precisaRegistrar(r.estado, ultimo);
        if (!evento) continue;

        const caiu = evento === 'caiu';
        const { error } = await admin.from('marketing_agent_runs').insert({
            squad: 'sentinela',
            skill_name: 'conexoes-login',
            run_type: 'conexao_login',
            status: caiu ? 'error' : 'success',
            title: caiu ? `${r.nome}: o login caiu. Precisa reconectar` : `${r.nome}: voltou a funcionar`,
            summary: caiu ? `${r.motivo} ${r.reconectar ? `Reconectar: ${r.reconectar.url}` : ''}`.trim() : 'O login foi refeito e a conexão respondeu normalmente.',
            error_message: caiu ? r.motivo : null,
            metrics: { login: r.id, estado: r.estado },
            requires_approval: false,
        });
        if (error) return NextResponse.json({ success: false, error: `não consegui registrar: ${error.message}`, resultados }, { status: 500 });
        registrados.push({ id: r.id, evento });
    }

    return NextResponse.json({
        success: true,
        logins: resultados.map(r => ({ id: r.id, estado: r.estado, motivo: r.motivo, reconectar: r.reconectar?.url ?? null })),
        registrados,
    });
}
