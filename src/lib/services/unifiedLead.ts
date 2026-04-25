/**
 * Helpers para o UID composto da view leads_unified ("table:id").
 *
 * Permite o /lead/[id] ler/escrever na tabela correta sem reimplementar
 * detecção de origem em toda página.
 */

export type LeadTable =
    | 'leads_manos_crm'
    | 'leads_compra'
    | 'leads_distribuicao_crm_26'
    | 'leads_master';

export interface ParsedUid {
    table: LeadTable;
    nativeId: string;
}

const VALID_TABLES = new Set<LeadTable>([
    'leads_manos_crm',
    'leads_compra',
    'leads_distribuicao_crm_26',
    'leads_master',
]);

export function parseUid(uid: string): ParsedUid | null {
    if (!uid) return null;
    const decoded = decodeURIComponent(uid);
    const idx = decoded.indexOf(':');
    if (idx <= 0) {
        // Compatibilidade com IDs antigos que não tinham prefixo:
        // assume leads_manos_crm
        return { table: 'leads_manos_crm', nativeId: decoded };
    }
    const table = decoded.slice(0, idx) as LeadTable;
    const nativeId = decoded.slice(idx + 1);
    if (!VALID_TABLES.has(table) || !nativeId) return null;
    return { table, nativeId };
}

export function buildUid(table: LeadTable, nativeId: string): string {
    return `${table}:${nativeId}`;
}

/**
 * Mapa de aliases de campo por tabela. Usado pra normalizar nomes na UI
 * sem precisar de lógica espalhada.
 */
export const FIELD_ALIASES: Record<LeadTable, Record<string, string>> = {
    leads_manos_crm: {
        name: 'name', phone: 'phone', vehicleInterest: 'vehicle_interest',
        source: 'source', createdAt: 'created_at', updatedAt: 'updated_at',
    },
    leads_compra: {
        name: 'nome', phone: 'telefone', vehicleInterest: 'veiculo_original',
        source: 'origem', createdAt: 'criado_em', updatedAt: 'atualizado_em',
    },
    leads_distribuicao_crm_26: {
        name: 'nome', phone: 'telefone', vehicleInterest: 'vehicle_interest',
        source: 'origem', createdAt: 'criado_em', updatedAt: 'atualizado_em',
    },
    leads_master: {
        name: 'name', phone: 'phone', vehicleInterest: 'vehicle_interest',
        source: 'source', createdAt: 'created_at', updatedAt: 'updated_at',
    },
};
