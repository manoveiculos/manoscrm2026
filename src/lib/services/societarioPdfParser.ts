export type TipoPagamento = 'ted' | 'dda' | 'pix' | 'dinheiro' | 'permuta_veiculo' | 'financiamento';

export interface VeiculoContrato {
    descricao?: string;
    marca?: string;
    modelo?: string;
    placa?: string;
    chassi?: string;
    renavam?: string;
    anoFabricacao?: number;
    anoModelo?: number;
    km?: number;
    cor?: string;
    combustivel?: string;
    valorNegociado?: number;
    dataNegociacao?: string; // yyyy-mm-dd
}

export interface LancamentoFechamento {
    tipo: 'veiculo_vendido' | 'veiculo_comprado' | 'entrada' | 'saida' | 'outro';
    descricao: string;
    valor: number;
    forma?: string;
    tipoPagamento?: TipoPagamento;
    placa?: string;
    data?: string; // yyyy-mm-dd
}

export interface ParsedContratoResult {
    tipo: 'compra' | 'venda' | 'desconhecido';
    lojaDetectada?: 'manos' | 'v3';
    empresaRazaoSocial?: string;
    empresaCnpj?: string;
    dataContrato?: string; // yyyy-mm-dd
    vendedorCaptador?: string;
    nomeParteInversa?: string; // Cliente: fornecedor na compra, comprador na venda
    cpfCnpjParteInversa?: string;
    cidadeParteInversa?: string;

    // Veículo principal (comprado ou vendido)
    placa?: string;
    chassi?: string;
    renavam?: string;
    marcaModelo?: string;
    marca?: string;
    modelo?: string;
    anoFabricacao?: number;
    anoModelo?: number;
    km?: number;
    combustivel?: string;
    cor?: string;
    valorTotal?: number;

    // Tabela de fechamento
    lancamentos: LancamentoFechamento[];
    saldo?: number;
    formaLiquidacao?: string;
    valorEntradaMoeda?: number;

    // Veículo recebido na troca (só venda)
    temTroca: boolean;
    troca?: VeiculoContrato;
    valorTroca?: number;
    trocaPlaca?: string;
    trocaModelo?: string;

    alertas: string[];
}

// ── Rótulos do layout do contrato (Empresa / Cliente / Veículo) ──
// Ordem importa: o mais longo primeiro, senão "Proprietário" engole "Proprietário no momento...".
const ROTULOS = [
    'Proprietário no momento da negociação',
    'Razão Social',
    'Data negociação',
    'Valor negociado',
    'Ano Fab./Mod.',
    'Retirado em',
    'Recebido em',
    'Data nasc.',
    'Nr. motor',
    'Combustível',
    'Proprietário',
    'Profissão',
    'Potência',
    'Telefone',
    'Vendedor',
    'Endereço',
    'Renavam',
    'Veículo',
    'Chassi',
    'Bairro',
    'Cidade',
    'Email',
    'Placa',
    'Nome',
    'CNPJ',
    'CPF',
    'CEP',
    'COM',
    'CEL',
    'Cor',
    'KM',
    'RG',
];

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const REGEX_ROTULO = new RegExp(`(?:^|\\s)(${ROTULOS.map(escaparRegex).join('|')}):`, 'gi');
const REGEX_PLACA = /^[A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}$/i;
const REGEX_DATA = /(\d{2})\/(\d{2})\/(\d{4})/;
const REGEX_MOEDA = /R\$\s*(-?[\d.]+,\d{2})/g;

const MARCAS_COMPOSTAS = ['land rover', 'alfa romeo', 'aston martin', 'rolls royce', 'great wall', 'mercedes benz'];
const PARTICULAS_NOME = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);

type Secao = 'cabecalho' | 'empresa' | 'cliente' | 'principal' | 'troca' | 'fechamento' | 'fim';
type Campos = Record<string, string>;

