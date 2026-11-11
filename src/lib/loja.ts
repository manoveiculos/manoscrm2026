// src/lib/loja.ts — dados fixos da Manos Veículos (PURO)
//
// Fonte: Alexandre (11/11/2026). Usado pela Laura (prompt) e pelos atalhos da tela Conversas
// (@endereco, @horario, @pix, @equipe, @apresentacao). Mudou o endereço? Muda aqui, em um só lugar.

export const LOJA = {
    nome: 'Manos Veículos',
    cidade: 'Rio do Sul/SC',
    endereco: 'Rua Dom Pedro II, nº 374, Rio do Sul, SC',
    horario: 'Segunda a sexta, 08h às 18h. Sábado, 08h às 12h. Domingo fechado.',
    pixCnpj: '28.918.081/0001-22',
    equipe: {
        vendedores: ['Sergio', 'Wilson', 'Victor'],
        comprador: 'Felipe Ledra',
        cobranca: 'Camila',
        administrativo: 'Alexandre',
    },
} as const;

export const primeiroNome = (n: string | null | undefined): string => (n || '').trim().split(/\s+/)[0] || '';

export function textoEndereco(): string {
    return `Estamos na ${LOJA.endereco}. Te esperamos por lá! 🙂`;
}

export function textoHorario(): string {
    return `Nosso horário: ${LOJA.horario}`;
}

export function textoPix(): string {
    return `Pix da ${LOJA.nome} (CNPJ): ${LOJA.pixCnpj}`;
}

/** Bloco da loja para o prompt da Laura: ela informa endereço, horário e equipe; Pix e pagamento ficam com o consultor. */
export function blocoLojaParaPrompt(): string {
    return [
        'DADOS DA LOJA (pode informar quando o cliente perguntar)',
        `- Endereço: ${LOJA.endereco}.`,
        `- Horário: ${LOJA.horario}`,
        `- Vendedores (consultores): ${LOJA.equipe.vendedores.join(', ')}. Só cite o nome do consultor que o sistema indicar para este cliente.`,
        '- Pagamento, Pix e documentos: quem passa é o consultor, nunca você.',
    ].join('\n');
}

/** Apresentação do consultor ao cliente (1 toque na tela Conversas). */
export function textoApresentacao(consultor: string | null | undefined, cliente: string | null | undefined): string {
    const eu = primeiroNome(consultor);
    const ele = primeiroNome(cliente);
    const quem = eu ? `Aqui é o ${eu}, consultor da ${LOJA.nome}` : `Aqui é da equipe da ${LOJA.nome}`;
    return `${ele ? `Oi, ${ele}!` : 'Oi!'} ${quem}. Vou continuar o seu atendimento por aqui 🙂`;
}
