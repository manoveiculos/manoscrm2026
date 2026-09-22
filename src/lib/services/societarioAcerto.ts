// Caixa por empresa e acerto entre Manos (Alexandre) e V3 (Ivo).
// Arquivo puro (sem Supabase) pra rodar igual no servidor e na tela.

export type Loja = 'manos' | 'v3';
export type NomeSocio = 'Alexandre' | 'Ivo';
export type StatusAprovacao = 'aprovada' | 'parcial' | 'pendente';

export const LOJAS: Loja[] = ['manos', 'v3'];
export const DONO_DA_LOJA: Record<Loja, NomeSocio> = { manos: 'Alexandre', v3: 'Ivo' };
export const LOJA_DO_SOCIO: Record<NomeSocio, Loja> = { Alexandre: 'manos', Ivo: 'v3' };
export const NOME_EMPRESA: Record<Loja, string> = { manos: 'Manos Veículos', v3: 'V3 Automóveis' };

export interface CaixaEmpresa {
    loja: Loja;
    dono: NomeSocio;
    recebidoVendas: number; // dinheiro das vendas (a troca não é dinheiro)
    pagoCompras: number; // entradas de compra desta empresa (carro de troca não sai do caixa)
    pagoGastos: number;
    pagoComissoesImpostos: number; // comissões e impostos NF vinculados às vendas
    retiradas: number; // saques feitos deste caixa, de qualquer sócio
    acertosRecebidos: number;
    acertosPagos: number;
    caixa: number;
    estoqueCusto: number; // investido em carros ainda não vendidos (parte da compra + gastos)
    aReceberClientes: number; // saldo devedor dos compradores
    comissoes: number; // comissão de venda das vendas feitas por esta empresa
    impostosNf: number; // imposto/provisionamento de NF das vendas feitas por esta empresa
    lucroDono: number; // parte do lucro que é do dono desta empresa
}

export interface RepasseOperacao {
    veiculo_id: string;
    placa: string | null;
    veiculo: string;
    situacao: 'vendido';
    devedora: Loja;
    credora: Loja;
    valor: number;
    custo: number; // parte da compra que a credora pagou
    gastos: number; // gastos pagos pela credora
    lucro: number; // parte do lucro do dono da credora
    aprovacao: StatusAprovacao;
}

export interface MovimentoAcerto {
    tipo: 'retirada' | 'acerto' | 'troca' | 'compra';
    data: string;
    descricao: string;
    pagou: Loja;
    recebeu: Loja;
    valor: number;
}

export interface AcertoEmpresas {
    empresas: Record<Loja, CaixaEmpresa>;
    operacoes: RepasseOperacao[];
    movimentos: MovimentoAcerto[];
    devedora: Loja | null;
    credora: Loja | null;
    valorDevido: number;
    operacoesAguardandoAprovacao: number;
    alertas: string[];
}

export interface OrigemCompra {
    dona: Loja; // loja do contrato de compra
    troca: boolean;
    custo: number;
    lancado: Record<Loja, number>;
    totalLancado: number;
    semOrigem: number; // parte do custo sem entrada lançada: conta como paga pela dona
    excedente: number; // entradas acima do custo
    aporte: Record<Loja, number>; // quanto da compra é de cada empresa
}

const n = (v: unknown) => Number(v ?? 0) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const outra = (l: Loja): Loja => (l === 'manos' ? 'v3' : 'manos');
const primeiro = <T,>(x: T | T[] | null | undefined): T | undefined => (Array.isArray(x) ? x[0] : x ?? undefined);

function lojaValida(valor: unknown, padrao: Loja = 'manos'): Loja {
    return valor === 'v3' ? 'v3' : valor === 'manos' ? 'manos' : padrao;
}

export function socioDaRetirada(r: { socio_nome?: string | null; socio_email?: string | null }): NomeSocio {
    const nome = (r.socio_nome || '').trim().toLowerCase();
    if (nome.startsWith('ivo')) return 'Ivo';
    if (nome.startsWith('alex')) return 'Alexandre';
    return /(^|[^a-z])ivo/.test((r.socio_email || '').toLowerCase()) ? 'Ivo' : 'Alexandre';
}

export function statusAprovacao(v: { aprovado_alexandre_em?: string | null; aprovado_ivo_em?: string | null }): StatusAprovacao {
    const alexandre = !!v.aprovado_alexandre_em;
    const ivo = !!v.aprovado_ivo_em;
    return alexandre && ivo ? 'aprovada' : alexandre || ivo ? 'parcial' : 'pendente';
}

