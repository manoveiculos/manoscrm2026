// src/lib/leads/transferencia.ts — o que se grava no lead ao transferi-lo para outro consultor (PURO)
//
// Cada tabela de lead tem colunas diferentes. leads_master (4.147 dos 4.178 leads da lista) é um espelho
// e NÃO tem colunas de atendimento nem `vendedor`: gravar nelas dava
//   "Could not find the 'atendimento_iniciado_em' column of 'leads_master' in the schema cache"
// e a transferência de qualquer lead antigo falhava. Aqui cada tabela recebe só as colunas que tem
// (conferido no banco em 21/11/2026).

export type TabelaLead = 'leads_compra' | 'leads_manos_crm' | 'leads_distribuicao_crm_26' | 'leads_master' | 'leadsfacebook';

/** Tabelas com colunas de atendimento (atendimento_iniciado_em/por e ultima_interacao_humana). */
const COM_ATENDIMENTO: ReadonlySet<string> = new Set(['leads_compra', 'leads_manos_crm', 'leads_distribuicao_crm_26', 'leadsfacebook']);
/** Tabelas com a coluna de texto `vendedor`. */
const COM_VENDEDOR: ReadonlySet<string> = new Set(['leads_distribuicao_crm_26']);

export function atualizacaoDaTransferencia(
    tabela: string, destinatario: { id: string; name: string }, agoraIso: string,
): Record<string, unknown> {
    const u: Record<string, unknown> = {
        assigned_consultant_id: destinatario.id,
        status: 'new',   // volta para "novo": gera o aviso para o novo consultor
    };
    if (COM_ATENDIMENTO.has(tabela)) {
        u.atendimento_iniciado_em = null;    // o novo consultor inicia o atendimento
        u.atendimento_iniciado_por = null;
        u.ultima_interacao_humana = agoraIso;
    }
    if (COM_VENDEDOR.has(tabela)) u.vendedor = destinatario.name;
    return u;
}
