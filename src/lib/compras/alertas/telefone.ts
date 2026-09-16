/**
 * Normalização de celular brasileiro para envio via WhatsApp.
 *
 * Origem do problema: a Central de Compras aceitava qualquer coisa no campo
 * de WhatsApp. Havia alerta ativo gravado com 10 dígitos — "(47) 9917-3286" —
 * que nenhum provider consegue entregar, porque celular no Brasil tem 9 dígitos
 * depois do DDD desde 2013.
 */

export interface TelefoneNormalizado {
    /** Só dígitos, com DDI: 5547999173286 */
    e164: string;
    /** Sem DDI, 11 dígitos: 47999173286 */
    nacional: string;
    /** Exibição: (47) 99917-3286 */
    formatado: string;
    /** true quando precisamos inserir o 9º dígito que faltava */
    corrigido: boolean;
}

export class TelefoneInvalidoError extends Error {
    constructor(public readonly motivo: string) {
        super(motivo);
        this.name = 'TelefoneInvalidoError';
    }
}

export function normalizarCelular(bruto: string | null | undefined): TelefoneNormalizado {
    let d = (bruto || '').replace(/\D/g, '');

    // Tira DDI se veio junto
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
    // Tira zero de operadora (047...)
    if (d.length === 12 && d.startsWith('0')) d = d.slice(1);
    if (d.length === 11 && d.startsWith('0')) d = d.slice(1);

    if (d.length < 10) {
        throw new TelefoneInvalidoError('Número incompleto — informe DDD + 9 dígitos.');
    }
    if (d.length > 11) {
        throw new TelefoneInvalidoError('Número com dígitos demais — confira o DDD.');
    }

    const ddd = d.slice(0, 2);
    let numero = d.slice(2);
    let corrigido = false;

    if (Number(ddd) < 11 || Number(ddd) > 99) {
        throw new TelefoneInvalidoError(`DDD ${ddd} não existe.`);
    }

    // 10 dígitos: celular antigo (começa em 6-9) ganha o nono dígito.
    // Fixo (começa em 2-5) não recebe WhatsApp de campanha — barramos.
    if (numero.length === 8) {
        if (/^[6-9]/.test(numero)) {
            numero = `9${numero}`;
            corrigido = true;
        } else {
            throw new TelefoneInvalidoError('Isso é um telefone fixo — o aviso precisa de um celular com WhatsApp.');
        }
    }

    if (numero.length !== 9 || !numero.startsWith('9')) {
        throw new TelefoneInvalidoError('Celular inválido — o número deve começar com 9 depois do DDD.');
    }

    const nacional = `${ddd}${numero}`;
    return {
        e164: `55${nacional}`,
        nacional,
        formatado: `(${ddd}) ${numero.slice(0, 5)}-${numero.slice(5)}`,
        corrigido,
    };
}

/** Versão que não estoura: devolve null quando o número não presta. */
export function tentarNormalizarCelular(bruto: string | null | undefined): TelefoneNormalizado | null {
    try {
        return normalizarCelular(bruto);
    } catch {
        return null;
    }
}