// De onde saiu o dinheiro da compra deste carro (entradas lançadas + resto na loja do contrato)
export function origemDaCompra(v: any): OrigemCompra {
    const compra = primeiro<any>(v.contratos_compra);
    const dona = lojaValida(compra?.loja_pagadora, lojaValida(v.loja_atual));
    const custo = n(v.custo_aquisicao_inicial);
    const lancado: Record<Loja, number> = { manos: 0, v3: 0 };
    for (const p of v.pagamentos_compra || []) lancado[lojaValida(p.loja)] += n(p.valor);

    const totalLancado = r2(lancado.manos + lancado.v3);
    const semOrigem = r2(Math.max(custo - totalLancado, 0));
    return {
        dona,
        troca: v.origem === 'permuta_troca',
        custo,
        lancado: { manos: r2(lancado.manos), v3: r2(lancado.v3) },
        totalLancado,
        semOrigem,
        excedente: r2(Math.max(totalLancado - custo, 0)),
        aporte: {
            manos: r2(lancado.manos + (dona === 'manos' ? semOrigem : 0)),
            v3: r2(lancado.v3 + (dona === 'v3' ? semOrigem : 0)),
        },
    };
}

/**
 * Quem vendeu segura o dinheiro da venda e repassa pra outra empresa:
 *   parte da compra que a outra pagou + gastos que a outra pagou + a parte do lucro do dono dela.
 * Carro em estoque não gera dívida (é investimento de cada empresa até vender).
 * Carro de troca não sai do caixa: a parte que a outra empresa assumir abate o acerto na hora.
 * Saque de um sócio no caixa da empresa do outro e acertos registrados também abatem.
 */
