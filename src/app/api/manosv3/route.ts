import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@/lib/supabase/admin';
import { requireSocio } from '../societario/_guard';
import { calcularNegocio, pendenciasParaFinalizar, type Movimento, type Negocio } from '@/lib/manosv3';

export const dynamic = 'force-dynamic';

const erro = (msg: string, status = 400) => NextResponse.json({ success: false, error: msg }, { status });
const LADO = ['manos', 'v3'];
const PONTA = ['manos', 'v3', 'externo'];
const TIPO = ['compra', 'custo', 'venda', 'comissao', 'imposto', 'repasse', 'retirada', 'outro'];
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const txt = (v: unknown, max = 300) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const int = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : null);

function limparMov(m: any, negocioId: string | null, quem: string) {
    const valor = Number(m?.valor_centavos);
    if (!TIPO.includes(m?.tipo) || !PONTA.includes(m?.de_lado) || !PONTA.includes(m?.para_lado) || m.de_lado === m.para_lado) throw new Error('Lançamento inválido (tipo ou lados).');
    if (!Number.isInteger(valor) || valor <= 0) throw new Error('Valor do lançamento inválido.');
    const pago = m.status !== 'pendente';
    return {
        negocio_id: negocioId, criado_por: quem, tipo: m.tipo, de_lado: m.de_lado, para_lado: m.para_lado, valor_centavos: valor,
        status: pago ? 'pago' : 'pendente', data: DATA.test(m.data || '') ? m.data : new Date().toISOString().slice(0, 10),
        vencimento: DATA.test(m.vencimento || '') ? m.vencimento : null,
        pago_em: pago ? new Date().toISOString() : null, pago_por: pago ? quem : null,
        forma: txt(m.forma, 40), descricao: txt(m.descricao),
    };
}

export async function GET() {
    const guard = await requireSocio();
    if (!guard.ok) return guard.res;
    const db = createAdminClient();
    const [neg, mov] = await Promise.all([
        db.from('manosv3_negocios').select('*').order('created_at', { ascending: false }),
        db.from('manosv3_movimentos').select('*').order('created_at', { ascending: false }),
    ]);
    const e = neg.error || mov.error;
    if (e) {
        const semTabela = /manosv3_/.test(e.message) && /exist|schema cache/i.test(e.message);
        return erro(semTabela ? 'Tabelas do acerto de contas ainda não criadas. Rode a migration 20261124_manosv3_acerto_contas.sql.' : e.message, 500);
    }
    return NextResponse.json({ success: true, socio: guard.nome, email: guard.email, negocios: neg.data || [], movimentos: mov.data || [] });
}

