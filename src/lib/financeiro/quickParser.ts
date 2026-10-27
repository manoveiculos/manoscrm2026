// Parser de lançamento rápido em uma única linha.
// Exemplos de entrada:
//   "-380 chaveiro ford ka"
//   "+1500 pix jeferson solmi"
//   "-12000 aluguel loja pj"
//   "-70 gasolina ontem"
//   "150 almoco" (padrão é saída)
//   ">5000 nubank dinheiro" (transferência)

import { TipoLancamento, Escopo, StatusLancamento, FinCategoria } from './types';
import { hojeISO, addDias } from './format';

export interface ParsedLancamento {
    tipo: TipoLancamento;
    valor: number;
    descricao: string;
    data: string; // YYYY-MM-DD
    escopo: Escopo;
    status: StatusLancamento;
    categoriaSugeridaId?: string;
    categoriaSugeridaNome?: string;
    placa?: string;
}

// Regex placa Mercosul ou antiga: ABC1234, ABC1D23, ABC-1234
const PLACA_REGEX = /\b([A-Z]{3}[- ]?[0-9][A-Z0-9][0-9]{2})\b/i;

export function parseLinhaRapida(
    rawText: string,
    categoriasDisponiveis: FinCategoria[] = [],
    dataBase: string = hojeISO()
): ParsedLancamento | null {
    const text = (rawText || '').trim();
    if (!text) return null;

    let tipo: TipoLancamento = 'saida';
    let working = text;

    if (working.startsWith('>')) {
        tipo = 'transferencia';
        working = working.slice(1).trim();
    } else if (working.startsWith('+')) {
        tipo = 'entrada';
        working = working.slice(1).trim();
    } else if (working.startsWith('-')) {
        tipo = 'saida';
        working = working.slice(1).trim();
    }

    // Procura o valor no texto (primeiro número com suporte a R$, ponto e vírgula)
    // Ex: "R$ 1.500,00", "1500,50", "380", "22.379"
    const valorMatch = working.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i);
    if (!valorMatch) return null;

    const valorStr = valorMatch[1];
    let valor = 0;
    if (valorStr.includes(',') && valorStr.includes('.')) {
        valor = parseFloat(valorStr.replace(/\./g, '').replace(',', '.'));
    } else if (valorStr.includes(',')) {
        valor = parseFloat(valorStr.replace(',', '.'));
    } else if (valorStr.includes('.') && valorStr.split('.')[1]?.length === 3) {
        // Ex: 1.500 (milhar)
        valor = parseFloat(valorStr.replace(/\./g, ''));
    } else {
        valor = parseFloat(valorStr);
    }

    if (isNaN(valor) || valor <= 0) return null;

    // Remove o trecho do valor para sobrar a descrição e metadados
    let resto = (working.slice(0, valorMatch.index) + ' ' + working.slice((valorMatch.index || 0) + valorMatch[0].length)).trim();

    // Data: detecta "ontem", "anteontem", "amanha" ou dd/mm
    let data = dataBase;
    const ontemMatch = resto.match(/\b(ontem|anteontem|amanha|amanhã)\b/i);
    if (ontemMatch) {
        const p = ontemMatch[1].toLowerCase();
        if (p === 'ontem') data = addDias(dataBase, -1);
        else if (p === 'anteontem') data = addDias(dataBase, -2);
        else if (p === 'amanha' || p === 'amanhã') data = addDias(dataBase, 1);
        resto = resto.replace(ontemMatch[0], '').trim();
    } else {
        const dataMatch = resto.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
        if (dataMatch) {
            const dia = dataMatch[1].padStart(2, '0');
            const mes = dataMatch[2].padStart(2, '0');
            const ano = dataMatch[3] ? (dataMatch[3].length === 2 ? `20${dataMatch[3]}` : dataMatch[3]) : dataBase.slice(0, 4);
            data = `${ano}-${mes}-${dia}`;
            resto = resto.replace(dataMatch[0], '').trim();
        }
    }

    // Escopo PF ou PJ
    let escopo: Escopo = 'PF';
    const pjMatch = resto.match(/\b(pj|empresa|loja)\b/i);
    const pfMatch = resto.match(/\b(pf|pessoal|casa)\b/i);
    if (pjMatch) {
        escopo = 'PJ';
        resto = resto.replace(pjMatch[0], '').trim();
    } else if (pfMatch) {
        escopo = 'PF';
        resto = resto.replace(pfMatch[0], '').trim();
    }

    // Status: previsto ou pago
    let status: StatusLancamento = 'pago';
    const previstoMatch = resto.match(/\b(a pagar|a receber|previsto|pendente|boleto)\b/i);
    if (previstoMatch) {
        status = 'previsto';
        resto = resto.replace(previstoMatch[0], '').trim();
    }

    // Placa
    let placa: string | undefined;
    const placaMatch = resto.match(PLACA_REGEX);
    if (placaMatch) {
        placa = placaMatch[1].toUpperCase().replace('-', '');
        resto = resto.replace(placaMatch[0], '').trim();
    }

    // Limpa pontuações e espaços extras da descrição
    const descricao = resto.replace(/\s+/g, ' ').replace(/^[-+,; ]+|[-+,; ]+$/g, '').trim() || (tipo === 'entrada' ? 'Recebimento' : 'Pagamento');

    // Sugestão de categoria por palavras-chave
    let categoriaSugeridaId: string | undefined;
    let categoriaSugeridaNome: string | undefined;
    const descNorm = (descricao + ' ' + text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const catsFiltradas = categoriasDisponiveis.filter(c => c.tipo === (tipo === 'transferencia' ? 'saida' : tipo));
    let melhorScore = 0;

    for (const cat of catsFiltradas) {
        let score = 0;
        for (const kw of cat.palavras_chave || []) {
            const kwNorm = kw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (descNorm.includes(kwNorm)) {
                score += kwNorm.length; // palavras mais específicas ganham mais peso
            }
        }
        if (score > melhorScore) {
            melhorScore = score;
            categoriaSugeridaId = cat.id;
            categoriaSugeridaNome = cat.nome;
        }
    }

    return {
        tipo,
        valor,
        descricao,
        data,
        escopo,
        status,
        categoriaSugeridaId,
        categoriaSugeridaNome,
        placa,
    };
}