export function calcularAcertoEmpresas(veiculos: any[], retiradas: any[], acertos: any[], entradasSemVeiculo: any[] = []): AcertoEmpresas {
    const novaEmpresa = (loja: Loja): CaixaEmpresa => ({
        loja,
        dono: DONO_DA_LOJA[loja],
        recebidoVendas: 0,
        pagoCompras: 0,
        pagoGastos: 0,
        pagoComissoesImpostos: 0,
        retiradas: 0,
        acertosRecebidos: 0,
        acertosPagos: 0,
        caixa: 0,
        estoqueCusto: 0,
        aReceberClientes: 0,
        comissoes: 0,
        impostosNf: 0,
        lucroDono: 0,
    });
    const empresas: Record<Loja, CaixaEmpresa> = { manos: novaEmpresa('manos'), v3: novaEmpresa('v3') };
    const operacoes: RepasseOperacao[] = [];
    const movimentos: MovimentoAcerto[] = [];
    const alertas: string[] = [];
    let manosDeveV3 = 0; // positivo = Manos deve à V3; negativo = V3 deve à Manos
    let aguardando = 0;

    for (const v of veiculos) {
        const venda = primeiro<any>(v.contratos_venda);
        const fechamento = primeiro<any>(v.fechamentos_lucro);
        const origem = origemDaCompra(v);
        const descricao = [v.marca, v.modelo].filter(Boolean).join(' ');
        const identificacao = v.placa || descricao;

        if (origem.excedente > 0) {
            alertas.push(`${identificacao}: entradas de compra somam ${brl(origem.totalLancado)}, acima do custo de ${brl(origem.custo)}.`);
        }

        if (origem.troca) {
            const outraDaDona = outra(origem.dona);
            const parteOutra = origem.aporte[outraDaDona];
            if (parteOutra > 0) {
                movimentos.push({
                    tipo: 'troca',
                    data: primeiro<any>(v.contratos_compra)?.data_contrato || '',
                    descricao: `${NOME_EMPRESA[outraDaDona]} ficou com ${brl(parteOutra)} do ${identificacao} (carro de troca)`,
                    pagou: origem.dona,
                    recebeu: outraDaDona,
                    valor: parteOutra,
                });
                manosDeveV3 += origem.dona === 'manos' ? -parteOutra : parteOutra;
            }
        } else {
            empresas.manos.pagoCompras += origem.aporte.manos;
            empresas.v3.pagoCompras += origem.aporte.v3;
        }

        const gastosPor: Record<Loja, number> = { manos: 0, v3: 0 };
        for (const c of v.custos_adicionais || []) {
            const loja = lojaValida(c.loja_pagadora);
            gastosPor[loja] += n(c.valor);
            empresas[loja].pagoGastos += n(c.valor);
        }

        if (!venda) {
            for (const loja of LOJAS) {
                empresas[loja].estoqueCusto += origem.aporte[loja] + gastosPor[loja];
            }
            continue;
        }

        const vendedora = lojaValida(venda.loja_recebedora);
        const valorVenda = n(venda.valor_venda_fechado);
        empresas[vendedora].recebidoVendas += n(venda.valor_entrada_moeda);
        empresas[vendedora].aReceberClientes += n(venda.saldo_devedor);

        const lucro = fechamento ? n(fechamento.lucro_liquido) : valorVenda - origem.custo - gastosPor.manos - gastosPor.v3;
        const cota: Record<Loja, number> = fechamento
            ? { manos: n(fechamento.cota_alexandre), v3: n(fechamento.cota_ivo) }
            : { manos: r2(lucro / 2), v3: r2(lucro / 2) };
        empresas.manos.lucroDono += cota.manos;
        empresas.v3.lucroDono += cota.v3;

        const comissaoVendedor = n(fechamento?.comissao_vendedor);
        const impostoNf = n(fechamento?.imposto_nf);
        empresas[vendedora].comissoes += comissaoVendedor;
        empresas[vendedora].impostosNf += impostoNf;
        empresas[vendedora].pagoComissoesImpostos += comissaoVendedor + impostoNf;

        const outraEmpresa = outra(vendedora);
        const devidoAOutra = r2(origem.aporte[outraEmpresa] + gastosPor[outraEmpresa] + cota[outraEmpresa]);
        const aprovacao = statusAprovacao(v);
        if (aprovacao !== 'aprovada') aguardando++;

        // prejuízo pode inverter o sentido (a outra empresa divide a perda)
        operacoes.push({
            veiculo_id: v.id,
            placa: v.placa ?? null,
            veiculo: descricao,
            situacao: 'vendido',
            devedora: devidoAOutra >= 0 ? vendedora : outraEmpresa,
            credora: devidoAOutra >= 0 ? outraEmpresa : vendedora,
            valor: Math.abs(devidoAOutra),
            custo: r2(origem.aporte[outraEmpresa]),
            gastos: r2(gastosPor[outraEmpresa]),
            lucro: r2(cota[outraEmpresa]),
            aprovacao,
        });
        manosDeveV3 += vendedora === 'manos' ? devidoAOutra : -devidoAOutra;
    }

    for (const r of retiradas) {
        const socio = socioDaRetirada(r);
        const lojaDoSocio = LOJA_DO_SOCIO[socio];
        const caixa = lojaValida(r.loja_caixa, lojaDoSocio);
        const valor = n(r.valor);
        empresas[caixa].retiradas += valor;

        if (caixa !== lojaDoSocio) {
            movimentos.push({
                tipo: 'retirada',
                data: r.data_retirada,
                descricao: `${socio} sacou do caixa da ${NOME_EMPRESA[caixa]}${r.descricao ? ` — ${r.descricao}` : ''}`,
                pagou: caixa,
                recebeu: lojaDoSocio,
                valor,
            });
            manosDeveV3 += caixa === 'manos' ? -valor : valor;
        }
    }

    for (const a of acertos) {
        const de = lojaValida(a.de_loja);
        const para = lojaValida(a.para_loja, outra(de));
        if (de === para) continue;
        const valor = n(a.valor);
        empresas[de].acertosPagos += valor;
        empresas[para].acertosRecebidos += valor;
        movimentos.push({
            tipo: 'acerto',
            data: a.data_acerto,
            descricao: a.descricao || `Acerto ${NOME_EMPRESA[de]} → ${NOME_EMPRESA[para]}`,
            pagou: de,
            recebeu: para,
            valor,
        });
        manosDeveV3 += de === 'manos' ? -valor : valor;
    }

    for (const e of entradasSemVeiculo) {
        const loja = lojaValida(e.loja);
        const valor = n(e.valor);
        empresas[loja].pagoCompras += valor;
        movimentos.push({
            tipo: 'compra',
            data: e.data_pagamento,
            descricao: e.descricao || `Entrada de compra sem veículo (${NOME_EMPRESA[loja]})`,
            pagou: loja,
            recebeu: loja,
            valor,
        });
    }

    for (const loja of LOJAS) {
        const e = empresas[loja];
        e.caixa = e.recebidoVendas - e.pagoCompras - e.pagoGastos - e.pagoComissoesImpostos - e.retiradas + e.acertosRecebidos - e.acertosPagos;
        for (const campo of Object.keys(e) as (keyof CaixaEmpresa)[]) {
            if (typeof e[campo] === 'number') (e as any)[campo] = r2(e[campo] as number);
        }
    }
    movimentos.sort((a, b) => (b.data || '').localeCompare(a.data || ''));

    const valorDevido = r2(Math.abs(manosDeveV3));
    const devedora: Loja | null = valorDevido < 0.01 ? null : manosDeveV3 > 0 ? 'manos' : 'v3';

    return {
        empresas,
        operacoes,
        movimentos,
        devedora,
        credora: devedora ? outra(devedora) : null,
        valorDevido: devedora ? valorDevido : 0,
        operacoesAguardandoAprovacao: aguardando,
        alertas,
    };
}
