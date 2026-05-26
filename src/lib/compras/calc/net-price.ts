/**
 * Calcula o preço líquido de compra descontando a comissão padrão
 * cobrada pelos grupos de repasse (tipicamente 6%).
 * 
 * @param askPrice Preço de venda anunciado pelo repassador
 * @returns Preço líquido efetivo de compra
 */
export function calculateNetPrice(askPrice: number): number {
  return Math.round(askPrice * 0.94 * 100) / 100;
}

/**
 * Calcula a porcentagem do preço líquido de compra em relação à FIPE.
 * Ex: Se o preço líquido for 80.000 e a FIPE 100.000, o retorno será 80.00 (80%).
 * 
 * @param netPrice Preço líquido calculado
 * @param fipePrice Preço FIPE de referência
 * @returns Porcentagem da FIPE (ex: 85.50 para 85.5%)
 */
export function calculateFipePercent(netPrice: number, fipePrice: number): number {
  if (!fipePrice || fipePrice <= 0) return 0;
  return Math.round((netPrice / fipePrice) * 10000) / 100;
}
