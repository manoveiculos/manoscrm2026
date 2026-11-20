// Ficha de fechamento em PDF (arquivo físico) de um negócio do /manosv3. Roda no navegador (jsPDF).
import {
    CURTO, NOME_LADO, NOME_TIPO, brl, calcularNegocio, dataBR, dataHoraBR,
    type Lado, type Movimento, type Negocio,
} from './manosv3';

/** Carrega uma imagem do /public como data URL (null se falhar: o PDF sai sem o logo). */
async function carregarImagem(url: string): Promise<{ data: string; w: number; h: number } | null> {
    try {
        const blob = await (await fetch(url)).blob();
        const data: string = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result as string); r.onerror = no; r.readAsDataURL(blob); });
        const dim: { w: number; h: number } = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = no; i.src = data; });
        return { data, ...dim };
    } catch { return null; }
}

const nome = (p: string) => (p === 'externo' ? 'Terceiro' : CURTO[p as Lado] ?? p);

export async function gerarPdfNegocio(neg: Negocio, todosMovs: Movimento[]): Promise<void> {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 14, R = W - M;
    let y = 0;

    const movs = todosMovs.filter((m) => m.negocio_id === neg.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const c = calcularNegocio(neg, movs);
    const emitido = dataHoraBR(new Date().toISOString());

    const novaPagina = () => {
        doc.addPage();
        y = M;
        cabecalhoPagina();
    };
    const garantir = (h: number) => { if (y + h > 287) novaPagina(); };

    function cabecalhoPagina() {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120);
        doc.text(`Manos x V3 - ${neg.placa || neg.veiculo} - emitido em ${emitido}`, M, 8);
        doc.text(`Pág. ${doc.getNumberOfPages()}`, R, 8, { align: 'right' });
        doc.setTextColor(0);
    }
    const titulo = (t: string) => {
        garantir(14);
        y += 4;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
        doc.text(t, M, y);
        doc.setDrawColor(40); doc.setLineWidth(0.4); doc.line(M, y + 1.5, R, y + 1.5);
        y += 6;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
    };
    const par = (k: string, v: string, x = M, largura = 85) => {
        doc.setFont('helvetica', 'bold'); doc.text(`${k}:`, x, y);
        doc.setFont('helvetica', 'normal');
        const linhas = doc.splitTextToSize(v || '—', largura - 34);
        doc.text(linhas, x + 34, y);
        return linhas.length * 4.6;
    };
    const duasColunas = (a: [string, string], b?: [string, string]) => {
        garantir(10);
        const h1 = par(a[0], a[1], M);
        const h2 = b ? par(b[0], b[1], M + 95) : 0;
        y += Math.max(h1, h2, 4.6);
    };

    // ── cabeçalho com os logos das duas empresas (faixa escura: as letras dos logos são claras)
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, W, 26, 'F');
    const logoManos = await carregarImagem('/logo-manos.png');
    const logoV3 = await carregarImagem('/logo-v3.png');
    const altura = 16;
    let x = M;
    for (const logo of [logoManos, logoV3]) {
        if (!logo) continue;
        const larg = altura * (logo.w / logo.h);
        doc.addImage(logo.data, 'PNG', x, 5, larg, altura);
        x += larg + 8;
    }
    doc.setTextColor(255); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(`Emitido em ${emitido}`, R, 11, { align: 'right' });
    doc.text(`Pág. 1`, R, 16, { align: 'right' });
    doc.setTextColor(0);
    y = 36;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text('Ficha de Fechamento de Negócio', M, y);
    y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(`Manos Veículos x V3 Automóveis - ${neg.status === 'finalizado' ? 'NEGÓCIO FINALIZADO' : 'RASCUNHO (negócio ainda não finalizado)'}`, M, y);
    y += 4;
    doc.setFontSize(8); doc.setTextColor(120);
    doc.text(`ID ${neg.id}`, M, y + 1);
    doc.setTextColor(0); doc.setFontSize(9.5);
    y += 3;

    titulo('1. Veículo');
    duasColunas(['Veículo', neg.veiculo], ['Placa', neg.placa || '—']);
    duasColunas(['Chassi', neg.chassi || '—'], ['Ano/modelo', neg.ano_modelo ? String(neg.ano_modelo) : '—']);
    duasColunas(['KM', neg.km ? neg.km.toLocaleString('pt-BR') : '—'], ['Cor', neg.cor || '—']);

    titulo('2. Compra');
    duasColunas(['Empresa que comprou', NOME_LADO[neg.compra_loja]], ['Data', dataBR(neg.compra_data)]);
    duasColunas(['Fornecedor', neg.compra_parte || '—'], ['Valor da compra', brl(neg.compra_valor_centavos)]);
    duasColunas(['Contrato arquivado', neg.compra_contrato_path ? 'sim (PDF no arquivo digital)' : 'não anexado']);

    titulo('3. Venda');
    if (neg.venda_loja) {
        duasColunas(['Empresa que vendeu', NOME_LADO[neg.venda_loja]], ['Data', dataBR(neg.venda_data)]);
        duasColunas(['Comprador', neg.venda_parte || '—'], ['Valor da venda', brl(neg.venda_valor_centavos || 0)]);
        duasColunas(['Comissão para', neg.comissao_beneficiario || '—'], ['Contrato arquivado', neg.venda_contrato_path ? 'sim' : 'não anexado']);
        duasColunas(['Venda lançada em', dataHoraBR(neg.venda_registrada_em)], ['Lançada por', neg.venda_registrada_por || '—']);
    } else {
        doc.text('Venda ainda não registrada.', M, y); y += 5;
    }

    titulo('4. Divisão 50/50: cota, pagamentos e recebimentos');
    const col = [M, 70, 108, 146];
    const cab = (cols: string[]) => {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
        cols.forEach((t, i) => doc.text(t, col[i], y));
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
        doc.line(M, y + 1.5, R, y + 1.5); y += 5.5;
    };
    cab(['Empresa', 'Cota (50%)', 'Já pagou', 'Recebido da venda']);
    (['manos', 'v3'] as Lado[]).forEach((l) => {
        garantir(6);
        doc.text(NOME_LADO[l], col[0], y);
        doc.text(brl(c.cota[l]), col[1], y);
        doc.text(brl(c.investidoPago[l]), col[2], y);
        doc.text(brl(c.recebidoPago[l]), col[3], y);
        y += 5;
    });
    doc.setFontSize(8); doc.setTextColor(110);
    doc.text('Cota = metade de compra + custos + comissão + imposto. Compra, venda e despesas são sempre 50/50.', M, y); y += 3;
    doc.setTextColor(0); doc.setFontSize(9.5);

    titulo('5. Resultado do negócio');
    const linhasRes: [string, string, boolean?][] = [
        ['Valor da venda', brl(c.venda)], ['(-) Compra do carro', brl(c.compra)], ['(-) Custos e gastos', brl(c.custos)],
        ['(-) Comissão', brl(c.comissao)], ['(-) Imposto / NF', brl(c.imposto)], ['= Lucro líquido do negócio', brl(c.lucro), true],
        ['Parte da Manos (50%)', brl(c.parte.manos)], ['Parte da V3 (50%)', brl(c.parte.v3)],
    ];
    for (const [k, v, forte] of linhasRes) {
        garantir(6);
        doc.setFont('helvetica', forte ? 'bold' : 'normal');
        doc.text(k, M, y); doc.text(v, 120, y, { align: 'right' });
        y += 5;
    }
    doc.setFont('helvetica', 'normal');

    titulo('6. Acerto entre as empresas');
    garantir(14);
    if (c.devedora && c.credora && c.valorAcerto > 0) {
        doc.setFont('helvetica', 'bold');
        doc.text(`${NOME_LADO[c.devedora]} deve ${brl(c.valorAcerto)} para ${NOME_LADO[c.credora]}.`, M, y);
        doc.setFont('helvetica', 'normal'); y += 5;
    } else {
        doc.text('Empresas quites: nenhum repasse pendente.', M, y); y += 5;
    }
    doc.setFontSize(8); doc.setTextColor(110);
    doc.text('Cálculo: (recebido - pago, +/- repasses) de cada empresa comparado com a metade do saldo total do carro.', M, y);
    y += 3; doc.setTextColor(0); doc.setFontSize(9.5);

    // ── lançamentos
    titulo('7. Lançamentos (com data e hora do registro)');
    const cx = [M, 38, 70, 118, 140];
    const cabMov = () => {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
        ['Registrado em', 'Tipo', 'Quem pagou -> recebeu', 'Valor', 'Situação'].forEach((t, i) => doc.text(t, cx[i], y));
        doc.setFont('helvetica', 'normal'); doc.line(M, y + 1.5, R, y + 1.5); y += 5.5;
    };
    cabMov();
    doc.setFontSize(8);
    if (movs.length === 0) { doc.text('Nenhum lançamento.', M, y); y += 5; }
    for (const m of movs) {
        const desc = [m.descricao, m.forma ? `forma: ${m.forma}` : null, `por ${m.criado_por || '—'}`].filter(Boolean).join(' - ');
        const linhasDesc = doc.splitTextToSize(desc, R - M - 2);
        if (y + 5 + linhasDesc.length * 3.6 > 287) { novaPagina(); cabMov(); doc.setFontSize(8); }
        doc.setTextColor(m.estornado_em ? 150 : 0);
        doc.text(dataHoraBR(m.created_at), cx[0], y);
        doc.text(NOME_TIPO[m.tipo], cx[1], y, { maxWidth: 36 });
        doc.text(`${nome(m.de_lado)} -> ${nome(m.para_lado)}`, cx[2], y);
        doc.text(brl(m.valor_centavos), cx[3], y);
        const sit = m.estornado_em ? `ESTORNADO ${dataHoraBR(m.estornado_em)}` : m.status === 'pago' ? `Pago ${dataHoraBR(m.pago_em)}` : `Pendente${m.vencimento ? ' ate ' + dataBR(m.vencimento) : ''}`;
        doc.text(sit, cx[4], y, { maxWidth: R - cx[4] });
        y += 4;
        doc.setTextColor(110);
        doc.text(linhasDesc, M + 2, y);
        y += linhasDesc.length * 3.6 + 1.5;
        doc.setTextColor(0);
    }
    doc.setFontSize(9.5);

    // ── conferência e assinaturas
    titulo('8. Conferência e assinaturas');
    garantir(48);
    duasColunas(['Conferido Alexandre', neg.conferido_alexandre_em ? dataHoraBR(neg.conferido_alexandre_em) : 'não conferido'],
        ['Conferido Ivo', neg.conferido_ivo_em ? dataHoraBR(neg.conferido_ivo_em) : 'não conferido']);
    duasColunas(['Finalizado em', dataHoraBR(neg.finalizado_em)], ['Finalizado por', neg.finalizado_por || '—']);
    if (neg.observacoes) duasColunas(['Observações', neg.observacoes]);
    y += 16;
    doc.setLineWidth(0.3);
    doc.line(M, y, M + 75, y); doc.line(R - 75, y, R, y);
    doc.setFontSize(8.5);
    doc.text('Alexandre - Manos Veículos', M, y + 4);
    doc.text('Ivo - V3 Automóveis', R - 75, y + 4);

    doc.save(`fechamento-${(neg.placa || neg.veiculo).replace(/[^A-Za-z0-9]+/g, '-')}.pdf`);
}
