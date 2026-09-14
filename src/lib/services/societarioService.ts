import { supabase, supabaseAdmin } from '@/lib/supabase';
import type { TipoPagamento } from './societarioPdfParser';
import { calcularAcertoEmpresas, LOJAS, NOME_EMPRESA, socioDaRetirada, type Loja, type NomeSocio } from './societarioAcerto';

export interface Veiculo {
    id?: string;
    placa?: string | null;
    chassi?: string | null;
    renavam?: string | null;
    marca: string;
    modelo: string;
    ano_fabricacao?: number | null;
    ano_modelo?: number | null;
    km?: number;
    combustivel?: string | null;
    cor?: string | null;
    status: 'disponivel' | 'vendido' | 'em_preparacao' | 'reservado';
    origem: 'compra_direta' | 'permuta_troca';
    custo_aquisicao_inicial: number;
    valor_venda_tabela?: number;
    data_entrada?: string;
    data_venda?: string | null;
    aprovado_alexandre_em?: string | null;
    aprovado_ivo_em?: string | null;
}

export interface ContratoCompra {
    id?: string;
    veiculo_id: string;
    fornecedor_nome: string;
    fornecedor_cpf_cnpj?: string | null;
    captador_vendedor?: string | null;
    valor_acordado_compra: number;
    forma_liquidacao?: string | null;
    data_contrato?: string;
    pdf_url?: string | null;
    observacoes?: string | null;
}

export interface ContratoVenda {
    id?: string;
    veiculo_id: string;
    comprador_nome: string;
    comprador_cpf_cnpj?: string | null;
    vendedor_responsavel?: string | null;
    valor_venda_fechado: number;
    valor_entrada_moeda?: number;
    valor_veiculo_troca?: number;
    tem_troca?: boolean;
    troca_placa?: string | null;
    troca_modelo?: string | null;
    troca_veiculo_gerado_id?: string | null;
    saldo_devedor?: number;
    data_contrato?: string;
    pdf_url?: string | null;
    observacoes?: string | null;
}

export interface CustoAdicional {
    id?: string;
    veiculo_id: string;
    categoria: 'oficina' | 'vistoria' | 'polimento' | 'transferencia' | 'guincho' | 'outros';
    descricao: string;
    valor: number;
    comprovante_url?: string | null;
    data_custo?: string;
}

export interface FechamentoLucro {
    id?: string; // veiculo_id
    veiculo_id: string;
    contrato_compra_id?: string | null;
    contrato_venda_id?: string | null;
    custo_aquisicao: number;
    valor_venda: number;
    lucro_bruto: number;
    comissao_vendedor: number;
    imposto_nf: number;
    total_custos_extras: number;
    lucro_liquido: number;
    pct_alexandre: number;
    cota_alexandre: number;
    pct_ivo: number;
    cota_ivo: number;
    status_fechamento: 'rascunho' | 'liquidado' | 'pendente_custos';
    data_fechamento?: string;
}

export interface RetiradaSocio {
    id?: string;
    socio_email: string;
    socio_nome: string;
    valor: number;
    data_retirada: string;
    descricao?: string | null;
    comprovante_url?: string | null;
    loja_caixa?: Loja | null;
}

export interface AcertoRegistrado {
    id?: string;
    de_loja: Loja;
    para_loja: Loja;
    valor: number;
    data_acerto: string;
    descricao?: string | null;
    registrado_por?: string | null;
}

export interface EntradaCompra {
    id?: string;
    veiculo_id: string;
    loja: Loja;
    valor: number;
    forma?: string | null;
    data_pagamento: string;
    descricao?: string | null;
    registrado_por?: string | null;
}

export interface KpisSocietarios {
    volumeVendas: number;
    custoAquisicaoTotal: number;
    comissoesECustosTotal: number;
    lucroLiquidoTotal: number;
    alexandre: {
        cotaTotal: number;
        retiradas: number;
        saldoDisponivel: number;
    };
    ivo: {
        cotaTotal: number;
        retiradas: number;
        saldoDisponivel: number;
    };
}

export interface PagamentoVenda {
    tipo_pagamento: TipoPagamento;
    valor: number;
    descricao?: string;
    data_pagamento?: string;
}

const TIPOS_PAGAMENTO: TipoPagamento[] = ['ted', 'dda', 'pix', 'dinheiro', 'permuta_veiculo', 'financiamento'];
const AVISO_MIGRATION = 'Aprovação, acertos e entradas de compra ainda não estão ativos no banco (migration 20260917 pendente).';
const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const hojeIso = () => new Date().toISOString().split('T')[0];

// ── MOTOR DE CÁLCULO FINANCEIRO ──
export function calcularFechamento(params: {
    custoAquisicao: number;
    valorVenda: number;
    comissaoVendedor?: number;
    impostoNf?: number;
    totalCustosExtras?: number;
    pctAlexandre?: number;
    pctIvo?: number;
}) {
    const custoAquisicao = Number(params.custoAquisicao || 0);
    const valorVenda = Number(params.valorVenda || 0);
    const comissaoVendedor = Number(params.comissaoVendedor || 0);
    const impostoNf = Number(params.impostoNf || 0);
    const totalCustosExtras = Number(params.totalCustosExtras || 0);
    const pctAlexandre = Number(params.pctAlexandre ?? 50.0);
    const pctIvo = Number(params.pctIvo ?? 50.0);

    const lucroBruto = valorVenda - custoAquisicao;
    const lucroLiquido = lucroBruto - (comissaoVendedor + impostoNf + totalCustosExtras);

    const cotaAlexandre = Number((lucroLiquido * (pctAlexandre / 100)).toFixed(2));
    const cotaIvo = Number((lucroLiquido * (pctIvo / 100)).toFixed(2));

    return {
        lucroBruto,
        lucroLiquido,
        cotaAlexandre,
        cotaIvo,
        pctAlexandre,
        pctIvo,
        comissaoVendedor,
        impostoNf,
        totalCustosExtras
    };
}

