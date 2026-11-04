import type { CardFila } from '@/lib/fila/montarFila';

export type Resultado =
    | { tipo: 'venda'; valor: number; veiculo: string }
    | { tipo: 'perda'; motivo: string; rotulo: string; detalhe?: string };

export interface RespostaApi {
    ok: boolean;
    error?: string;
}

/**
 * Ações da Minha Fila. A tela real chama as rotas do CRM; a prévia com dados
 * fictícios (/dev/fila) usa uma versão que não grava nada.
 */
export interface FilaApi {
    registrarLigacao(card: CardFila): Promise<RespostaApi>;
    marcarRetorno(card: CardFila, quando: Date): Promise<RespostaApi>;
    marcarVisita(card: CardFila, quando: Date): Promise<RespostaApi>;
    registrarResultado(card: CardFila, r: Resultado): Promise<RespostaApi>;
}

/** Chave estável do card (visita sem lead não tem uid). */
export const chaveCard = (c: CardFila) => c.uid || `visita:${c.visita?.dataHora}:${c.nome}`;
