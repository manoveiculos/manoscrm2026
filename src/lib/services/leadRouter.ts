/**
 * LOGICA DE ROTEAMENTO DE TABELA POR PREFIXO (main_, crm26_, dist_)
 * Crucial para manter V1 e V2 funcionando juntos.
 */

export function getTableForLead(leadId: string): string {
    if (!leadId) return 'leads_master';
    if (leadId.startsWith('main_')) return 'leads_manos_crm';
    if (leadId.startsWith('crm26_')) return 'leads_distribuicao_crm_26';
    if (leadId.startsWith('dist_')) return 'leads_distribuicao';
    if (leadId.startsWith('master_')) return 'leads_master';
    return 'leads_master'; // fallback
}

export function stripPrefix(leadId: string): string {
    if (!leadId) return '';
    return leadId.replace(/^(main_|crm26_|dist_|master_)/, '');
}

export function isUUID(id: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
}

export function getSourceFromId(leadId: string): 'main' | 'crm26' | 'dist' | 'unknown' {
    if (leadId.startsWith('main_')) return 'main';
    if (leadId.startsWith('crm26_')) return 'crm26';
    if (leadId.startsWith('dist_')) return 'dist';
    return 'unknown';
}