// ── COMISSÃO DE VENDA AUTOMÁTICA ──
// Vai pra loja que gerou a venda (loja_recebedora): % sobre o lucro bruto (venda − custo de aquisição).
export const PCT_COMISSAO_VENDA = 10;

export function comissaoAutomatica(valorVenda: number, custoAquisicao: number): number {
    const lucroBruto = Number(valorVenda || 0) - Number(custoAquisicao || 0);
    return lucroBruto > 0 ? Number(((lucroBruto * PCT_COMISSAO_VENDA) / 100).toFixed(2)) : 0;
}

export const NOME_LOJA: Record<string, string> = NOME_EMPRESA;

// ── CHECAGEM DE WHITELIST DOS SÓCIOS (ALEXANDRE E IVO) ──
export async function verificarAcessoSocio(email?: string | null): Promise<boolean> {
    if (!email) return false;
    const client = supabaseAdmin || supabase;
    const { data, error } = await client
        .from('usuarios_socios')
        .select('id, ativo')
        .eq('email', email.trim().toLowerCase())
        .single();

    if (error || !data) return false;
    return !!data.ativo;
}

// ── BUSCA COMPLETA DOS DADOS DO DASHBOARD ──
export async function getSocietarioDashboardData() {
    const client = supabaseAdmin || supabase;

    // 1. Veículos com seus contratos, gastos, entradas de compra e fechamentos
    const embeds = `
            *,
            contratos_compra(*),
            contratos_venda!contratos_venda_veiculo_id_fkey(*),
            custos_adicionais(*),
            fechamentos_lucro(*)`;
    const comEntradas = await client
        .from('veiculos')
        .select(`${embeds}, pagamentos_compra(*)`)
        .order('created_at', { ascending: false });
    // pagamentos_compra nasce na migration 20260917; sem ela o painel carrega sem as entradas
    const resultadoVeiculos = comEntradas.error && /pagamentos_compra/.test(comEntradas.error.message)
        ? await client.from('veiculos').select(embeds).order('created_at', { ascending: false })
        : comEntradas;
    const veiculos = resultadoVeiculos.data;
    const veiculosErr = resultadoVeiculos.error;

    if (veiculosErr) {
        console.error('Erro ao buscar veículos societários:', veiculosErr);
    }

    // 2. Retiradas dos sócios
    const { data: retiradas, error: retiradasErr } = await client
        .from('retiradas_socios')
        .select('*')
        .order('data_retirada', { ascending: false });

    if (retiradasErr) {
        console.error('Erro ao buscar retiradas:', retiradasErr);
    }

    // 3. Acertos entre empresas (tabela nasce na migration 20260917)
    const { data: acertos, error: acertosErr } = await client
        .from('acertos_empresas')
        .select('*')
        .order('data_acerto', { ascending: false });

    if (acertosErr) {
        console.error('Erro ao buscar acertos entre empresas:', acertosErr.message);
    }

    // 4. Apuração dos KPIs
    let volumeVendas = 0;
    let custoAquisicaoTotal = 0;
    let comissoesECustosTotal = 0;
    let lucroLiquidoTotal = 0;
    let cotaAlexandreTotal = 0;
    let cotaIvoTotal = 0;

    const veiculosList: any[] = veiculos || [];

    veiculosList.forEach((v: any) => {
        const fechamento = Array.isArray(v.fechamentos_lucro)
            ? v.fechamentos_lucro[0]
            : v.fechamentos_lucro;

        const contratoVenda = Array.isArray(v.contratos_venda)
            ? v.contratos_venda[0]
            : v.contratos_venda;

        if (v.status === 'vendido' || contratoVenda) {
            const vVenda = Number(contratoVenda?.valor_venda_fechado || fechamento?.valor_venda || 0);
            const vCompra = Number(v.custo_aquisicao_inicial || fechamento?.custo_aquisicao || 0);

            volumeVendas += vVenda;
            custoAquisicaoTotal += vCompra;

            if (fechamento) {
                comissoesECustosTotal += Number(fechamento.comissao_vendedor || 0) + Number(fechamento.imposto_nf || 0) + Number(fechamento.total_custos_extras || 0);
                lucroLiquidoTotal += Number(fechamento.lucro_liquido || 0);
                cotaAlexandreTotal += Number(fechamento.cota_alexandre || 0);
                cotaIvoTotal += Number(fechamento.cota_ivo || 0);
            } else {
                const calc = calcularFechamento({ custoAquisicao: vCompra, valorVenda: vVenda });
                lucroLiquidoTotal += calc.lucroLiquido;
                cotaAlexandreTotal += calc.cotaAlexandre;
                cotaIvoTotal += calc.cotaIvo;
            }
        }
    });

    const retiradasList = retiradas || [];
    const acertosList = acertosErr ? [] : acertos || [];
    let retiradasAlexandre = 0;
    let retiradasIvo = 0;

    retiradasList.forEach((r: any) => {
        if (socioDaRetirada(r) === 'Ivo') {
            retiradasIvo += Number(r.valor || 0);
        } else {
            retiradasAlexandre += Number(r.valor || 0);
        }
    });

    const kpis: KpisSocietarios = {
        volumeVendas,
        custoAquisicaoTotal,
        comissoesECustosTotal,
        lucroLiquidoTotal,
        alexandre: {
            cotaTotal: cotaAlexandreTotal,
            retiradas: retiradasAlexandre,
            saldoDisponivel: cotaAlexandreTotal - retiradasAlexandre
        },
        ivo: {
            cotaTotal: cotaIvoTotal,
            retiradas: retiradasIvo,
            saldoDisponivel: cotaIvoTotal - retiradasIvo
        }
    };

    return {
        veiculos: veiculosList,
        retiradas: retiradasList,
        acertos: acertosList,
        acerto: calcularAcertoEmpresas(veiculosList, retiradasList, acertosList),
        kpis
    };
}

