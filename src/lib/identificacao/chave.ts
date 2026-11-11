// Chave geral da identificação automática de nome e carro (arquivo mínimo, sem dependências).
/** Desligada por padrão: só liga com WA_IDENTIFICACAO=on, depois da migration 20261107_nome_interesse_auto. */
export function identificacaoLigada(): boolean {
    return (process.env.WA_IDENTIFICACAO || '').trim().toLowerCase() === 'on';
}
