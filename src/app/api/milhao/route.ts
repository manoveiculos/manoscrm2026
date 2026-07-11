import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient();

// ── Helpers ──────────────────────────────────────────────────────────
const num = (v: any) => (v == null || isNaN(Number(v)) ? 0 : Number(v));
const brl0 = (n: number) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const daysBetween = (a: Date, b: Date) =>
    Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));

// Quantos dias um carro está parado (ou ficou, se já vendido)
function diasEstoque(v: any, hoje: Date): number {
    const compra = v.data_compra ? new Date(v.data_compra) : null;
    if (!compra) return 0;
    const fim = v.data_venda ? new Date(v.data_venda) : hoje;
    return Math.max(0, daysBetween(compra, fim));
}

export async function GET() {
    try {
        const [{ data: config }, { data: veiculos }, { data: parcelas }] = await Promise.all([
            supabaseAdmin.from('milhao_config').select('*').limit(1).maybeSingle(),
            supabaseAdmin.from('milhao_veiculos').select('*').order('data_compra', { ascending: false }),
            supabaseAdmin.from('milhao_parcelas').select('*').order('numero', { ascending: true }),
        ]);

        // Fallback de config caso a migração ainda não tenha rodado / linha ausente
        const cfg = config || {
            capital_inicial: 1000000,
            valor_parcela: 48724,
            n_parcelas: 30,
            primeira_parcela: '2027-01-20',
            meta_liquido: 1000000,
            parcela_paga_por_fora: true,
            data_inicio: new Date().toISOString().slice(0, 10),
        };

        const hoje = new Date();
        const capitalInicial = num(cfg.capital_inicial);
        const valorParcela = num(cfg.valor_parcela);
        const nParcelas = num(cfg.n_parcelas) || 30;
        const totalPagar = valorParcela * nParcelas;          // 1.461.720
        const jurosTotal = totalPagar - capitalInicial;       // 461.720
        const metaLiquido = num(cfg.meta_liquido) || 1000000; // 1.000.000 limpo
        // Para sobrar `metaLiquido` limpo após quitar tudo, o lucro de trading
        // precisa cobrir os juros e ainda deixar o líquido: meta = juros + líquido.
        const metaTrading = jurosTotal + metaLiquido;          // 1.461.720

        const lista = (veiculos || []).map((v: any) => {
            const custoTotal = num(v.valor_compra) + num(v.custos_reconto);
            const vendido = v.status === 'vendido';
            const lucro = vendido ? num(v.valor_venda) - custoTotal : null;
            const margem = vendido && custoTotal > 0 ? (lucro as number) / custoTotal : null;
            const dias = diasEstoque(v, hoje);
            const valorRef = num(v.valor_anuncio) || num(v.valor_fipe) || custoTotal; // marcação a mercado
            return {
                ...v,
                custo_total: custoTotal,
                lucro,
                margem,
                dias_estoque: dias,
                valor_ref: valorRef,
                lucro_potencial: vendido ? null : valorRef - custoTotal,
            };
        });

        const vendidos = lista.filter((v: any) => v.status === 'vendido');
        const emEstoque = lista.filter((v: any) => v.status === 'estoque' || v.status === 'reservado');

        // ── Capital / fundo ──────────────────────────────────────────
        const custoVendidos = vendidos.reduce((s: number, v: any) => s + v.custo_total, 0);
        const receitaVendidos = vendidos.reduce((s: number, v: any) => s + num(v.valor_venda), 0);
        const lucroRealizado = receitaVendidos - custoVendidos;
        const custoImobilizado = emEstoque.reduce((s: number, v: any) => s + v.custo_total, 0);
        const valorMercadoEstoque = emEstoque.reduce((s: number, v: any) => s + v.valor_ref, 0);
        const lucroPotencialEstoque = valorMercadoEstoque - custoImobilizado;

        // Caixa livre = capital inicial − custo do que está imobilizado em carros + lucro já realizado
        const caixaLivre = capitalInicial - custoImobilizado + lucroRealizado;
        const patrimonioCusto = caixaLivre + custoImobilizado;          // = capital + lucro realizado
        const patrimonioMercado = caixaLivre + valorMercadoEstoque;      // inclui não-realizado

        // ── Ritmo / projeção ─────────────────────────────────────────
        const datasCompra = lista
            .map((v: any) => (v.data_compra ? new Date(v.data_compra).getTime() : null))
            .filter((t: number | null): t is number => t != null);
        const inicioProjeto = datasCompra.length
            ? new Date(Math.min(...datasCompra))
            : new Date(cfg.data_inicio);
        const mesesDecorridos = Math.max(0.5, daysBetween(inicioProjeto, hoje) / 30);
        const lucroMensalMedio = lucroRealizado / mesesDecorridos;

        const faltaParaMeta = Math.max(0, metaTrading - lucroRealizado);
        const mesesParaMeta = lucroMensalMedio > 0 ? faltaParaMeta / lucroMensalMedio : null;
        const progressoMeta = metaTrading > 0 ? lucroRealizado / metaTrading : 0;
        const progressoComEstoque = metaTrading > 0 ? (lucroRealizado + lucroPotencialEstoque) / metaTrading : 0;
        const liquidoNoBolso = lucroRealizado - jurosTotal; // se liquidasse tudo hoje

        // ── Giro ─────────────────────────────────────────────────────
        const giroMedioDias = vendidos.length
            ? vendidos.reduce((s: number, v: any) => s + v.dias_estoque, 0) / vendidos.length
            : null;
        const ENCALHE_DIAS = 60;
        const encalhados = emEstoque.filter((v: any) => v.dias_estoque >= ENCALHE_DIAS);
        // Sangria de juros por dia sobre o capital imobilizado (~2,65%/mês)
        const sangriaDiaria = (custoImobilizado * 0.0265) / 30;
        const margemMediaVendidos = vendidos.length
            ? vendidos.reduce((s: number, v: any) => s + (v.margem || 0), 0) / vendidos.length
            : null;

        // ── Empréstimo ───────────────────────────────────────────────
        const pagas = (parcelas || []).filter((p: any) => p.paga);
        const totalPago = pagas.reduce((s: number, p: any) => s + num(p.valor), 0);
        const saldoDevedor = totalPagar - totalPago;
        const proxima = (parcelas || []).find((p: any) => !p.paga) || null;
        const primeiraParcela = new Date(cfg.primeira_parcela);
        const diasCarencia = daysBetween(hoje, primeiraParcela); // >0 = ainda em carência

        // ── Veredito ─────────────────────────────────────────────────
        const coberturaParcela = valorParcela > 0 ? lucroMensalMedio / valorParcela : 0;
        let verediroStatus: 'no_ritmo' | 'atencao' | 'critico' | 'sem_dados';
        if (vendidos.length === 0) verediroStatus = 'sem_dados';
        else if (progressoComEstoque >= 0.9 || coberturaParcela >= 1) verediroStatus = 'no_ritmo';
        else if (coberturaParcela >= 0.6) verediroStatus = 'atencao';
        else verediroStatus = 'critico';

        // ── Série mensal (para gráficos e relatório) ─────────────────
        const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
        const ymLabel = (d: Date) => `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
        const mensalMap = new Map<string, any>();
        const bucket = (ym: string, d: Date) => {
            let b = mensalMap.get(ym);
            if (!b) {
                b = { ym, label: ymLabel(d), comprados: 0, vendidos: 0, custo_comprado: 0, receita_vendida: 0, lucro: 0, dias_giro_soma: 0 };
                mensalMap.set(ym, b);
            }
            return b;
        };
        for (const v of lista) {
            if (v.data_compra) {
                const d = new Date(v.data_compra);
                const b = bucket(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, d);
                b.comprados++; b.custo_comprado += v.custo_total;
            }
            if (v.status === 'vendido' && v.data_venda) {
                const d = new Date(v.data_venda);
                const b = bucket(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, d);
                b.vendidos++; b.receita_vendida += num(v.valor_venda); b.lucro += (v.lucro || 0); b.dias_giro_soma += v.dias_estoque;
            }
        }
        const mensal = [...mensalMap.values()]
            .sort((a, b) => a.ym.localeCompare(b.ym))
            .map((b) => ({
                ym: b.ym, label: b.label,
                comprados: b.comprados, vendidos: b.vendidos,
                custo_comprado: b.custo_comprado, receita_vendida: b.receita_vendida,
                lucro: b.lucro,
                giro_medio_dias: b.vendidos ? Math.round(b.dias_giro_soma / b.vendidos) : null,
            }));

        // ── Pontos de atenção (calculados no servidor) ───────────────
        const atencao: { tipo: string; severidade: 'critico' | 'aviso' | 'info'; titulo: string; detalhe: string; veiculo_id?: string }[] = [];
        for (const v of emEstoque) {
            if (v.dias_estoque >= ENCALHE_DIAS) {
                atencao.push({ tipo: 'encalhe', severidade: 'critico', titulo: `${v.marca} ${v.modelo} encalhado`, detalhe: `${v.dias_estoque} dias parado (limite ${ENCALHE_DIAS}d). Capital de ${brl0(v.custo_total)} travado — reprecificar ou girar.`, veiculo_id: v.id });
            } else if (v.dias_estoque >= 45) {
                atencao.push({ tipo: 'quase_encalhe', severidade: 'aviso', titulo: `${v.marca} ${v.modelo} perto do limite`, detalhe: `${v.dias_estoque} dias em estoque. Faltam ${ENCALHE_DIAS - v.dias_estoque}d pra encalhar.`, veiculo_id: v.id });
            }
            if (num(v.valor_anuncio) > 0 && num(v.valor_anuncio) < v.custo_total) {
                atencao.push({ tipo: 'anuncio_prejuizo', severidade: 'aviso', titulo: `${v.marca} ${v.modelo} anunciado no prejuízo`, detalhe: `Anúncio ${brl0(num(v.valor_anuncio))} < custo ${brl0(v.custo_total)}.`, veiculo_id: v.id });
            }
            if (!num(v.valor_anuncio) && !num(v.valor_fipe)) {
                atencao.push({ tipo: 'sem_referencia', severidade: 'info', titulo: `${v.marca} ${v.modelo} sem preço de referência`, detalhe: `Preencha FIPE e/ou anúncio — sem isso a marcação a mercado usa o custo.`, veiculo_id: v.id });
            }
        }
        if (!(diasCarencia > 0) && coberturaParcela < 1 && vendidos.length > 0) {
            atencao.push({ tipo: 'cobertura', severidade: 'critico', titulo: 'Lucro não cobre a parcela', detalhe: `Lucro médio/mês ${brl0(lucroMensalMedio)} < parcela ${brl0(valorParcela)} (cobertura ${(coberturaParcela * 100).toFixed(0)}%).` });
        }
        if (caixaLivre > capitalInicial * 0.35) {
            atencao.push({ tipo: 'caixa_ocioso', severidade: 'info', titulo: 'Caixa ocioso alto', detalhe: `${brl0(caixaLivre)} parados sem girar (${((caixaLivre / capitalInicial) * 100).toFixed(0)}% do capital). Dinheiro parado não dobra.` });
        }
        if (margemMediaVendidos != null && margemMediaVendidos < 0.08 && vendidos.length > 0) {
            atencao.push({ tipo: 'margem_baixa', severidade: 'aviso', titulo: 'Margem média apertada', detalhe: `Média de ${(margemMediaVendidos * 100).toFixed(1)}% nos vendidos. Meta saudável ≥ 12%.` });
        }
        const sevOrder = { critico: 0, aviso: 1, info: 2 } as const;
        atencao.sort((a, b) => sevOrder[a.severidade] - sevOrder[b.severidade]);

        return NextResponse.json({
            success: true,
            config: {
                capital_inicial: capitalInicial,
                valor_parcela: valorParcela,
                n_parcelas: nParcelas,
                primeira_parcela: cfg.primeira_parcela,
                total_pagar: totalPagar,
                juros_total: jurosTotal,
                meta_liquido: metaLiquido,
                meta_trading: metaTrading,
                parcela_paga_por_fora: cfg.parcela_paga_por_fora,
                data_inicio: cfg.data_inicio,
            },
            capital: {
                caixa_livre: caixaLivre,
                custo_imobilizado: custoImobilizado,
                valor_mercado_estoque: valorMercadoEstoque,
                lucro_realizado: lucroRealizado,
                lucro_potencial_estoque: lucroPotencialEstoque,
                patrimonio_custo: patrimonioCusto,
                patrimonio_mercado: patrimonioMercado,
                total_carros: lista.length,
                carros_estoque: emEstoque.length,
                carros_vendidos: vendidos.length,
            },
            giro: {
                giro_medio_dias: giroMedioDias,
                margem_media: margemMediaVendidos,
                sangria_diaria: sangriaDiaria,
                encalhe_dias: ENCALHE_DIAS,
                encalhados: encalhados.map((v: any) => ({
                    id: v.id, marca: v.marca, modelo: v.modelo, ano: v.ano,
                    dias_estoque: v.dias_estoque, custo_total: v.custo_total,
                })),
            },
            emprestimo: {
                total_pagar: totalPagar,
                total_pago: totalPago,
                saldo_devedor: saldoDevedor,
                parcelas_pagas: pagas.length,
                parcelas_total: nParcelas,
                proxima_parcela: proxima ? { numero: proxima.numero, vencimento: proxima.vencimento, valor: num(proxima.valor) } : null,
                dias_carencia: diasCarencia,
                em_carencia: diasCarencia > 0,
            },
            veredito: {
                status: verediroStatus,
                progresso_meta: progressoMeta,
                progresso_com_estoque: progressoComEstoque,
                lucro_mensal_medio: lucroMensalMedio,
                cobertura_parcela: coberturaParcela,
                meses_para_meta: mesesParaMeta,
                meses_decorridos: mesesDecorridos,
                falta_para_meta: faltaParaMeta,
                liquido_no_bolso: liquidoNoBolso,
            },
            mensal,
            atencao,
            veiculos: lista,
            parcelas: parcelas || [],
        });
    } catch (err: any) {
        console.error('[API Milhão] erro:', err?.message);
        return NextResponse.json({ success: false, error: err?.message || 'erro' }, { status: 500 });
    }
}
