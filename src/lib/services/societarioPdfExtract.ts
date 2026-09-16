import { getDocumentProxy } from 'unpdf';

interface Pedaco {
    texto: string;
    x: number;
    y: number;
}

// Rótulo e valor da mesma célula ficam na mesma altura (diferença < 1pt);
// linhas vizinhas da tabela ficam a ~10pt uma da outra.
const TOLERANCIA_LINHA = 3;

/**
 * Extrai o texto do PDF reconstruindo as linhas pela posição visual (y, depois x).
 * A ordem crua do PDF solta rótulo e valor ("GWM Haval...Veículo:"), por isso
 * não dá pra usar o texto corrido direto no parser.
 */
export async function extrairLinhasPdf(dados: Uint8Array): Promise<string> {
    const pdf = await getDocumentProxy(dados);
    const linhas: string[] = [];

    for (let n = 1; n <= pdf.numPages; n++) {
        const pagina = await pdf.getPage(n);
        const { items } = await pagina.getTextContent();

        const pedacos: Pedaco[] = [];
        for (const item of items as any[]) {
            if (typeof item.str !== 'string' || !item.str.trim()) continue;
            pedacos.push({ texto: item.str.trim(), x: item.transform[4], y: item.transform[5] });
        }
        pedacos.sort((a, b) => b.y - a.y);

        let atual: Pedaco[] = [];
        const fecharLinha = () => {
            if (atual.length === 0) return;
            linhas.push(atual.sort((a, b) => a.x - b.x).map((p) => p.texto).join(' '));
            atual = [];
        };

        for (const pedaco of pedacos) {
            if (atual.length > 0 && Math.abs(atual[0].y - pedaco.y) > TOLERANCIA_LINHA) fecharLinha();
            atual.push(pedaco);
        }
        fecharLinha();
    }

    return linhas.join('\n');
}
