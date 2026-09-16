import { NextResponse } from 'next/server';
import { createClient as createSupabaseAdmin } from '@/lib/supabase/admin';
import { createClient as createSupabaseServer } from '@/lib/supabase/server';
import { sendWhatsApp } from '@/lib/services/whatsappSender';
import { normalizarCelular } from '@/lib/compras/alertas/telefone';

const supabaseAdmin = createSupabaseAdmin();

export const dynamic = 'force-dynamic';

/**
 * Envia um WhatsApp de teste para o número do alerta.
 * É a prova, em 10 segundos, de que o aviso chega de verdade — em vez de
 * esperar entrar um carro pra descobrir que o número estava errado.
 */
export async function POST(request: Request) {
    try {
        const supabaseServer = await createSupabaseServer();
        const { data: { user } } = await supabaseServer.auth.getUser();
        if (!user) {
            return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 });
        }

        const { alerta_id } = await request.json();
        if (!alerta_id) {
            return NextResponse.json({ success: false, error: 'Alerta não informado.' }, { status: 400 });
        }

        const { data: alerta, error } = await supabaseAdmin
            .from('alertas_clientes')
            .select('id, nome_cliente, telefone_cliente, marca, modelo')
            .eq('id', alerta_id)
            .single();

        if (error || !alerta) {
            return NextResponse.json({ success: false, error: 'Alerta não localizado.' }, { status: 404 });
        }

        let telefone;
        try {
            telefone = normalizarCelular(alerta.telefone_cliente);
        } catch (e: any) {
            return NextResponse.json({ success: false, error: `WhatsApp inválido: ${e.message}` }, { status: 400 });
        }

        const primeiroNome = (alerta.nome_cliente || '').trim().split(/\s+/)[0] || 'chefe';
        const mensagem = [
            '✅ *Teste do radar de compras — Manos CRM*',
            '',
            `${primeiroNome}, é assim que o aviso vai chegar pra ti.`,
            `Monitorando: *${alerta.modelo}*${alerta.marca && alerta.marca !== 'TODAS' ? ` (${alerta.marca})` : ''}.`,
            '',
            'Quando entrar um carro que bate com esse pedido, tu recebe aqui na hora.',
        ].join('\n');

        const envio = await sendWhatsApp({
            toPhone: telefone.e164,
            message: mensagem,
            kind: 'vendor_alert',
            skipDedup: true,
        });

        await supabaseAdmin.from('alertas_disparos').insert({
            alerta_id: alerta.id,
            veiculo_descricao: 'TESTE DE ENVIO',
            destinatario: alerta.nome_cliente,
            telefone: telefone.e164,
            status: envio.ok ? 'teste' : 'falhou',
            erro: envio.ok ? null : `${envio.provider}: ${envio.error}`,
            mensagem,
            enviado_em: envio.ok ? new Date().toISOString() : null,
        });

        if (!envio.ok) {
            return NextResponse.json(
                { success: false, error: `Não entregou (${envio.provider}): ${envio.error}` },
                { status: 502 },
            );
        }

        return NextResponse.json({
            success: true,
            message: `Teste enviado para ${telefone.formatado} via ${envio.provider}.`,
        });
    } catch (err: any) {
        console.error('[API Alertas Teste] Erro:', err.message);
        return NextResponse.json({ success: false, error: 'Erro ao enviar o teste.' }, { status: 500 });
    }
}
