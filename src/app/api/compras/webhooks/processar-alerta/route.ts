import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/services/whatsappSender';
import { avaliarMatch, type AlertaMatch, type VeiculoMatch } from '@/lib/compras/alertas/matcher';
import { montarMensagemAlerta } from '@/lib/compras/alertas/mensagem';
import { normalizarCelular } from '@/lib/compras/alertas/telefone';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const supabaseAdmin = createClient();

const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || 'manos_intel_secret_key';
const CRON_SECRET = process.env.CRON_SECRET;

/** Anti-ban: intervalo mínimo entre dois avisos para o MESMO número. */
const GAP_MINIMO_MS = 60_000;
/** Circuit breaker: teto de avisos por número por dia. */
const TETO_DIARIO_POR_NUMERO = 20;

/**
 * Aceita as duas formas de autenticação:
 *  - Authorization: Bearer <CRON_SECRET>  (usado pelo trigger do banco)
 *  - ?admin_key=<ADMIN_SECRET_KEY>        (compatibilidade com chamadas antigas)
 */
function autorizado(request: NextRequest): boolean {
    const header = request.headers.get('Authorization') || '';
    const bearer = header.replace(/^Bearer\s+/i, '').trim();
    const queryKey = new URL(request.url).searchParams.get('admin_key');

    if (CRON_SECRET && bearer === CRON_SECRET) return true;
    if (bearer && bearer === ADMIN_SECRET_KEY) return true;
    if (queryKey && queryKey === ADMIN_SECRET_KEY) return true;
    return false;
}

/** Impressão digital do anúncio: o mesmo carro é repostado nos grupos o dia inteiro. */
function digitalDoVeiculo(v: VeiculoMatch): string {
    return [
        (v.marca || '').toLowerCase().trim(),
        (v.modelo || '').toLowerCase().trim(),
        v.ano_modelo || '',
        v.km ?? '',
        v.preco_pedido ?? '',
    ].join('|');
}

interface ResultadoDisparo {
    alerta_id: string;
    destinatario: string;
    status: string;
    erro?: string;
}

