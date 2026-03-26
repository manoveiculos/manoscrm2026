import { supabase } from './supabaseClients';

/**
 * @DEPRECATED — Código legado. Candidato para remoção após validação.
 * Cada função aqui foi identificada como não utilizada internamente na V2.
 * NÃO DELETAR até confirmar que a V1 (extensão ou legados) também não as usa.
 */

export async function autoDistributePendingCRM26() {
    console.warn("DEPRECATED: autoDistributePendingCRM26 chamado.");
    // Lógica desativada no dataService original para evitar distribuição fantasma
    return;
}

export async function autoRedistributeLeads() {
    console.warn("DEPRECATED: autoRedistributeLeads chamado.");
    // Lógica desativada no dataService original
    return;
}

export async function pickNextConsultantRoundRobin() {
    // Versão alternativa ou antiga do pickNextConsultant
    return null;
}
