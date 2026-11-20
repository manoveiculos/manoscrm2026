// Acerto de contas Manos × V3 (/manosv3). Sistema isolado do módulo societário do CRM.
// Valores SEMPRE em centavos (inteiros). Funções puras: rodam igual no servidor, na tela e no PDF.
//
// Regra definida pelos sócios: TUDO é 50/50 entre as empresas (compra, venda, custos, comissão, imposto).
//  • Cada empresa arca com metade de cada gasto e tem direito a metade de cada recebimento.
//  • Quem pagou mais que a sua metade é reembolsado pela outra (o "acerto"), desde o primeiro lançamento.
//  • Lucro do carro = venda − compra − custos − comissão − imposto; metade para cada empresa.
//  • O acerto considera só o que já foi PAGO/RECEBIDO de verdade; o pendente aparece em a receber / a pagar.

export type Lado = 'manos' | 'v3';
export type Ponta = Lado | 'externo';
export type TipoMov = 'compra' | 'custo' | 'venda' | 'comissao' | 'imposto' | 'repasse' | 'retirada' | 'outro';
export type StatusNegocio = 'estoque' | 'vendido' | 'finalizado';

export const LADOS: Lado[] = ['manos', 'v3'];
export const NOME_LADO: Record<Lado, string> = { manos: 'Manos Veículos', v3: 'V3 Automóveis' };
export const CURTO: Record<Lado, string> = { manos: 'Manos', v3: 'V3' };
export const outroLado = (l: Lado): Lado => (l === 'manos' ? 'v3' : 'manos');
export const NOME_TIPO: Record<TipoMov, string> = {
    compra: 'Compra do carro', custo: 'Custo / gasto', venda: 'Recebimento da venda', comissao: 'Comissão',
    imposto: 'Imposto / NF', repasse: 'Repasse entre empresas', retirada: 'Retirada de sócio', outro: 'Outro',
};
export const FORMAS = ['pix', 'ted', 'dinheiro', 'cheque', 'boleto', 'financiamento', 'troca_veiculo', 'outro'] as const;
export const FORMA_TROCA = 'troca_veiculo'; // não movimenta caixa: é carro, não dinheiro

export interface Negocio {
    id: string; created_at: string; criado_por: string | null;
    placa: string | null; veiculo: string; chassi: string | null; ano_modelo: number | null; km: number | null; cor: string | null;
    status: StatusNegocio;
    compra_loja: Lado; compra_data: string | null; compra_valor_centavos: number; compra_parte: string | null; compra_contrato_path: string | null;
    venda_loja: Lado | null; venda_data: string | null; venda_valor_centavos: number | null; venda_parte: string | null; venda_contrato_path: string | null;
    venda_registrada_em: string | null; venda_registrada_por: string | null; comissao_beneficiario: string | null;
    conferido_alexandre_em: string | null; conferido_ivo_em: string | null; finalizado_em: string | null; finalizado_por: string | null;
    observacoes: string | null;
}

export interface Movimento {
    id: string; created_at: string; criado_por: string | null; negocio_id: string | null;
    tipo: TipoMov; de_lado: Ponta; para_lado: Ponta; valor_centavos: number;
    status: 'pago' | 'pendente'; data: string; vencimento: string | null; pago_em: string | null; pago_por: string | null;
    forma: string | null; descricao: string | null; estornado_em: string | null; estornado_por: string | null;
}

export type MovimentoNovo = Pick<Movimento, 'tipo' | 'de_lado' | 'para_lado' | 'valor_centavos' | 'status' | 'data'> &
    Partial<Pick<Movimento, 'vencimento' | 'forma' | 'descricao'>>;

// ── dinheiro ──────────────────────────────────────────────────────────────
/** "1234,56" / "1.234,56" / "1234.56" → centavos (0 se vazio/ inválido). */
export function reaisParaCentavos(txt: string | number | null | undefined): number {
    if (typeof txt === 'number') return Math.round(txt * 100);
    let s = String(txt ?? '').trim().replace(/[R$\s]/g, '');
    if (!s) return 0;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}
