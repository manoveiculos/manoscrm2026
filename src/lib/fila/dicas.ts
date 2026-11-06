// src/lib/fila/dicas.ts — DICA DA SEMANA no topo da Minha Fila
//
// Uma dica por semana do ano, em rodízio. Regras do playbook da Manos:
// nada de preço ou proposta final sem aprovação; a Laura (IA) só qualifica e
// agenda. Texto curto: o vendedor lê no celular, entre um cliente e outro.

export const DICAS_DA_SEMANA: string[] = [
    'Na 1ª conversa, pergunte entrada, troca e prazo. São essas três respostas que dão o selo Quente.',
    'O alerta de lead quente dispara com 15 minutos sem resposta humana. Responda antes dele.',
    'Toda perda com o motivo certo volta para você: quando chega o carro que faltou, o lead aparece em Recuperável.',
    'Visita marcada para amanhã? Confirme hoje à tarde com uma mensagem curta e o nome do carro.',
    'Preço e proposta final passam pela gerência. Combine a visita primeiro; a negociação é na loja.',
    'Ligou e o cliente não atendeu? Marque o retorno na hora. Lead sem próximo contato fica parado na sua fila.',
    'Cliente que voltou a escrever é o lead mais fácil da semana. Responda antes de qualquer outro.',
    'Carro na troca: peça fotos e quilometragem pelo WhatsApp antes da visita. A avaliação fica mais rápida.',
];

/** Semana ISO simplificada: muda toda segunda-feira. */
export function dicaDaSemana(agora: number = Date.now()): string {
    const semana = Math.floor((agora / 86_400_000 + 3) / 7); // 01/01/1970 foi quinta → +3 alinha na segunda
    return DICAS_DA_SEMANA[semana % DICAS_DA_SEMANA.length];
}
