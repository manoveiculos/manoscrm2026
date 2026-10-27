import { NextRequest, NextResponse } from 'next/server';
import { requireFinanceiro } from '../_guard';
import { rangePreset, Preset, brl, dataBR, addDias, hojeISO, inicioSemana, inicioMes, fimMes } from '@/lib/financeiro/format';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const guard = await requireFinanceiro(req);
    if (!guard.ok) return guard.res;

    const { adminClient, effectiveOwner } = guard;
    const url = new URL(req.url);

    const preset = (url.searchParams.get('preset') || 'mes') as Preset;
    const range = rangePreset(preset);
    const inicio = url.searchParams.get('inicio') || range.inicio;
    const fim = url.searchParams.get('fim') || range.fim;
    const escopoFiltro = url.searchParams.get('escopo'); // PF | PJ | todos

    try {
        const hoje = hojeISO();
        const iniSemana = inicioSemana(hoje);
        const fimSemana = addDias(iniSemana, 6);
        const iniMes = inicioMes(hoje);
        const fimMesAtual = fimMes(hoje);

        // 1. Contas e saldo de caixa
        const { data: contas } = await adminClient
            .from('fin_contas')
            .select('id, saldo_inicial')
            .eq('owner_email', effectiveOwner);

        const { data: todosLancsPagos } = await adminClient
            .from('fin_lancamentos')
            .select('tipo, valor, data')
            .eq('owner_email', effectiveOwner)
            .eq('status', 'pago')
            .is('deleted_at', null);

        let totalCaixa = (contas || []).reduce((acc, c) => acc + Number(c.saldo_inicial || 0), 0);
        for (const l of todosLancsPagos || []) {
            const v = Number(l.valor || 0);
            if (l.tipo === 'entrada') totalCaixa += v;
            else if (l.tipo === 'saida') totalCaixa -= v;
        }

        // 2. Lançamentos no período
        let queryPeriodo = adminClient
            .from('fin_lancamentos')
            .select(`
                id, tipo, valor, data, descricao, escopo, status, placa, destinacao,
                categoria:fin_categorias(id, nome, cor, natureza)
            `)
            .eq('owner_email', effectiveOwner)
            .gte('data', inicio)
            .lte('data', fim)
            .eq('status', 'pago')
            .is('deleted_at', null);

        if (escopoFiltro && escopoFiltro !== 'todos') {
            queryPeriodo = queryPeriodo.eq('escopo', escopoFiltro);
        }

        const { data: lancsPeriodo } = await queryPeriodo;

        let totalEntradas = 0;
        let totalSaidas = 0;
        let totalOperacional = 0;
        const categoriasMap = new Map<string, { nome: string; cor: string; valor: number }>();

        for (const l of lancsPeriodo || []) {
            const val = Number(l.valor || 0);
            const isPatrimonial = (l as any)?.categoria?.natureza === 'patrimonial';

            if (l.tipo === 'entrada') {
                totalEntradas += val;
                if (!isPatrimonial) totalOperacional += val;
            } else if (l.tipo === 'saida') {
                totalSaidas += val;
                if (!isPatrimonial) totalOperacional -= val;

                const catNome = (l as any)?.categoria?.nome || 'Outras Saídas';
                const catCor = (l as any)?.categoria?.cor || '#64748b';
                const cur = categoriasMap.get(catNome) || { nome: catNome, cor: catCor, valor: 0 };
                cur.valor += val;
                categoriasMap.set(catNome, cur);
            }
        }

        const topCategorias = Array.from(categoriasMap.values())
            .sort((a, b) => b.valor - a.valor)
            .slice(0, 5);

        // 3. Contas a pagar e a receber: HOJE, ESTA SEMANA, ESTE MÊS
        const { data: todosPrevistos } = await adminClient
            .from('fin_lancamentos')
            .select('tipo, valor, data, descricao, escopo')
            .eq('owner_email', effectiveOwner)
            .eq('status', 'previsto')
            .is('deleted_at', null);

        let aPagarHoje = 0;
        let aReceberHoje = 0;
        let aPagarSemana = 0;
        let aReceberSemana = 0;
        let aPagarMes = 0;
        let aReceberMes = 0;

        for (const p of todosPrevistos || []) {
            const v = Number(p.valor || 0);
            const dt = p.data;

            // Hoje
            if (dt === hoje) {
                if (p.tipo === 'saida') aPagarHoje += v;
                else if (p.tipo === 'entrada') aReceberHoje += v;
            }
            // Semana
            if (dt >= iniSemana && dt <= fimSemana) {
                if (p.tipo === 'saida') aPagarSemana += v;
                else if (p.tipo === 'entrada') aReceberSemana += v;
            }
            // Mês
            if (dt >= iniMes && dt <= fimMesAtual) {
                if (p.tipo === 'saida') aPagarMes += v;
                else if (p.tipo === 'entrada') aReceberMes += v;
            }
        }

        // 4. Patrimônio
        const { data: itensPatrimonio } = await adminClient
            .from('fin_patrimonio')
            .select('tipo, valor_atual')
            .eq('owner_email', effectiveOwner)
            .eq('ativo', true);

        let totalAtivosBens = 0;
        let totalPassivos = 0;
        for (const it of itensPatrimonio || []) {
            const v = Number(it.valor_atual || 0);
            if (it.tipo === 'ativo') totalAtivosBens += v;
            else if (it.tipo === 'passivo') totalPassivos += v;
        }

        const patrimonioLiquido = totalCaixa + totalAtivosBens - totalPassivos;

        // 5. Acerto entre Alexandre e Ledra (Adiantamentos de Loja pendentes de reembolso)
        const { data: reembolsosPendentes } = await adminClient
            .from('fin_lancamentos')
            .select('id, data, descricao, valor, destinacao, reembolso_valor, reembolso_de, reembolso_para, owner_email, placa')
            .eq('reembolso_status', 'pendente')
            .is('deleted_at', null)
            .order('data', { ascending: false });

        let totalAlexandreDeveAoLedra = 0;
        let totalLedraDeveAoAlexandre = 0;

        for (const r of reembolsosPendentes || []) {
            const rVal = Number(r.reembolso_valor || 0);
            if (r.reembolso_para === 'hgledra@hotmail.com') {
                totalAlexandreDeveAoLedra += rVal;
            } else if (r.reembolso_para === 'alexandre_gorges@hotmail.com') {
                totalLedraDeveAoAlexandre += rVal;
            }
        }

        // Saldo líquido do Acerto entre sócios:
        // Se positivo: Alexandre deve ao Ledra
        // Se negativo: Ledra deve ao Alexandre
        const saldoLiquidoAcerto = totalAlexandreDeveAoLedra - totalLedraDeveAoAlexandre;

        // 6. Gera texto formatado para envio no WhatsApp
        const nomeUsuario = effectiveOwner.includes('ledra') ? 'Felipe Ledra' : 'Alexandre Gorges';
        const tituloPeriodo = preset === 'hoje' ? `Hoje (${dataBR(hoje)})` :
            preset === 'semana' ? `Semana (${dataBR(inicio)} a ${dataBR(fim)})` :
            `Mês (${dataBR(inicio)} a ${dataBR(fim)})`;

        const resultadoPeriodo = totalEntradas - totalSaidas;
        const emojiResultado = resultadoPeriodo >= 0 ? '🟢' : '🔴';

        const topCatStr = topCategorias.length > 0
            ? topCategorias.map(c => `• ${c.nome}: ${brl(c.valor)}`).join('\n')
            : '• Nenhuma saída registrada';

        const whatsappTexto = `📊 *Resumo Financeiro — ${nomeUsuario}*
📅 *Período:* ${tituloPeriodo}

💰 *Caixa Livre:* ${brl(totalCaixa)}
💎 *Patrimônio Líquido:* ${brl(patrimonioLiquido)}
   └ Ativos (Bens): ${brl(totalAtivosBens)}
   └ Passivos (Dívidas): ${brl(totalPassivos)}

━━━━━━━━━━━━━━━━━━━
📈 *Movimentações do Período:*
✅ *Entradas:* ${brl(totalEntradas)}
❌ *Saídas:* ${brl(totalSaidas)}
${emojiResultado} *Resultado:* ${brl(resultadoPeriodo)}

🔝 *Principais Gastos:*
${topCatStr}

━━━━━━━━━━━━━━━━━━━
⏰ *Previsão de Contas:*
📅 *Hoje:* Pagar ${brl(aPagarHoje)} | Receber ${brl(aReceberHoje)}
📊 *Esta Semana:* Pagar ${brl(aPagarSemana)} | Receber ${brl(aReceberSemana)}
🗓️ *Este Mês:* Pagar ${brl(aPagarMes)} | Receber ${brl(aReceberMes)}

🤝 *Acerto Entre Sócios (Alexandre & Ledra):*
${saldoLiquidoAcerto > 0 
    ? `⚠️ Alexandre tem a pagar ao Ledra: ${brl(saldoLiquidoAcerto)}` 
    : saldoLiquidoAcerto < 0 
    ? `⚠️ Ledra tem a pagar ao Alexandre: ${brl(Math.abs(saldoLiquidoAcerto))}` 
    : '✅ Acerto 100% Zerado / Em dia!'}
━━━━━━━━━━━━━━━━━━━
_Gerado via Manos CRM Financeiro_`;

        return NextResponse.json({
            success: true,
            periodo: { inicio, fim, preset },
            kpis: {
                totalCaixa: Math.round(totalCaixa * 100) / 100,
                patrimonioLiquido: Math.round(patrimonioLiquido * 100) / 100,
                totalAtivosBens: Math.round(totalAtivosBens * 100) / 100,
                totalPassivos: Math.round(totalPassivos * 100) / 100,
                totalEntradas: Math.round(totalEntradas * 100) / 100,
                totalSaidas: Math.round(totalSaidas * 100) / 100,
                resultadoPeriodo: Math.round(resultadoPeriodo * 100) / 100,
                resultadoOperacional: Math.round(totalOperacional * 100) / 100,
                // Pagar / Receber em prazos
                aPagarHoje: Math.round(aPagarHoje * 100) / 100,
                aReceberHoje: Math.round(aReceberHoje * 100) / 100,
                aPagarSemana: Math.round(aPagarSemana * 100) / 100,
                aReceberSemana: Math.round(aReceberSemana * 100) / 100,
                aPagarMes: Math.round(aPagarMes * 100) / 100,
                aReceberMes: Math.round(aReceberMes * 100) / 100,
                // Acerto entre sócios
                acerto: {
                    totalAlexandreDeveAoLedra: Math.round(totalAlexandreDeveAoLedra * 100) / 100,
                    totalLedraDeveAoAlexandre: Math.round(totalLedraDeveAoAlexandre * 100) / 100,
                    saldoLiquidoAcerto: Math.round(saldoLiquidoAcerto * 100) / 100,
                    itensPendentes: reembolsosPendentes || [],
                },
            },
            topCategorias,
            whatsappTexto,
        });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
    }
}