function semAcento(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function chave(rotulo: string): string {
    return semAcento(rotulo).toLowerCase();
}

function camposDaLinha(linha: string): Array<[string, string]> {
    const achados = Array.from(linha.matchAll(REGEX_ROTULO));
    return achados.map((m, i) => {
        const inicioValor = m.index! + m[0].length;
        const fim = i + 1 < achados.length ? achados[i + 1].index! : linha.length;
        return [chave(m[1]), linha.slice(inicioValor, fim).trim()];
    });
}

function moeda(valor?: string): number | undefined {
    if (!valor) return undefined;
    const n = Number(valor.replace(/R\$\s*/, '').replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
}

function inteiro(valor?: string): number | undefined {
    const digitos = valor?.replace(/\D/g, '');
    return digitos ? parseInt(digitos, 10) : undefined;
}

function dataIso(valor?: string): string | undefined {
    const m = valor?.match(REGEX_DATA);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
}

function normalizarPlaca(valor?: string): string | undefined {
    const placa = valor?.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return placa || undefined;
}

function nomeProprio(valor?: string): string | undefined {
    if (!valor) return undefined;
    return valor
        .toLowerCase()
        .split(/\s+/)
        .map((p, i) => (i > 0 && PARTICULAS_NOME.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
        .join(' ');
}

function separarMarcaModelo(descricao?: string): { marca?: string; modelo?: string } {
    if (!descricao) return {};
    // "GWM Haval - H6 GT 1.5 AWD (Hibrido)" → marca "GWM", modelo "Haval H6 GT 1.5 AWD (Hibrido)"
    const limpo = descricao.replace(/\s+-\s+/g, ' ').replace(/\s+/g, ' ').trim();
    const composta = MARCAS_COMPOSTAS.find((m) => limpo.toLowerCase().startsWith(m + ' '));
    const palavrasMarca = composta ? composta.split(' ').length : 1;
    const partes = limpo.split(' ');
    return {
        marca: partes.slice(0, palavrasMarca).join(' '),
        modelo: partes.slice(palavrasMarca).join(' ') || limpo,
    };
}

function mapearFormaPagamento(forma?: string): TipoPagamento | undefined {
    const f = semAcento(forma || '').toLowerCase();
    if (/\b(ted|doc)\b|transfer/.test(f)) return 'ted';
    if (/\bdda\b|boleto/.test(f)) return 'dda';
    if (/\bpix\b/.test(f)) return 'pix';
    if (/dinheiro|especie/.test(f)) return 'dinheiro';
    if (/financ/.test(f)) return 'financiamento';
    return undefined;
}

function montarVeiculo(c: Campos): VeiculoContrato {
    const anos = c['ano fab./mod.']?.match(/(\d{4})\s*\/\s*(\d{4})/);
    return {
        descricao: c['veiculo'] || undefined,
        ...separarMarcaModelo(c['veiculo']),
        placa: normalizarPlaca(c['placa']),
        chassi: c['chassi']?.toUpperCase().replace(/\s/g, '') || undefined,
        renavam: c['renavam']?.replace(/\D/g, '') || undefined,
        anoFabricacao: anos ? parseInt(anos[1], 10) : undefined,
        anoModelo: anos ? parseInt(anos[2], 10) : undefined,
        km: inteiro(c['km']),
        cor: c['cor'] || undefined,
        combustivel: c['combustivel'] || undefined,
        valorNegociado: moeda(c['valor negociado']),
        dataNegociacao: dataIso(c['data negociacao']),
    };
}

type LinhaFechamento = { lancamento: LancamentoFechamento } | { saldo: number } | null;

function lerLinhaFechamento(linha: string): LinhaFechamento {
    const valores = Array.from(linha.matchAll(REGEX_MOEDA));
    if (valores.length === 0) return null;

    const descricao = linha.slice(0, valores[0].index).trim();
    const valor = moeda(valores[0][1]) ?? 0;

    if (/^saldo$/i.test(descricao)) return { saldo: valor };
    if (/^subtotais$/i.test(descricao)) return null;

    const veiculo = descricao.match(/^Ve[íi]culo (Vendido|Comprado) - Placa\s+(\S+)/i);
    if (veiculo) {
        const vendido = /vendido/i.test(veiculo[1]);
        return {
            lancamento: {
                tipo: vendido ? 'veiculo_vendido' : 'veiculo_comprado',
                descricao,
                valor,
                placa: normalizarPlaca(veiculo[2]),
                tipoPagamento: vendido ? undefined : 'permuta_veiculo',
            },
        };
    }

    // "Entrada - Veículo - DOC/TED - SXD5H10 - 05/09/2026" / "Saída - Veículo - DDA - SXD5H10 - 14/08/2026"
    const partes = descricao.split(/\s+-\s+/);
    const direcao = semAcento(partes[0] || '').toLowerCase();
    if (direcao === 'entrada' || direcao === 'saida') {
        const resto = partes.slice(1);
        const data = resto.find((p) => REGEX_DATA.test(p));
        const placa = resto.find((p) => REGEX_PLACA.test(p));
        const forma = resto.filter((p) => p !== data && p !== placa && !/^ve[íi]culo$/i.test(p)).join(' - ') || undefined;
        return {
            lancamento: {
                tipo: direcao === 'entrada' ? 'entrada' : 'saida',
                descricao,
                valor,
                forma,
                tipoPagamento: mapearFormaPagamento(forma) ?? mapearFormaPagamento(descricao),
                placa: normalizarPlaca(placa),
                data: dataIso(data),
            },
        };
    }

    return { lancamento: { tipo: 'outro', descricao, valor, tipoPagamento: mapearFormaPagamento(descricao) } };
}

const brl = (v?: number) => `R$ ${(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

export function parseContratoTexto(texto: string): ParsedContratoResult {
    const linhas = texto.replace(/\r\n?/g, '\n').replace(/\t/g, ' ').split('\n');
    const alertas: string[] = [];

    const campos: Record<Exclude<Secao, 'fechamento' | 'fim'>, Campos> = {
        cabecalho: {},
        empresa: {},
        cliente: {},
        principal: {},
        troca: {},
    };
    const lancamentos: LancamentoFechamento[] = [];
    let saldo: number | undefined;
    let tipoPorTitulo: 'compra' | 'venda' | undefined;
    let tipoPorSecao: 'compra' | 'venda' | undefined;
    let secao: Secao = 'cabecalho';

    for (const bruta of linhas) {
        const linha = bruta.replace(/\s+/g, ' ').trim();
        if (!linha) continue;

        if (/^Empresa$/i.test(linha)) { secao = 'empresa'; continue; }
        if (/^Cliente$/i.test(linha)) { secao = 'cliente'; continue; }
        const cabecalhoVeiculo = linha.match(/^Ve[íi]culo (comprado|vendido)$/i);
        if (cabecalhoVeiculo) {
            secao = 'principal';
            tipoPorSecao = /comprado/i.test(cabecalhoVeiculo[1]) ? 'compra' : 'venda';
            continue;
        }
        if (/^Ve[íi]culo da troca$/i.test(linha)) { secao = 'troca'; continue; }
        if (/^Fechamento\b/i.test(linha)) { secao = 'fechamento'; continue; }
        if (/^Cl[áa]usulas Contratuais/i.test(linha) || /^\d+ª\s/.test(linha)) secao = 'fim';

        if (secao === 'fim') continue;

        if (secao === 'cabecalho') {
            const titulo = linha.match(/Contrato de (Compra|Venda)/i);
            if (titulo && !tipoPorTitulo) tipoPorTitulo = /compra/i.test(titulo[1]) ? 'compra' : 'venda';
        }

        if (secao === 'fechamento') {
            const lido = lerLinhaFechamento(linha);
            if (lido && 'saldo' in lido) saldo = lido.saldo;
            else if (lido) lancamentos.push(lido.lancamento);
            continue;
        }

        for (const [k, v] of camposDaLinha(linha)) {
            if (v && !(k in campos[secao])) campos[secao][k] = v;
        }
    }

    // Texto colado sem os cabeçalhos de seção: lê tudo como se fosse um bloco só.
    const semSecoes = Object.keys(campos.principal).length === 0;
    if (semSecoes) {
        for (const bruta of linhas) {
            for (const [k, v] of camposDaLinha(bruta.replace(/\s+/g, ' ').trim())) {
                if (v && !(k in campos.principal)) campos.principal[k] = v;
            }
        }
        campos.empresa = campos.principal;
        campos.cliente = campos.principal;
        const titulo = texto.match(/Contrato de (Compra|Venda)/i);
        if (titulo) tipoPorTitulo = /compra/i.test(titulo[1]) ? 'compra' : 'venda';
    }

    // ── Tipo do contrato ──
    const tipo = tipoPorSecao ?? tipoPorTitulo ?? 'desconhecido';
    if (tipoPorSecao && tipoPorTitulo && tipoPorSecao !== tipoPorTitulo) {
        alertas.push(`Título diz "Contrato de ${tipoPorTitulo}" mas o quadro diz "Veículo ${tipoPorSecao === 'compra' ? 'comprado' : 'vendido'}". Confira o tipo.`);
    }
    if (tipo === 'desconhecido') {
        alertas.push('Não identifiquei se é contrato de compra ou de venda. Escolha no formulário.');
    }

    // ── Empresa / loja ──
    const empresaRazaoSocial = campos.empresa['razao social'];
    const empresaCnpj = campos.empresa['cnpj'];
    let lojaDetectada: 'manos' | 'v3' = 'manos';
    if (empresaRazaoSocial && /\bV3\b/i.test(empresaRazaoSocial)) {
        lojaDetectada = 'v3';
    } else if (empresaRazaoSocial && !/RACCAR|MANO/i.test(empresaRazaoSocial) && empresaCnpj !== '28.918.081/0001-22') {
        alertas.push(`Empresa "${empresaRazaoSocial}" não reconhecida — confirme a loja (Manos ou V3).`);
    }

    // ── Cliente (parte inversa) ──
    const nomeParteInversa = campos.cliente['nome'];
    const cpfCnpjParteInversa = semSecoes
        ? Array.from(texto.matchAll(/(?:CPF|CNPJ):\s*([\d./-]{14,18})/gi)).map((m) => m[1]).find((d) => d !== empresaCnpj)
        : campos.cliente['cpf'] || campos.cliente['cnpj'];

    // ── Veículos ──
    const principal = montarVeiculo(campos.principal);
    let troca: VeiculoContrato | undefined = Object.keys(campos.troca).length > 0 ? montarVeiculo(campos.troca) : undefined;

    const lancTroca = lancamentos.find((l) => l.tipo === 'veiculo_comprado');
    if (tipo === 'venda' && lancTroca) {
        if (!troca) {
            troca = { placa: lancTroca.placa, valorNegociado: lancTroca.valor };
        } else if (troca.valorNegociado === undefined) {
            troca.valorNegociado = lancTroca.valor;
        } else if (Math.abs(troca.valorNegociado - lancTroca.valor) > 0.5) {
            alertas.push(`Valor da troca diverge: quadro do veículo ${brl(troca.valorNegociado)} x fechamento ${brl(lancTroca.valor)}.`);
        }
    }

    const lancPrincipal = lancamentos.find((l) => l.tipo === (tipo === 'venda' ? 'veiculo_vendido' : 'veiculo_comprado'));
    const valorTotal = principal.valorNegociado ?? lancPrincipal?.valor;

    // ── Pagamentos ──
    const pagamentos = lancamentos.filter((l) => l.tipo === (tipo === 'venda' ? 'entrada' : 'saida'));
    const formas = Array.from(new Set(pagamentos.map((l) => l.forma).filter(Boolean)));
    const formaLiquidacao = formas.length > 0 ? formas.join(' + ') : undefined;
    const totalPagamentos = pagamentos.reduce((s, l) => s + l.valor, 0);

    for (const l of lancamentos) {
        if ((l.tipo === 'entrada' || l.tipo === 'saida' || l.tipo === 'outro') && !l.tipoPagamento) {
            alertas.push(`Forma de pagamento não reconhecida em "${l.descricao}" (${brl(l.valor)}) — lance manualmente.`);
        }
    }

    // ── Conferência do fechamento ──
    if (valorTotal !== undefined && lancamentos.length > 0) {
        const trocaValor = tipo === 'venda' ? troca?.valorNegociado ?? 0 : 0;
        const conferido = trocaValor + totalPagamentos + (saldo ?? 0);
        if (Math.abs(conferido - valorTotal) > 0.5) {
            alertas.push(
                tipo === 'venda'
                    ? `Fechamento não bate: venda ${brl(valorTotal)} ≠ troca ${brl(trocaValor)} + pagamentos ${brl(totalPagamentos)} + saldo ${brl(saldo)}.`
                    : `Fechamento não bate: compra ${brl(valorTotal)} ≠ pagamentos ${brl(totalPagamentos)} + saldo ${brl(saldo)}.`
            );
        }
    }
    if (saldo && saldo > 0) {
        alertas.push(`Contrato com saldo em aberto de ${brl(saldo)}.`);
    }

    if (!principal.placa && !principal.chassi) {
        alertas.push('Não foi possível identificar Placa ou Chassi no documento.');
    } else if (principal.placa && !REGEX_PLACA.test(principal.placa)) {
        alertas.push(`Placa "${principal.placa}" fora do padrão — confira.`);
    }
    if (principal.chassi && principal.chassi.length !== 17) {
        alertas.push(`Chassi "${principal.chassi}" não tem 17 caracteres — confira.`);
    }
    if (valorTotal === undefined) {
        alertas.push('Valor total negociado não identificado.');
    }

    return {
        tipo,
        lojaDetectada,
        empresaRazaoSocial,
        empresaCnpj,
        dataContrato: principal.dataNegociacao ?? pagamentos.find((l) => l.data)?.data,
        vendedorCaptador: nomeProprio(campos.empresa['vendedor']),
        nomeParteInversa,
        cpfCnpjParteInversa,
        cidadeParteInversa: campos.cliente['cidade'],

        placa: principal.placa,
        chassi: principal.chassi,
        renavam: principal.renavam,
        marcaModelo: principal.descricao,
        marca: principal.marca,
        modelo: principal.modelo,
        anoFabricacao: principal.anoFabricacao,
        anoModelo: principal.anoModelo,
        km: principal.km,
        combustivel: principal.combustivel,
        cor: principal.cor,
        valorTotal,

        lancamentos,
        saldo,
        formaLiquidacao,
        valorEntradaMoeda: tipo === 'venda' ? totalPagamentos : undefined,

        temTroca: tipo === 'venda' && !!troca,
        troca: tipo === 'venda' ? troca : undefined,
        valorTroca: tipo === 'venda' ? troca?.valorNegociado : undefined,
        trocaPlaca: tipo === 'venda' ? troca?.placa : undefined,
        trocaModelo: tipo === 'venda' ? troca?.descricao : undefined,

        alertas,
    };
}
