import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/services/whatsappSender';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabaseAdmin = createClient();

/** Mesmo gap do webhook: nunca dois avisos pro mesmo número em menos de 1 min. */
const GAP_MINIMO_MS = 60_000;
/** Aviso de carro é perecível: depois disso o carro já foi. */
const VALIDADE_MS = 6 * 60 * 60 * 1000;

/**
 * Drena a fila de avisos represados pelo anti-ban.
 *
 * Quando dois carros do mesmo perfil entram em sequência, o segundo aviso fica
 * `pendente` em vez de sair em rajada e queimar o número. Este job solta um
 * por número a cada rodada, respeitando o intervalo mínimo.
 */
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const agora = Date.now();

    // 1. Expira o que envelheceu na fila
    const { data: expirados } = await supabaseAdmin
        .from('alertas_disparos')
        .update({ status: 'expirado', erro: 'Aviso venceu na fila antes de sair.' })
        .eq('status', 'pendente')
        .lt('criado_em', new Date(agora - VALIDADE_MS).toISOString())
        .select('id');

    // 2. Pega os pendentes mais antigos primeiro
    const { data: pendentes, error } = await supabaseAdmin
        .from('alertas_disparos')
        .select('id, telefone, mensagem, tentativas')
        .eq('status', 'pendente')
        .order('criado_em', { ascending: true })
        .limit(30);

    if (error) {
        console.error('[Cron Alertas] Erro ao ler a fila:', error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const numerosUsadosNestaRodada = new Set<string>();
    let enviados = 0;
    let represados = 0;
    let falhas = 0;

    for (const item of pendentes || []) {
        if (!item.telefone || !item.mensagem) continue;

        // Um aviso por número por rodada
        if (numerosUsadosNestaRodada.has(item.telefone)) {
            represados++;
            continue;
        }

        const { data: ultimo } = await supabaseAdmin
            .from('alertas_disparos')
            .select('enviado_em')
            .eq('telefone', item.telefone)
            .eq('status', 'enviado')
            .order('enviado_em', { ascending: false })
            .limit(1);

        const ultimoEnvio = ultimo?.[0]?.enviado_em ? new Date(ultimo[0].enviado_em).getTime() : 0;
        if (ultimoEnvio && agora - ultimoEnvio < GAP_MINIMO_MS) {
            represados++;
            continue;
        }

        const envio = await sendWhatsApp({
            toPhone: item.telefone,
            message: item.mensagem,
            kind: 'vendor_alert',
            skipDedup: true,
        });

        await supabaseAdmin
            .from('alertas_disparos')
            .update({
                status: envio.ok ? 'enviado' : 'falhou',
                erro: envio.ok ? null : `${envio.provider}: ${envio.error}`,
                tentativas: (item.tentativas || 0) + 1,
                enviado_em: envio.ok ? new Date().toISOString() : null,
            })
            .eq('id', item.id);

        numerosUsadosNestaRodada.add(item.telefone);
        if (envio.ok) enviados++;
        else falhas++;
    }

    return NextResponse.json({
        ok: true,
        enviados,
        represados,
        falhas,
        expirados: expirados?.length || 0,
        fila: (pendentes?.length || 0) - enviados - falhas,
    });
}
