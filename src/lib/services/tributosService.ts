/**
 * Módulo de Apuração Tributária e Fechamento Financeiro - Manos Veículos
 *
 * Metodologia tributária:
 * 1. Margem Bruta = Valor NFe Saída - Valor NFe Entrada
 * 2. ICMS = (Valor NFe Saída * 0.05) * 0.12  (Base reduzida em 95%, alíquota de 12%)
 * 3. PIS/COFINS = (Margem - ICMS) * 0.0365   (Base deduzida do ICMS, alíquota de 3,65%)
 * 4. IRPJ/CSLL = Margem * 0.32 * 0.24         (Presunção de 32% e alíquota de 24%: 15% IRPJ + 9% CSLL)
 * 5. Imposto / Provisionamento NF = ICMS + PIS/COFINS + IRPJ/CSLL
 */

export interface MemoriaCalculoTributos {
    base_icms: number;
    icms: number;
    base_pis_cofins: number;
    pis_cofins: number;
    base_irpj_csll: number;
    irpj_csll: number;
}

export interface ResultadoApuracaoTributaria {
    valor_nfe_saida: number;
    valor_nfe_entrada: number;
    margem_bruta: number;
    memoria_calculo: {
        icms: number;
        pis_cofins: number;
        irpj_csll: number;
        detalhes?: MemoriaCalculoTributos;
    };
    imposto_provisionamento_nf: number;
}

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export function calcularApuracaoTributariaNF(
    valorNfeSaida: number,
    valorNfeEntrada: number
): ResultadoApuracaoTributaria {
    const saida = Math.max(Number(valorNfeSaida || 0), 0);
    const entrada = Math.max(Number(valorNfeEntrada || 0), 0);

    // 1. Margem Bruta
    const margemBruta = r2(saida - entrada);

    // 2. ICMS (Redução de 95% na Base de Cálculo - alíquota de 12%)
    const baseIcms = r2(saida * 0.05);
    const icms = r2(baseIcms * 0.12);

    // 3. PIS / COFINS (Alíquota combinada de 3,65% cumulativo sobre Margem deduzida do ICMS)
    // Se a margem for negativa ou menor que o ICMS, a base não fica negativa para imposto
    const basePisCofins = r2(Math.max(margemBruta - icms, 0));
    const pisCofins = r2(basePisCofins * 0.0365);

    // 4. IRPJ e CSLL (Presunção de 32% e Alíquota combinada de 24%: 15% IRPJ + 9% CSLL)
    const baseIrpjCsll = r2(Math.max(margemBruta, 0));
    const irpjCsll = r2(baseIrpjCsll * 0.32 * 0.24);

    // 5. Total Imposto / Provisionamento NF
    const impostoProvisionamentoNf = r2(icms + pisCofins + irpjCsll);

    return {
        valor_nfe_saida: r2(saida),
        valor_nfe_entrada: r2(entrada),
        margem_bruta: margemBruta,
        memoria_calculo: {
            icms,
            pis_cofins: pisCofins,
            irpj_csll: irpjCsll,
            detalhes: {
                base_icms: baseIcms,
                icms,
                base_pis_cofins: basePisCofins,
                pis_cofins: pisCofins,
                base_irpj_csll: baseIrpjCsll,
                irpj_csll: irpjCsll
            }
        },
        imposto_provisionamento_nf: impostoProvisionamentoNf
    };
}
