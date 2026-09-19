import { NextRequest, NextResponse } from 'next/server';
import { validateMetaAgentAuth } from '@/lib/metaAgentAuth';

export async function POST(req: NextRequest) {
    const auth = validateMetaAgentAuth(req);
    if (!auth.valid) return auth.response!;

    try {
        const body = await req.json();
        const vehiclePrice = parseFloat(body.vehicle_price || body.price || 0);
        const downPaymentProposed = parseFloat(body.down_payment || body.entrada || 0);
        const requestedInstallments = parseInt(body.installments || body.parcelas || 48, 10);

        if (!vehiclePrice || vehiclePrice <= 0) {
            return NextResponse.json({ error: 'vehicle_price é obrigatório e deve ser maior que 0' }, { status: 400 });
        }

        // Se a entrada for maior ou igual ao valor total
        if (downPaymentProposed >= vehiclePrice) {
            return NextResponse.json({
                error: 'O valor de entrada deve ser menor que o valor total do veículo'
            }, { status: 400 });
        }

        const financedAmount = vehiclePrice - downPaymentProposed;
        const monthlyInterestRate = 0.0149; // Taxa de juros média estimada (1,49% a.m.)

        // Opções padrão de parcelamento
        const installmentOptions = [24, 36, 48, 60];
        if (!installmentOptions.includes(requestedInstallments)) {
            installmentOptions.push(requestedInstallments);
            installmentOptions.sort((a, b) => a - b);
        }

        const simulationResults = installmentOptions.map(n => {
            // Fórmulas de amortização PRICE: PMT = PV * [i * (1 + i)^n] / [(1 + i)^n - 1]
            const i = monthlyInterestRate;
            const pmt = (financedAmount * (i * Math.pow(1 + i, n))) / (Math.pow(1 + i, n) - 1);
            const totalEstimated = pmt * n + downPaymentProposed;

            return {
                installments: n,
                monthly_payment: Math.round(pmt * 100) / 100,
                formatted_monthly_payment: `R$ ${Math.round(pmt).toLocaleString('pt-BR')}`,
                estimated_total: Math.round(totalEstimated * 100) / 100
            };
        });

        const selectedOption = simulationResults.find(o => o.installments === requestedInstallments) || simulationResults[2];

        return NextResponse.json({
            vehicle_price: vehiclePrice,
            down_payment: downPaymentProposed,
            financed_amount: financedAmount,
            estimated_monthly_rate: "1.49% a.m.",
            requested_simulation: selectedOption,
            all_options: simulationResults,
            disclaimer: "Simulação aproximada sujeita a análise de crédito do CPF nas financeiras parceiras (Santander, BV, Itaú, Bradesco)."
        });

    } catch (err: any) {
        console.error('API /api/meta-agent/financing error:', err);
        return NextResponse.json({ error: err.message || 'Erro ao calcular simulação de financiamento' }, { status: 500 });
    }
}