export async function POST(request: NextRequest) {
    try {
        if (!autorizado(request)) {
            console.warn('[Alertas Compra] Chamada não autorizada bloqueada.');
            return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 });
        }

        const body = await request.json();
        const veiculo: VeiculoMatch & Record<string, any> = body.record || body;

        if (!veiculo || (!veiculo.marca && !veiculo.modelo)) {
            return NextResponse.json(
                { success: false, error: 'Dados do veículo inválidos ou ausentes.' },
                { status: 400 },
            );
        }

        // Oferta que o parser marcou como inválida (sem preço, texto truncado) não
        // vira aviso — o vendedor perde a confiança no sino e passa a ignorar.
        if (veiculo.oferta_valida === false) {
            return NextResponse.json({ success: true, matchesCount: 0, message: 'Oferta marcada como inválida.' });
        }

        const { data: alertas, error: alertasError } = await supabaseAdmin
            .from('alertas_clientes')
            .select('*')
            .eq('ativo', true)
            .not('nome_cliente', 'ilike', '[EXCLUIDO]%');

        if (alertasError) {
            console.error('[Alertas Compra] Erro ao buscar alertas:', alertasError);
            return NextResponse.json({ success: false, error: 'Erro ao buscar alertas ativos.' }, { status: 500 });
        }

        const correspondentes = (alertas || []).filter(
            (a: AlertaMatch) => avaliarMatch(a, veiculo).match,
        ) as AlertaMatch[];

        console.log(
            `[Alertas Compra] ${veiculo.marca} ${veiculo.modelo} → ${correspondentes.length} alerta(s) de ${alertas?.length || 0} ativos.`,
        );

        if (correspondentes.length === 0) {
            return NextResponse.json({ success: true, matchesCount: 0, message: 'Nenhum vendedor aguardando este carro.' });
        }

        const digital = digitalDoVeiculo(veiculo);
        const agora = Date.now();
        const resultados: ResultadoDisparo[] = [];

        for (const alerta of correspondentes) {
            // ── 1. Telefone precisa ser entregável ──────────────────────────
            let destino: string;
            let exibicao: string;
            try {
                const tel = normalizarCelular(alerta.telefone_cliente);
                destino = tel.e164;
                exibicao = tel.formatado;
            } catch (e: any) {
                await registrarDisparo({
                    alerta,
                    veiculo,
                    digital,
                    telefone: alerta.telefone_cliente,
                    status: 'telefone_invalido',
                    erro: e?.message || 'telefone inválido',
                });
                resultados.push({
                    alerta_id: alerta.id,
                    destinatario: alerta.nome_cliente,
                    status: 'telefone_invalido',
                    erro: e?.message,
                });
                continue;
            }

            // ── 2. Dedup: mesmo carro, mesmo alerta, últimas 24h ────────────
            const { data: jaAvisado } = await supabaseAdmin
                .from('alertas_disparos')
                .select('id')
                .eq('alerta_id', alerta.id)
                .eq('veiculo_digital', digital)
                .in('status', ['enviado', 'pendente'])
                .gte('criado_em', new Date(agora - 24 * 60 * 60 * 1000).toISOString())
                .limit(1);

            if (jaAvisado && jaAvisado.length > 0) {
                resultados.push({ alerta_id: alerta.id, destinatario: alerta.nome_cliente, status: 'duplicado' });
                continue;
            }

            // ── 3. Circuit breaker + gap anti-ban ───────────────────────────
            const { count: enviadosHoje } = await supabaseAdmin
                .from('alertas_disparos')
                .select('id', { count: 'exact', head: true })
                .eq('telefone', destino)
                .eq('status', 'enviado')
                .gte('criado_em', new Date(agora - 24 * 60 * 60 * 1000).toISOString());

            if ((enviadosHoje || 0) >= TETO_DIARIO_POR_NUMERO) {
                await registrarDisparo({
                    alerta, veiculo, digital, telefone: destino,
                    status: 'bloqueado_limite',
                    erro: `Teto de ${TETO_DIARIO_POR_NUMERO} avisos em 24h atingido.`,
                });
                resultados.push({ alerta_id: alerta.id, destinatario: alerta.nome_cliente, status: 'bloqueado_limite' });
                continue;
            }

            const { data: ultimo } = await supabaseAdmin
                .from('alertas_disparos')
                .select('enviado_em')
                .eq('telefone', destino)
                .eq('status', 'enviado')
                .order('enviado_em', { ascending: false })
                .limit(1);

            const ultimoEnvio = ultimo?.[0]?.enviado_em ? new Date(ultimo[0].enviado_em).getTime() : 0;
            const mensagem = montarMensagemAlerta(alerta, veiculo);

            if (ultimoEnvio && agora - ultimoEnvio < GAP_MINIMO_MS) {
                // Cedo demais pro mesmo número: enfileira. O cron drena respeitando o gap.
                await registrarDisparo({
                    alerta, veiculo, digital, telefone: destino,
                    status: 'pendente',
                    mensagem,
                });
                resultados.push({ alerta_id: alerta.id, destinatario: alerta.nome_cliente, status: 'pendente' });
                continue;
            }

            // ── 4. Dispara ──────────────────────────────────────────────────
            const envio = await sendWhatsApp({
                toPhone: destino,
                message: mensagem,
                kind: 'vendor_alert',
                skipDedup: true,
            });

            await registrarDisparo({
                alerta, veiculo, digital, telefone: destino,
                status: envio.ok ? 'enviado' : 'falhou',
                erro: envio.ok ? undefined : `${envio.provider}: ${envio.error}`,
                mensagem,
                enviadoEm: envio.ok ? new Date().toISOString() : undefined,
            });

            resultados.push({
                alerta_id: alerta.id,
                destinatario: `${alerta.nome_cliente} (${exibicao})`,
                status: envio.ok ? 'enviado' : 'falhou',
                erro: envio.ok ? undefined : envio.error,
            });
        }

        return NextResponse.json({
            success: true,
            veiculo: `${veiculo.marca} ${veiculo.modelo}`,
            matchesCount: correspondentes.length,
            dispatches: resultados,
        });
    } catch (erro: any) {
        console.error('[Alertas Compra] Erro crítico:', erro);
        return NextResponse.json(
            { success: false, error: 'Erro crítico interno ao processar o alerta.' },
            { status: 500 },
        );
    }
}

async function registrarDisparo(args: {
    alerta: AlertaMatch;
    veiculo: VeiculoMatch & Record<string, any>;
    digital: string;
    telefone: string;
    status: string;
    erro?: string;
    mensagem?: string;
    enviadoEm?: string;
}) {
    try {
        await supabaseAdmin.from('alertas_disparos').insert({
            alerta_id: args.alerta.id,
            veiculo_id: args.veiculo.id ?? null,
            veiculo_digital: args.digital,
            veiculo_descricao: `${args.veiculo.marca || ''} ${args.veiculo.modelo || ''}`.trim(),
            veiculo_ano: args.veiculo.ano_modelo ?? null,
            veiculo_km: args.veiculo.km ?? null,
            veiculo_preco: args.veiculo.preco_pedido ?? null,
            destinatario: args.alerta.nome_cliente,
            telefone: args.telefone,
            status: args.status,
            erro: args.erro ?? null,
            mensagem: args.mensagem ?? null,
            enviado_em: args.enviadoEm ?? null,
        });
    } catch (e) {
        console.error('[Alertas Compra] Falha ao registrar disparo:', e);
    }
}
