// Leitor de NF-e (DANFE) para o /manosv3: carro novo de montadora/concessionária chega como nota fiscal, não como contrato.
// Complementa o leitor de contratos do CRM (que fica intocado): só roda quando o contrato não foi reconhecido.

export interface DanfeLida {
    tipo: 'compra';
    nomeParteInversa?: string;   // emitente = fornecedor
    destinatario?: string;
    dataContrato?: string;       // yyyy-mm-dd (data de emissão)
    chassi?: string;
    cor?: string;
    anoModelo?: number;
    anoFabricacao?: number;
    marcaModelo?: string;
    valorTotal?: number;         // reais
    numeroNota?: string;
    alertas: string[];
}

const numBR = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));

export function pareceDanfe(texto: string): boolean {
    return /DANFE/i.test(texto) && /CHAVE DE ACESSO/i.test(texto);
}

export function lerDanfe(texto: string): DanfeLida | null {
    if (!pareceDanfe(texto)) return null;
    const alertas: string[] = ['Documento lido como NF-e (nota fiscal), não como contrato. Confira os dados e informe quem pagou.'];
    const out: DanfeLida = { tipo: 'compra', alertas };

    out.nomeParteInversa = texto.match(/RECEBEMOS DE\s+(.+?)\s+OS PRODUTOS/i)?.[1]?.trim();
    out.numeroNota = texto.match(/N[ºo°]\s*(\d{3,})/)?.[1];

    // Destinatário e data de emissão: linha logo abaixo do cabeçalho "NOME/RAZÃO SOCIAL CNPJ/CPF... DATA DA EMISSÃO"
    const dest = texto.match(/DATA DA EMISS[ÃA]O\s*\n(.+)/i)?.[1];
    if (dest) {
        const m = dest.match(/^(.*?)\s+\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\s+(\d{2})\/(\d{2})\/(\d{4})/);
        if (m) { out.destinatario = m[1].trim(); out.dataContrato = `${m[4]}-${m[3]}-${m[2]}`; }
    }

    // Valor total da nota: último número da linha logo abaixo do cabeçalho "VALOR TOTAL DA NOTA"
    const linhaTotal = texto.match(/VALOR TOTAL DA NOTA\s*\n([^\n]+)/i)?.[1];
    const nums = linhaTotal?.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g);
    if (nums?.length) out.valorTotal = numBR(nums[nums.length - 1]);

    out.chassi = texto.match(/Chassi\s+([A-HJ-NPR-Z0-9]{17})/i)?.[1]?.toUpperCase();
    out.cor = texto.match(/\nCor\s+([^\n]+)/i)?.[1]?.trim();
    const am = texto.match(/Ano Modelo\s+(\d{4})/i)?.[1]; if (am) out.anoModelo = Number(am);
    const af = texto.match(/Ano Fabrica[çc][ãa]o\s+(\d{4})/i)?.[1]; if (af) out.anoFabricacao = Number(af);

    // Linha do produto: "<código> <descrição> <NCM 8700...> ..." (a descrição costuma ser um código da montadora)
    const prod = texto.match(/\n([A-Z0-9]{5,}\s+.+?)\s+8703\d{4}\s/);
    if (prod) out.marcaModelo = prod[1].replace(/^[A-Z0-9]{5,}\s+/, '').trim();

    if (!out.chassi) alertas.push('Chassi não identificado na nota.');
    if (!out.valorTotal) alertas.push('Valor total da nota não identificado.');
    return out;
}