export const centavosParaTexto = (c: number) => (c / 100).toFixed(2).replace('.', ',');
export const brl = (c: number) => ((c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const vivo = (m: Movimento) => !m.estornado_em;

// ── caixa por empresa (visão geral) ──────────────────────────────────────
export interface ResumoEmpresa {
    caixa: number;            // dinheiro que entrou − saiu (pago; carro de troca não é dinheiro)
    aReceber: number;         // pendente a entrar de terceiros (clientes etc.)
    aPagar: number;           // pendente a sair para terceiros
    acertoReceber: number;    // a outra empresa deve a esta (50/50 já pago)
    acertoPagar: number;      // esta empresa deve à outra
    projetado: number;        // caixa + a receber + acerto a receber − a pagar − acerto a pagar
    investidoEstoque: number; // metade (50%) do que já foi pago em carros ainda NÃO vendidos
    carrosEstoque: number;
    // resultado das vendas
    vendas: number; valorVendas: number; lucroGerado: number; lucroParte: number; comissoes: number; impostos: number;
}

export function resumirEmpresa(lado: Lado, negocios: Negocio[], movs: Movimento[]): ResumoEmpresa {
    const r: ResumoEmpresa = { caixa: 0, aReceber: 0, aPagar: 0, acertoReceber: 0, acertoPagar: 0, projetado: 0, investidoEstoque: 0, carrosEstoque: 0, vendas: 0, valorVendas: 0, lucroGerado: 0, lucroParte: 0, comissoes: 0, impostos: 0 };
    const estoque = new Set(negocios.filter((n) => n.status === 'estoque').map((n) => n.id));
    r.carrosEstoque = estoque.size; // cada carro é 50/50: as duas empresas têm metade dele
    let pagoEstoque = 0;

    for (const m of movs.filter(vivo)) {
        const v = m.valor_centavos;
        const dinheiro = m.forma !== FORMA_TROCA;
        if (m.status === 'pago') {
            if (dinheiro) { if (m.para_lado === lado) r.caixa += v; if (m.de_lado === lado) r.caixa -= v; }
            if (m.de_lado !== 'externo' && (m.tipo === 'compra' || m.tipo === 'custo') && m.negocio_id && estoque.has(m.negocio_id)) pagoEstoque += v;
        } else {
            if (m.para_lado === lado) r.aReceber += v;
            if (m.de_lado === lado) r.aPagar += v;
        }
        if (m.tipo === 'comissao' && m.de_lado === lado) r.comissoes += v;
        if (m.tipo === 'imposto' && m.de_lado === lado) r.impostos += v;
    }
    r.investidoEstoque = lado === 'manos' ? pagoEstoque - Math.floor(pagoEstoque / 2) : Math.floor(pagoEstoque / 2);

    const ac = acertoGeral(negocios, movs);
    if (ac.credora === lado) r.acertoReceber = ac.valor;
    if (ac.devedora === lado) r.acertoPagar = ac.valor;
    r.projetado = r.caixa + r.aReceber + r.acertoReceber - r.aPagar - r.acertoPagar;

    for (const n of negocios.filter((x) => x.status !== 'estoque')) {
        const c = calcularNegocio(n, movs.filter((m) => m.negocio_id === n.id));
        r.lucroParte += c.parte[lado];
        if (n.venda_loja === lado) { r.vendas += 1; r.valorVendas += c.venda; r.lucroGerado += c.lucro; }
    }
    return r;
}

// ── um negócio (carro) ────────────────────────────────────────────────────
export interface CalcNegocio {
    compra: number; custos: number; venda: number; comissao: number; imposto: number;
    lucro: number;                           // venda − compra − custos − comissão − imposto
    parte: Record<Lado, number>;             // metade do lucro para cada empresa (centavo ímpar vai pra Manos)
    cota: Record<Lado, number>;              // metade de tudo que o carro custa (compra + custos + comissão + imposto)
    investido: Record<Lado, number>;         // o que cada empresa PAGOU/vai pagar de fato (pode ser mais ou menos que a cota)
    investidoPago: Record<Lado, number>;
    recebido: Record<Lado, number>;          // venda que cada empresa recebeu/vai receber
    recebidoPago: Record<Lado, number>;
    repasses: Record<Lado, number>;          // saldo de repasses já feitos (+recebeu / −pagou)
    liquido: Record<Lado, number>;           // (já recebido − já pago) + repasses: o dinheiro real de cada uma neste carro
    deve: Record<Lado, number>;              // >0: esta empresa está com dinheiro da outra e precisa repassar (50/50)
    devedora: Lado | null; credora: Lado | null; valorAcerto: number;
    pendentes: number;                       // movimentos ainda não pagos
    pendenteValor: number;
    temVenda: boolean;
}

const zero = (): Record<Lado, number> => ({ manos: 0, v3: 0 });

export function calcularNegocio(n: Negocio, movsDoNegocio: Movimento[]): CalcNegocio {
    const ms = movsDoNegocio.filter(vivo);
    const c: CalcNegocio = {
        compra: 0, custos: 0, venda: 0, comissao: 0, imposto: 0, lucro: 0, parte: zero(), cota: zero(), investido: zero(), investidoPago: zero(),
        recebido: zero(), recebidoPago: zero(), repasses: zero(), liquido: zero(), deve: zero(), devedora: null, credora: null, valorAcerto: 0,
        pendentes: 0, pendenteValor: 0, temVenda: false,
    };
    for (const m of ms) {
        const v = m.valor_centavos;
        if (m.status === 'pendente') { c.pendentes += 1; c.pendenteValor += v; }
        switch (m.tipo) {
            case 'compra': c.compra += v; break;
            case 'custo': c.custos += v; break;
            case 'venda': c.venda += v; c.temVenda = true; break;
            case 'comissao': c.comissao += v; break;
            case 'imposto': c.imposto += v; break;
        }
        if (m.tipo === 'compra' || m.tipo === 'custo' || m.tipo === 'comissao' || m.tipo === 'imposto') {
            if (m.de_lado !== 'externo') { c.investido[m.de_lado] += v; if (m.status === 'pago') c.investidoPago[m.de_lado] += v; }
        }
        if (m.tipo === 'venda' && m.para_lado !== 'externo') { c.recebido[m.para_lado] += v; if (m.status === 'pago') c.recebidoPago[m.para_lado] += v; }
        if (m.tipo === 'repasse' && m.status === 'pago') {
            if (m.para_lado !== 'externo') c.repasses[m.para_lado] += v;
            if (m.de_lado !== 'externo') c.repasses[m.de_lado] -= v;
        }
    }
    c.lucro = c.venda - c.compra - c.custos - c.comissao - c.imposto;
    const metade = (v: number): Record<Lado, number> => { const v3 = Math.floor(v / 2); return { v3, manos: v - v3 }; };
    c.parte = metade(c.lucro);
    c.cota = metade(c.compra + c.custos + c.comissao + c.imposto);
    // 50/50 em tudo: o que cada uma tem no bolso (recebido − pago) é comparado com a metade do saldo total do carro.
    for (const l of LADOS) c.liquido[l] = c.recebidoPago[l] - c.investidoPago[l] + c.repasses[l];
    const saldoTotal = c.liquido.manos + c.liquido.v3;
    const parteSaldo = metade(saldoTotal);
    for (const l of LADOS) c.deve[l] = c.liquido[l] - parteSaldo[l];
    const m = c.deve.manos;
    if (m > 0) { c.devedora = 'manos'; c.credora = 'v3'; c.valorAcerto = m; }
    else if (m < 0) { c.devedora = 'v3'; c.credora = 'manos'; c.valorAcerto = -m; }
    return c;
}

export interface AcertoGeral {
    devedora: Lado | null; credora: Lado | null; valor: number; negociosComAcerto: number;
}

/** Soma o acerto de todos os carros, em estoque ou vendidos (compensa um lado contra o outro). */
export function acertoGeral(negocios: Negocio[], movs: Movimento[]): AcertoGeral {
    let manosDeve = 0, n = 0;
    for (const neg of negocios) {
        const c = calcularNegocio(neg, movs.filter((m) => m.negocio_id === neg.id));
        if (c.devedora) { manosDeve += c.devedora === 'manos' ? c.valorAcerto : -c.valorAcerto; n += 1; }
    }
    // repasses/retiradas soltos (sem carro) também acertam contas entre empresas
    for (const m of movs.filter((x) => vivo(x) && !x.negocio_id && x.status === 'pago' && x.tipo === 'repasse')) {
        if (m.de_lado === 'manos' && m.para_lado === 'v3') manosDeve -= m.valor_centavos;
        if (m.de_lado === 'v3' && m.para_lado === 'manos') manosDeve += m.valor_centavos;
    }
    return manosDeve === 0 ? { devedora: null, credora: null, valor: 0, negociosComAcerto: n }
        : { devedora: manosDeve > 0 ? 'manos' : 'v3', credora: manosDeve > 0 ? 'v3' : 'manos', valor: Math.abs(manosDeve), negociosComAcerto: n };
}

export interface LinhaAcerto {
    movId: string; negocioId: string | null; tipo: TipoMov; descricao: string; data: string; criadoPor: string | null;
    quemPagou: Lado;     // quem pagou o gasto / recebeu o dinheiro / fez o repasse
    base: number;        // valor do lançamento
    devedora: Lado; credora: Lado; valor: number; // metade (50/50), ou o repasse inteiro
    explicacao: string;
}

/** Explica o acerto linha a linha: cada lançamento já pago que gera dívida entre as empresas. */
export function detalharAcerto(movs: Movimento[]): LinhaAcerto[] {
    const out: LinhaAcerto[] = [];
    for (const m of movs.filter(vivo)) {
        if (m.status !== 'pago') continue;
        const base = m.valor_centavos, metade = Math.round(base / 2);
        const comum = { movId: m.id, negocioId: m.negocio_id, tipo: m.tipo, descricao: m.descricao || NOME_TIPO[m.tipo], data: m.data, criadoPor: m.criado_por, base };
        if ((m.tipo === 'compra' || m.tipo === 'custo' || m.tipo === 'comissao' || m.tipo === 'imposto') && m.de_lado !== 'externo') {
            const x = m.de_lado;
            out.push({ ...comum, quemPagou: x, devedora: outroLado(x), credora: x, valor: metade, explicacao: `${CURTO[x]} pagou ${brl(base)} (${NOME_TIPO[m.tipo].toLowerCase()}); ${CURTO[outroLado(x)]} deve 50% = ${brl(metade)}` });
        } else if (m.tipo === 'venda' && m.para_lado !== 'externo') {
            const x = m.para_lado;
            out.push({ ...comum, quemPagou: x, devedora: x, credora: outroLado(x), valor: metade, explicacao: `${CURTO[x]} recebeu ${brl(base)} da venda; deve 50% = ${brl(metade)} à ${CURTO[outroLado(x)]}` });
        } else if (m.tipo === 'repasse' && m.de_lado !== 'externo' && m.para_lado !== 'externo') {
            const x = m.de_lado;
            out.push({ ...comum, quemPagou: x, devedora: outroLado(x), credora: x, valor: base, explicacao: `${CURTO[x]} repassou ${brl(base)} à ${CURTO[outroLado(x)]} (abate o acerto)` });
        }
    }
    return out.sort((a, b) => b.data.localeCompare(a.data));
}

export function pendenciasParaFinalizar(n: Negocio, c: CalcNegocio): string[] {
    const p: string[] = [];
    if (!n.venda_loja || !c.temVenda) p.push('venda ainda não registrada');
    if (c.pendentes > 0) p.push(`${c.pendentes} lançamento(s) pendente(s) de pagamento/recebimento (${brl(c.pendenteValor)})`);
    return p;
}

export const dataBR = (d?: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.split('-').reverse().join('/') : d || '—');
export const dataHoraBR = (d?: string | null) => {
    if (!d) return '—';
    const t = new Date(d);
    return isNaN(t.getTime()) ? '—' : t.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