function limparPlaca(placa?: string | null): string | null {
    const limpa = (placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return limpa || null;
}

function limparChassi(chassi?: string | null): string | null {
    const limpo = (chassi || '').toUpperCase().replace(/\s/g, '');
    return limpo || null;
}

// Data do contrato (yyyy-mm-dd) vira meio-dia de Brasília pra não escorregar de dia no fuso.
function dataContratoParaTimestamp(data?: string): string {
    return data ? `${data}T12:00:00-03:00` : new Date().toISOString();
}

// placa é UNIQUE em veiculos; chassi é a segunda chave (troca sem placa, placa digitada errada).
async function buscarVeiculoExistente(client: any, placa: string | null, chassi: string | null) {
    const campos = 'id, placa, chassi, status, origem';
    if (placa) {
        const { data } = await client.from('veiculos').select(campos).eq('placa', placa).maybeSingle();
        if (data) return data;
    }
    if (chassi) {
        const { data } = await client.from('veiculos').select(campos).eq('chassi', chassi).limit(1).maybeSingle();
        if (data) return data;
    }
    return null;
}

// ── CADASTRAR COMPRA DE VEÍCULO (ENTRADA DE ESTOQUE) ──
export async function cadastrarCompraVeiculo(payload: {
    marca: string;
    modelo: string;
    placa?: string;
    chassi?: string;
    renavam?: string;
    ano_fabricacao?: number;
    ano_modelo?: number;
    km?: number;
    combustivel?: string;
    cor?: string;
    fornecedor_nome: string;
    fornecedor_cpf_cnpj?: string;
    captador_vendedor?: string;
    loja?: string;
    valor_acordado_compra: number;
    forma_liquidacao?: string;
    data_contrato?: string;
    observacoes?: string;
    origem_pagamento?: Array<{ loja: Loja; valor: number }>;
}) {
    const client = supabaseAdmin || supabase;
    const lojaSel = payload.loja || 'manos';
    const placa = limparPlaca(payload.placa);
    const chassi = limparChassi(payload.chassi);

    // 0a. De onde saiu o dinheiro: não pode passar do valor da compra
    const origem = (payload.origem_pagamento || []).filter((p) => Number(p.valor) > 0);
    for (const p of origem) {
        if (!LOJAS.includes(p.loja)) throw new Error('Empresa de origem do dinheiro inválida.');
    }
    const totalOrigem = origem.reduce((s, p) => s + Number(p.valor), 0);
    if (totalOrigem > Number(payload.valor_acordado_compra) + 0.01) {
        throw new Error(`A origem do dinheiro (${brl(totalOrigem)}) passa do valor da compra (${brl(payload.valor_acordado_compra)}).`);
    }
    // 100% da loja do contrato não precisa de lançamento: parte sem entrada já conta como paga por ela
    const lancarOrigem = origem.some((p) => p.loja !== lojaSel);

    // 0b. Mesmo carro subido duas vezes (ou que já entrou como troca) não duplica estoque
    const existente = await buscarVeiculoExistente(client, placa, chassi);
    if (existente) {
        const identificacao = existente.placa || existente.chassi;
        if (existente.status === 'vendido') {
            throw new Error(`O veículo ${identificacao} já foi comprado e vendido antes. Recompra do mesmo carro precisa de ajuste manual.`);
        }
        const comoEntrou = existente.origem === 'permuta_troca' ? 'entrou como troca numa venda' : 'já tem contrato de compra';
        throw new Error(`O veículo ${identificacao} já está no estoque (${comoEntrou}). Nada foi gravado.`);
    }

    // 1. Criar Veículo no estoque
    const { data: veiculo, error: vErr } = await client
        .from('veiculos')
        .insert({
            placa,
            chassi,
            renavam: payload.renavam,
            marca: payload.marca,
            modelo: payload.modelo,
            ano_fabricacao: payload.ano_fabricacao,
            ano_modelo: payload.ano_modelo,
            km: payload.km || 0,
            combustivel: payload.combustivel,
            cor: payload.cor,
            status: 'disponivel',
            origem: 'compra_direta',
            loja_atual: lojaSel,
            custo_aquisicao_inicial: payload.valor_acordado_compra,
            data_entrada: dataContratoParaTimestamp(payload.data_contrato)
        })
        .select()
        .single();

    if (vErr || !veiculo) {
        throw new Error(`Erro ao cadastrar veículo: ${vErr?.message}`);
    }

    // 2. Criar Contrato de Compra
    const { data: contratoCompra, error: cErr } = await client
        .from('contratos_compra')
        .insert({
            veiculo_id: veiculo.id,
            fornecedor_nome: payload.fornecedor_nome,
            fornecedor_cpf_cnpj: payload.fornecedor_cpf_cnpj,
            captador_vendedor: payload.captador_vendedor,
            loja_pagadora: lojaSel,
            valor_acordado_compra: payload.valor_acordado_compra,
            forma_liquidacao: payload.forma_liquidacao,
            data_contrato: payload.data_contrato || hojeIso(),
            observacoes: payload.observacoes
        })
        .select()
        .single();

    if (cErr) {
        await client.from('veiculos').delete().eq('id', veiculo.id);
        throw new Error(`Erro ao cadastrar contrato de compra: ${cErr.message}`);
    }

    // 3. Entradas de compra quando o dinheiro não saiu só da loja do contrato
    if (lancarOrigem) {
        const { error: pcErr } = await client.from('pagamentos_compra').insert(
            origem.map((p) => ({
                veiculo_id: veiculo.id,
                loja: p.loja,
                valor: Number(p.valor),
                forma: payload.forma_liquidacao || null,
                data_pagamento: payload.data_contrato || hojeIso(),
                descricao: 'Origem do dinheiro informada no cadastro da compra'
            }))
        );
        if (pcErr) {
            await client.from('veiculos').delete().eq('id', veiculo.id);
            throw new Error(/pagamentos_compra/.test(pcErr.message)
                ? `Compra não gravada: ${AVISO_MIGRATION}`
                : `Erro ao gravar a origem do dinheiro: ${pcErr.message}`);
        }
    }

    return { veiculo, contratoCompra };
}

// ── CADASTRAR VENDA DE VEÍCULO & CICLO DE PERMUTA ──
export async function cadastrarVendaVeiculo(payload: {
    veiculo_id: string;
    comprador_nome: string;
    comprador_cpf_cnpj?: string;
    vendedor_responsavel?: string;
    loja?: string;
    valor_venda_fechado: number;
    valor_entrada_moeda?: number;
    saldo_devedor?: number;
    data_contrato?: string;
    tem_troca?: boolean;
    troca_placa?: string;
    troca_marca?: string;
    troca_modelo?: string;
    troca_chassi?: string;
    troca_renavam?: string;
    troca_ano_fabricacao?: number;
    troca_ano_modelo?: number;
    troca_km?: number;
    troca_cor?: string;
    troca_combustivel?: string;
    troca_data?: string;
    valor_veiculo_troca?: number;
    pagamentos?: PagamentoVenda[];
    comissao_vendedor?: number;
    imposto_nf?: number;
    pct_alexandre?: number;
    pct_ivo?: number;
    observacoes?: string;
}) {
    const client = supabaseAdmin || supabase;
    const lojaSel = payload.loja || 'manos';

    // 1. Obter veículo atual
    const { data: veiculo, error: vFetchErr } = await client
        .from('veiculos')
        .select('*, custos_adicionais(*), contratos_compra(id), contratos_venda!contratos_venda_veiculo_id_fkey(id)')
        .eq('id', payload.veiculo_id)
        .single();

    if (vFetchErr || !veiculo) {
        throw new Error('Veículo não encontrado para venda.');
    }
    if (veiculo.status === 'vendido' || (veiculo.contratos_venda || []).length > 0) {
        throw new Error(`A venda do veículo ${veiculo.placa || veiculo.modelo} já foi registrada. Nada foi gravado.`);
    }

    const dataContrato = payload.data_contrato || hojeIso();
    const valorTroca = Number(payload.valor_veiculo_troca || 0);
    const temTroca = !!payload.tem_troca && valorTroca > 0 && !!(payload.troca_modelo || payload.troca_placa);

    // 2. CICLO DA PERMUTA: o carro recebido na troca entra no estoque com custo = valor da troca
    let trocaVeiculoGeradoId: string | null = null;
    let trocaCriadaAgora = false;

    if (temTroca) {
        const placaTroca = limparPlaca(payload.troca_placa);
        const chassiTroca = limparChassi(payload.troca_chassi);
        const existente = await buscarVeiculoExistente(client, placaTroca, chassiTroca);

        if (existente && existente.status === 'vendido') {
            throw new Error(`O carro da troca (${existente.placa || existente.chassi}) já passou pela loja e foi vendido. Recompra do mesmo carro precisa de ajuste manual.`);
        }

        if (existente) {
            trocaVeiculoGeradoId = existente.id;
        } else {
            const { data: veiculoTroca, error: trocaErr } = await client
                .from('veiculos')
                .insert({
                    placa: placaTroca,
                    chassi: chassiTroca,
                    renavam: payload.troca_renavam,
                    marca: payload.troca_marca || (payload.troca_modelo || '').split(' ')[0] || 'Permuta',
                    modelo: payload.troca_modelo || 'Veículo de troca',
                    ano_fabricacao: payload.troca_ano_fabricacao,
                    ano_modelo: payload.troca_ano_modelo,
                    km: payload.troca_km || 0,
                    cor: payload.troca_cor,
                    combustivel: payload.troca_combustivel,
                    status: 'disponivel',
                    origem: 'permuta_troca',
                    loja_atual: lojaSel,
                    custo_aquisicao_inicial: valorTroca,
                    data_entrada: dataContratoParaTimestamp(payload.troca_data || dataContrato)
                })
                .select()
                .single();

            if (trocaErr || !veiculoTroca) {
                throw new Error(`Erro ao cadastrar o carro da troca: ${trocaErr?.message}`);
            }
            trocaVeiculoGeradoId = veiculoTroca.id;
            trocaCriadaAgora = true;
        }
    }

    // 3. Cadastrar Contrato de Venda
    const { data: contratoVenda, error: cvErr } = await client
        .from('contratos_venda')
        .insert({
            veiculo_id: payload.veiculo_id,
            comprador_nome: payload.comprador_nome,
            comprador_cpf_cnpj: payload.comprador_cpf_cnpj,
            vendedor_responsavel: payload.vendedor_responsavel,
            loja_recebedora: lojaSel,
            valor_venda_fechado: payload.valor_venda_fechado,
            valor_entrada_moeda: payload.valor_entrada_moeda || 0,
            valor_veiculo_troca: temTroca ? valorTroca : 0,
            tem_troca: temTroca,
            troca_placa: temTroca ? limparPlaca(payload.troca_placa) : null,
            troca_modelo: temTroca ? payload.troca_modelo : null,
            troca_veiculo_gerado_id: trocaVeiculoGeradoId,
            saldo_devedor: payload.saldo_devedor || 0,
            data_contrato: dataContrato,
            observacoes: payload.observacoes
        })
        .select()
        .single();

    if (cvErr || !contratoVenda) {
        if (trocaCriadaAgora && trocaVeiculoGeradoId) {
            await client.from('veiculos').delete().eq('id', trocaVeiculoGeradoId);
        }
        throw new Error(`Erro ao registrar contrato de venda: ${cvErr?.message}`);
    }

    // 3b. Contrato de compra do carro da troca (fornecedor = o próprio comprador)
    if (trocaCriadaAgora && trocaVeiculoGeradoId) {
        const { error: ccTrocaErr } = await client.from('contratos_compra').insert({
            veiculo_id: trocaVeiculoGeradoId,
            fornecedor_nome: payload.comprador_nome,
            fornecedor_cpf_cnpj: payload.comprador_cpf_cnpj,
            captador_vendedor: payload.vendedor_responsavel,
            loja_pagadora: lojaSel,
            valor_acordado_compra: valorTroca,
            forma_liquidacao: 'Troca (permuta)',
            data_contrato: payload.troca_data || dataContrato,
            observacoes: `Recebido na troca da venda do veículo ${veiculo.placa || veiculo.modelo}`
        });
        if (ccTrocaErr) console.error('Erro ao registrar compra do carro da troca:', ccTrocaErr);
    }

    // 3c. Composição do pagamento (troca + dinheiro)
    const pagamentos: PagamentoVenda[] = (payload.pagamentos || []).filter(
        (p) => TIPOS_PAGAMENTO.includes(p.tipo_pagamento) && p.tipo_pagamento !== 'permuta_veiculo' && Number(p.valor) > 0
    );
    if (temTroca) {
        pagamentos.unshift({
            tipo_pagamento: 'permuta_veiculo',
            valor: valorTroca,
            descricao: `Troca: ${payload.troca_modelo || ''} ${limparPlaca(payload.troca_placa) || ''}`.trim(),
            data_pagamento: payload.troca_data || dataContrato
        });
    }
    if (pagamentos.length > 0) {
        const { error: pgErr } = await client.from('pagamentos_contrato').insert(
            pagamentos.map((p) => ({
                contrato_venda_id: contratoVenda.id,
                tipo_pagamento: p.tipo_pagamento,
                loja_conta: lojaSel,
                valor: p.valor,
                descricao: p.descricao,
                data_pagamento: p.data_pagamento || dataContrato
            }))
        );
        if (pgErr) console.error('Erro ao registrar pagamentos do contrato:', pgErr);
    }

    // 4. Atualizar status do veículo para 'vendido'
    await client
        .from('veiculos')
        .update({
            status: 'vendido',
            data_venda: dataContratoParaTimestamp(payload.data_contrato)
        })
        .eq('id', payload.veiculo_id);

    // 5. Soma dos custos extras existentes
    const totalCustosExtras = (veiculo.custos_adicionais || []).reduce(
        (sum: number, c: any) => sum + Number(c.valor || 0),
        0
    );

    // 6. Calcular Lucro e Cotas Societárias
    const calc = calcularFechamento({
        custoAquisicao: veiculo.custo_aquisicao_inicial,
        valorVenda: payload.valor_venda_fechado,
        comissaoVendedor: payload.comissao_vendedor ?? comissaoAutomatica(payload.valor_venda_fechado, veiculo.custo_aquisicao_inicial),
        impostoNf: payload.imposto_nf || 0,
        totalCustosExtras,
        pctAlexandre: payload.pct_alexandre,
        pctIvo: payload.pct_ivo
    });

    // 7. Upsert na tabela de Fechamento de Lucro
    const { data: fechamento, error: fErr } = await client
        .from('fechamentos_lucro')
        .upsert({
            veiculo_id: payload.veiculo_id,
            contrato_compra_id: (veiculo.contratos_compra || [])[0]?.id || null,
            contrato_venda_id: contratoVenda.id,
            custo_aquisicao: veiculo.custo_aquisicao_inicial,
            valor_venda: payload.valor_venda_fechado,
            lucro_bruto: calc.lucroBruto,
            comissao_vendedor: calc.comissaoVendedor,
            imposto_nf: calc.impostoNf,
            total_custos_extras: totalCustosExtras,
            lucro_liquido: calc.lucroLiquido,
            pct_alexandre: calc.pctAlexandre,
            cota_alexandre: calc.cotaAlexandre,
            pct_ivo: calc.pctIvo,
            cota_ivo: calc.cotaIvo,
            status_fechamento: 'liquidado',
            data_fechamento: new Date().toISOString()
        }, { onConflict: 'veiculo_id' })
        .select()
        .single();

    if (fErr) {
        console.error('Erro ao registrar fechamento de lucro:', fErr);
    }

    return { contratoVenda, fechamento, trocaVeiculoGeradoId };
}

const CATEGORIAS_CUSTO: CustoAdicional['categoria'][] = ['oficina', 'vistoria', 'polimento', 'transferencia', 'guincho', 'outros'];

// ── AJUSTAR GASTOS, COMISSÃO E PARTILHA (vale também depois da venda, até os dois aprovarem) ──
// Não mexe no contrato: sincroniza os gastos e reapura o fechamento existente.
export async function ajustarApuracaoVeiculo(payload: {
    veiculo_id: string;
    comissao_vendedor?: number;
    imposto_nf?: number;
    pct_alexandre?: number;
    pct_ivo?: number;
    custos?: Array<{ id?: string; categoria: CustoAdicional['categoria']; descricao: string; valor: number; data_custo?: string }>;
}) {
    const client = supabaseAdmin || supabase;

    const { data: veiculo, error: vErr } = await client
        .from('veiculos')
        .select('*, custos_adicionais(id), contratos_compra(id), contratos_venda!contratos_venda_veiculo_id_fkey(id, valor_venda_fechado), fechamentos_lucro(*)')
        .eq('id', payload.veiculo_id)
        .single();

    if (vErr || !veiculo) {
        throw new Error('Veículo não encontrado.');
    }
    if (veiculo.aprovado_alexandre_em && veiculo.aprovado_ivo_em) {
        throw new Error('Operação aprovada pelos dois sócios: está travada e não pode mais ser alterada.');
    }

    // 1. Valida tudo antes de gravar qualquer coisa
    for (const c of payload.custos || []) {
        if (!CATEGORIAS_CUSTO.includes(c.categoria)) throw new Error(`Categoria de gasto inválida: ${c.categoria}`);
        if (!c.descricao?.trim()) throw new Error('Todo gasto precisa de descrição.');
        if (!(Number(c.valor) > 0)) throw new Error(`Informe o valor do gasto "${c.descricao}".`);
    }
    if (payload.comissao_vendedor !== undefined && !(Number(payload.comissao_vendedor) >= 0)) {
        throw new Error('Comissão inválida.');
    }
    if (payload.imposto_nf !== undefined && !(Number(payload.imposto_nf) >= 0)) {
        throw new Error('Imposto inválido.');
    }
    if (payload.pct_alexandre !== undefined && payload.pct_ivo !== undefined
        && Math.abs(Number(payload.pct_alexandre) + Number(payload.pct_ivo) - 100) > 0.01) {
        throw new Error('A partilha entre Alexandre e Ivo precisa somar 100%.');
    }

    // 2. Sincroniza os gastos: some da lista = remove, com id = altera, sem id = novo
    if (payload.custos) {
        const idsAtuais: string[] = (veiculo.custos_adicionais || []).map((c: any) => c.id);
        const idsMantidos = payload.custos.map((c) => c.id).filter(Boolean) as string[];

        const remover = idsAtuais.filter((id) => !idsMantidos.includes(id));
        if (remover.length > 0) {
            const { error } = await client.from('custos_adicionais').delete().in('id', remover);
            if (error) throw new Error(`Erro ao remover gasto: ${error.message}`);
        }

        for (const c of payload.custos.filter((c) => c.id && idsAtuais.includes(c.id))) {
            const { error } = await client
                .from('custos_adicionais')
                .update({
                    categoria: c.categoria,
                    descricao: c.descricao.trim(),
                    valor: Number(c.valor),
                    data_custo: c.data_custo || undefined
                })
                .eq('id', c.id)
                .eq('veiculo_id', veiculo.id);
            if (error) throw new Error(`Erro ao alterar gasto "${c.descricao}": ${error.message}`);
        }

        const novos = payload.custos.filter((c) => !c.id);
        if (novos.length > 0) {
            const { error } = await client.from('custos_adicionais').insert(
                novos.map((c) => ({
                    veiculo_id: veiculo.id,
                    categoria: c.categoria,
                    descricao: c.descricao.trim(),
                    valor: Number(c.valor),
                    data_custo: c.data_custo || hojeIso(),
                    loja_pagadora: veiculo.loja_atual || 'manos'
                }))
            );
            if (error) throw new Error(`Erro ao adicionar gasto: ${error.message}`);
        }
    }

    // 3. Ainda em estoque: gastos ficam guardados e entram na apuração quando vender
    const contratoVenda = (veiculo.contratos_venda || [])[0];
    if (!contratoVenda) {
        return { fechamento: null };
    }

    const { data: custos } = await client.from('custos_adicionais').select('valor').eq('veiculo_id', veiculo.id);
    const totalCustosExtras = (custos || []).reduce((sum: number, c: any) => sum + Number(c.valor || 0), 0);
    const atual = Array.isArray(veiculo.fechamentos_lucro) ? veiculo.fechamentos_lucro[0] : veiculo.fechamentos_lucro;

    const calc = calcularFechamento({
        custoAquisicao: veiculo.custo_aquisicao_inicial,
        valorVenda: contratoVenda.valor_venda_fechado,
        comissaoVendedor: payload.comissao_vendedor ?? atual?.comissao_vendedor,
        impostoNf: payload.imposto_nf ?? atual?.imposto_nf,
        totalCustosExtras,
        pctAlexandre: payload.pct_alexandre ?? atual?.pct_alexandre,
        pctIvo: payload.pct_ivo ?? atual?.pct_ivo
    });

    const { data: fechamento, error: fErr } = await client
        .from('fechamentos_lucro')
        .upsert({
            veiculo_id: veiculo.id,
            contrato_compra_id: atual?.contrato_compra_id ?? (veiculo.contratos_compra || [])[0]?.id ?? null,
            contrato_venda_id: contratoVenda.id,
            custo_aquisicao: veiculo.custo_aquisicao_inicial,
            valor_venda: contratoVenda.valor_venda_fechado,
            lucro_bruto: calc.lucroBruto,
            comissao_vendedor: calc.comissaoVendedor,
            imposto_nf: calc.impostoNf,
            total_custos_extras: totalCustosExtras,
            lucro_liquido: calc.lucroLiquido,
            pct_alexandre: calc.pctAlexandre,
            cota_alexandre: calc.cotaAlexandre,
            pct_ivo: calc.pctIvo,
            cota_ivo: calc.cotaIvo,
            status_fechamento: 'liquidado',
            data_fechamento: atual?.data_fechamento ?? new Date().toISOString(),
            updated_at: new Date().toISOString()
        }, { onConflict: 'veiculo_id' })
        .select()
        .single();

    if (fErr) {
        throw new Error(`Gastos salvos, mas falhou a reapuração do lucro: ${fErr.message}`);
    }

    return { fechamento };
}

// ── ENTRADA DE COMPRA: de qual caixa saiu o dinheiro de um carro ──
export async function registrarEntradaCompra(payload: {
    veiculo_id: string;
    loja: Loja;
    valor: number;
    forma?: string;
    data_pagamento?: string;
    descricao?: string;
    registrado_por?: string;
}) {
    const client = supabaseAdmin || supabase;

    if (!payload.veiculo_id) throw new Error('Escolha o veículo da entrada.');
    if (!LOJAS.includes(payload.loja)) throw new Error('Escolha de qual caixa saiu o dinheiro.');
    const valor = Number(payload.valor);
    if (!(valor > 0)) throw new Error('Informe o valor da entrada.');

    const { data: veiculo, error } = await client
        .from('veiculos')
        .select('*, pagamentos_compra(valor)')
        .eq('id', payload.veiculo_id)
        .single();

    if (error) {
        throw new Error(/pagamentos_compra/.test(error.message) ? AVISO_MIGRATION : 'Veículo não encontrado.');
    }
    if (!veiculo) {
        throw new Error('Veículo não encontrado.');
    }
    if (veiculo.aprovado_alexandre_em && veiculo.aprovado_ivo_em) {
        throw new Error('Operação aprovada pelos dois sócios: está travada e não aceita nova entrada.');
    }

    const custo = Number(veiculo.custo_aquisicao_inicial || 0);
    const lancado = (veiculo.pagamentos_compra || []).reduce((s: number, p: any) => s + Number(p.valor || 0), 0);
    if (lancado + valor > custo + 0.01) {
        throw new Error(`Passa do custo da compra: ${brl(lancado)} já lançado de ${brl(custo)} (cabe mais ${brl(Math.max(custo - lancado, 0))}).`);
    }

    const { data, error: insErr } = await client
        .from('pagamentos_compra')
        .insert({
            veiculo_id: payload.veiculo_id,
            loja: payload.loja,
            valor,
            forma: payload.forma || null,
            data_pagamento: payload.data_pagamento || hojeIso(),
            descricao: payload.descricao || null,
            registrado_por: payload.registrado_por || null
        })
        .select()
        .single();

    if (insErr) {
        throw new Error(`Erro ao lançar entrada de compra: ${insErr.message}`);
    }

    return data;
}

export async function removerEntradaCompra(id: string) {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client.from('pagamentos_compra').delete().eq('id', id).select('id');

    if (error) {
        throw new Error(error.message);
    }
    if (!data || data.length === 0) {
        throw new Error('Entrada de compra não encontrada.');
    }
}

// ── APROVAÇÃO DUPLA DA OPERAÇÃO ──
// Cada sócio aprova o seu lado; com os dois, o banco trava a operação (trigger da migration 20260917).
export async function aprovarOperacao(payload: { veiculo_id: string; socio: NomeSocio; acao: 'aprovar' | 'desfazer' }) {
    const client = supabaseAdmin || supabase;
    const coluna = payload.socio === 'Alexandre' ? 'aprovado_alexandre_em' : 'aprovado_ivo_em';

    const { data: veiculo, error } = await client
        .from('veiculos')
        .select('*, contratos_venda!contratos_venda_veiculo_id_fkey(id), fechamentos_lucro(id)')
        .eq('id', payload.veiculo_id)
        .single();

    if (error || !veiculo) {
        throw new Error('Veículo não encontrado.');
    }
    if (!('aprovado_alexandre_em' in veiculo)) {
        throw new Error(AVISO_MIGRATION);
    }
    const fechamento = Array.isArray(veiculo.fechamentos_lucro) ? veiculo.fechamentos_lucro[0] : veiculo.fechamentos_lucro;
    if ((veiculo.contratos_venda || []).length === 0 || !fechamento) {
        throw new Error('Só dá pra aprovar depois que a venda estiver registrada.');
    }
    if (veiculo.aprovado_alexandre_em && veiculo.aprovado_ivo_em) {
        throw new Error('Operação já aprovada pelos dois sócios. Está travada.');
    }

    const { data: atualizado, error: upErr } = await client
        .from('veiculos')
        .update({ [coluna]: payload.acao === 'aprovar' ? new Date().toISOString() : null })
        .eq('id', payload.veiculo_id)
        .select('aprovado_alexandre_em, aprovado_ivo_em')
        .single();

    if (upErr || !atualizado) {
        throw new Error(`Erro ao registrar aprovação: ${upErr?.message}`);
    }

    return {
        aprovado_alexandre_em: atualizado.aprovado_alexandre_em,
        aprovado_ivo_em: atualizado.aprovado_ivo_em,
        travada: !!(atualizado.aprovado_alexandre_em && atualizado.aprovado_ivo_em)
    };
}

// ── REGISTRAR ACERTO ENTRE EMPRESAS ──
export async function registrarAcertoEmpresas(payload: {
    de_loja: Loja;
    para_loja: Loja;
    valor: number;
    data_acerto?: string;
    descricao?: string;
    registrado_por?: string;
}) {
    const client = supabaseAdmin || supabase;

    if (!LOJAS.includes(payload.de_loja) || !LOJAS.includes(payload.para_loja) || payload.de_loja === payload.para_loja) {
        throw new Error('Informe de qual empresa pra qual empresa foi o pagamento.');
    }
    if (!(Number(payload.valor) > 0)) {
        throw new Error('Informe o valor do acerto.');
    }

    const { data, error } = await client
        .from('acertos_empresas')
        .insert({
            de_loja: payload.de_loja,
            para_loja: payload.para_loja,
            valor: Number(payload.valor),
            data_acerto: payload.data_acerto || hojeIso(),
            descricao: payload.descricao || null,
            registrado_por: payload.registrado_por || null
        })
        .select()
        .single();

    if (error) {
        throw new Error(/acertos_empresas/.test(error.message) ? AVISO_MIGRATION : `Erro ao registrar acerto: ${error.message}`);
    }

    return data;
}

// ── REGISTRAR RETIRADA DE SÓCIO ──
export async function registrarRetiradaSocio(payload: {
    socio_email: string;
    socio_nome: string;
    valor: number;
    descricao?: string;
    data_retirada?: string;
    loja_caixa?: Loja;
}) {
    const client = supabaseAdmin || supabase;

    if (payload.loja_caixa && !LOJAS.includes(payload.loja_caixa)) {
        throw new Error('Caixa da retirada inválido.');
    }

    const { data, error } = await client
        .from('retiradas_socios')
        .insert({
            socio_email: payload.socio_email.toLowerCase(),
            socio_nome: payload.socio_nome,
            valor: payload.valor,
            descricao: payload.descricao,
            data_retirada: payload.data_retirada || hojeIso(),
            loja_caixa: payload.loja_caixa || (socioDaRetirada(payload) === 'Ivo' ? 'v3' : 'manos')
        })
        .select()
        .single();

    if (error) {
        throw new Error(`Erro ao registrar retirada: ${error.message}`);
    }

    return data;
}

// ── EXCLUIR LANÇAMENTOS ERRADOS (retirada e acerto não entram na trava de aprovação) ──
export async function removerRetiradaSocio(id: string) {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client.from('retiradas_socios').delete().eq('id', id).select('id');

    if (error) {
        throw new Error(`Erro ao excluir retirada: ${error.message}`);
    }
    if (!data || data.length === 0) {
        throw new Error('Retirada não encontrada.');
    }
}

export async function removerAcertoEmpresas(id: string) {
    const client = supabaseAdmin || supabase;
    const { data, error } = await client.from('acertos_empresas').delete().eq('id', id).select('id');

    if (error) {
        throw new Error(`Erro ao excluir acerto: ${error.message}`);
    }
    if (!data || data.length === 0) {
        throw new Error('Acerto não encontrado.');
    }
}