export async function POST(req: NextRequest) {
    const guard = await requireSocio();
    if (!guard.ok) return guard.res;
    const quem = guard.nome || guard.email;
    const db = createAdminClient();
    let b: any;
    try { b = await req.json(); } catch { return erro('JSON inválido.'); }

    try {
        switch (b.acao) {
            // Compra: cria o carro + os pagamentos informados nas perguntas.
            case 'criar_negocio': {
                const n = b.negocio || {};
                const compra = Number(n.compra_valor_centavos);
                if (!txt(n.veiculo)) return erro('Informe o veículo.');
                if (!LADO.includes(n.compra_loja)) return erro('Informe qual empresa fechou a compra.');
                if (!Number.isInteger(compra) || compra < 0) return erro('Valor da compra inválido.');
                const placa = txt(n.placa, 12)?.toUpperCase().replace(/[^A-Z0-9]/g, '') || null;
                if (placa) {
                    const { data: dup } = await db.from('manosv3_negocios').select('id').eq('placa', placa).neq('status', 'finalizado').maybeSingle();
                    if (dup) return erro(`A placa ${placa} já tem um negócio aberto. Lance a venda nele em vez de criar outro.`);
                }
                const { data: neg, error } = await db.from('manosv3_negocios').insert({
                    criado_por: quem, placa, veiculo: txt(n.veiculo)!, chassi: txt(n.chassi, 30), ano_modelo: int(n.ano_modelo), km: int(n.km), cor: txt(n.cor, 30),
                    compra_loja: n.compra_loja, compra_data: DATA.test(n.compra_data || '') ? n.compra_data : null, compra_valor_centavos: compra,
                    compra_parte: txt(n.compra_parte), compra_contrato_path: txt(n.compra_contrato_path, 200), observacoes: txt(n.observacoes, 1000),
                }).select('*').single();
                if (error) return erro(error.message, 500);
                const movs = (b.movimentos || []).map((m: any) => limparMov(m, neg.id, quem));
                if (movs.length) {
                    const r = await db.from('manosv3_movimentos').insert(movs);
                    if (r.error) { await db.from('manosv3_negocios').delete().eq('id', neg.id); return erro(r.error.message, 500); }
                }
                return NextResponse.json({ success: true, id: neg.id });
            }

            // Venda: grava os dados da venda no carro e os recebimentos/comissão/imposto.
            case 'registrar_venda': {
                const v = b.venda || {};
                const { data: neg } = await db.from('manosv3_negocios').select('*').eq('id', b.negocio_id).maybeSingle();
                if (!neg) return erro('Negócio não encontrado.', 404);
                if (neg.status === 'finalizado') return erro('Negócio já finalizado.');
                if (neg.venda_registrada_em) return erro('A venda deste carro já foi registrada. Use "Lançar movimento" para ajustes.');
                const valor = Number(v.venda_valor_centavos);
                if (!LADO.includes(v.venda_loja)) return erro('Informe qual empresa vendeu.');
                if (!Number.isInteger(valor) || valor <= 0) return erro('Valor da venda inválido.');
                const movs = (b.movimentos || []).map((m: any) => limparMov(m, neg.id, quem));
                const { error } = await db.from('manosv3_negocios').update({
                    status: 'vendido', venda_loja: v.venda_loja, venda_data: DATA.test(v.venda_data || '') ? v.venda_data : null, venda_valor_centavos: valor,
                    venda_parte: txt(v.venda_parte), venda_contrato_path: txt(v.venda_contrato_path, 200), comissao_beneficiario: txt(v.comissao_beneficiario),
                    venda_registrada_em: new Date().toISOString(), venda_registrada_por: quem,
                }).eq('id', neg.id);
                if (error) return erro(error.message, 500);
                if (movs.length) {
                    const r = await db.from('manosv3_movimentos').insert(movs);
                    if (r.error) return erro(r.error.message, 500);
                }
                return NextResponse.json({ success: true });
            }

            case 'add_movimento': {
                const { data: neg } = b.negocio_id ? await db.from('manosv3_negocios').select('status').eq('id', b.negocio_id).maybeSingle() : { data: null };
                if (b.negocio_id && !neg) return erro('Negócio não encontrado.', 404);
                if (neg?.status === 'finalizado') return erro('Negócio finalizado não aceita novos lançamentos.');
                const r = await db.from('manosv3_movimentos').insert(limparMov(b.movimento, b.negocio_id || null, quem));
                if (r.error) return erro(r.error.message, 500);
                return NextResponse.json({ success: true });
            }

            case 'baixa': {
                const { error } = await db.from('manosv3_movimentos').update({ status: 'pago', pago_em: new Date().toISOString(), pago_por: quem }).eq('id', b.id).eq('status', 'pendente').is('estornado_em', null);
                if (error) return erro(error.message, 500);
                return NextResponse.json({ success: true });
            }

            case 'estornar': {
                const { data: m } = await db.from('manosv3_movimentos').select('negocio_id').eq('id', b.id).maybeSingle();
                if (m?.negocio_id) {
                    const { data: neg } = await db.from('manosv3_negocios').select('status').eq('id', m.negocio_id).maybeSingle();
                    if (neg?.status === 'finalizado') return erro('Negócio finalizado: não dá para estornar lançamentos.');
                }
                const { error } = await db.from('manosv3_movimentos').update({ estornado_em: new Date().toISOString(), estornado_por: quem }).eq('id', b.id).is('estornado_em', null);
                if (error) return erro(error.message, 500);
                return NextResponse.json({ success: true });
            }

            // Cada sócio confere só por si.
            case 'conferir':
            case 'desconferir': {
                if (!guard.nome) return erro('Sócio não identificado.', 403);
                const campo = guard.nome === 'Ivo' ? 'conferido_ivo_em' : 'conferido_alexandre_em';
                const { error } = await db.from('manosv3_negocios').update({ [campo]: b.acao === 'conferir' ? new Date().toISOString() : null }).eq('id', b.negocio_id).neq('status', 'finalizado');
                if (error) return erro(error.message, 500);
                return NextResponse.json({ success: true });
            }

            case 'finalizar': {
                const { data: neg } = await db.from('manosv3_negocios').select('*').eq('id', b.negocio_id).maybeSingle();
                if (!neg) return erro('Negócio não encontrado.', 404);
                if (neg.status === 'finalizado') return erro('Já finalizado.');
                const { data: movs } = await db.from('manosv3_movimentos').select('*').eq('negocio_id', neg.id);
                const pend = pendenciasParaFinalizar(neg as Negocio, calcularNegocio(neg as Negocio, (movs || []) as Movimento[]));
                if (pend.length) return erro(`Não dá para finalizar: ${pend.join('; ')}.`);
                const { error } = await db.from('manosv3_negocios').update({ status: 'finalizado', finalizado_em: new Date().toISOString(), finalizado_por: quem }).eq('id', neg.id);
                if (error) return erro(error.message, 500);
                return NextResponse.json({ success: true });
            }

            default: return erro('Ação inválida.');
        }
    } catch (e: any) {
        return erro(e?.message || 'Erro.', 400);
    }
}
