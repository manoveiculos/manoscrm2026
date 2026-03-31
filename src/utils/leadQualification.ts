// src/utils/leadQualification.ts
import { Lead } from '@/lib/types';

/**
 * Define se um lead é considerado "Qualificado" para o Pipeline de Vendas.
 * Critérios:
 * 1. Possui um nome real (não genérico, não apenas telefone)
 */
export function isLeadQualified(lead: Lead): boolean {
    if (!lead) return false;
    
    // Suporte a campo 'name' (V2) ou 'nome' (CRM26)
    const rawName = (lead.name || (lead as any).nome || '').trim();
    if (!rawName || rawName === '---') return false;

    const lowerName = rawName.toLowerCase();
    
    // Lista de nomes genéricos que indicam falta de qualificação inicial
    const genericNames = [
        'lead w', 
        'lead whatsapp', 
        'sem nome', 
        'cliente', 
        'contato whatsapp',
        'novo lead'
    ];

    if (lowerName.length < 2) return false;
    if (genericNames.some(g => lowerName.includes(g))) return false;
    
    // Se o nome contém muitos números, provavelmente é apenas o telefone
    const digitCount = (lowerName.match(/\d/g) || []).length;
    if (digitCount > 5) return false;

    return true;
}

/**
 * Legado/Placeholder: Mantido para compatibilidade, mas sempre retorna true
 * já que a nutrição foi removida.
 */
export function isLeadEngaged(lead: Lead): boolean {
    return true;
}

/**
 * Segmentação solicitada pelo usuário:
 * - Leads COM nome -> ACTIVE_PIPELINE
 * - Leads SEM nome -> TRIAGE (Central da IA)
 */
export function getLeadSegmentation(lead: Lead): 'ACTIVE_PIPELINE' | 'TRIAGE' {
    return isLeadQualified(lead) ? 'ACTIVE_PIPELINE' : 'TRIAGE';
}

/**
 * Retorna o motivo legível pelo qual um lead foi desqualificado do pipeline.
 */
export function getLeadUnqualifiedReason(lead: Lead): string | null {
    if (!lead) return null;
    
    const rawName = (lead.name || (lead as any).nome || '').trim();
    if (!rawName || rawName === '---') return 'Sem nome informado';

    const lowerName = rawName.toLowerCase();
    
    if (lowerName.length < 2) return 'Nome muito curto';

    const genericNames = [
        'lead w', 
        'lead whatsapp', 
        'sem nome', 
        'cliente', 
        'contato whatsapp',
        'novo lead'
    ];

    if (genericNames.some(g => lowerName.includes(g))) return 'Nome genérico';
    
    // Se o nome contém muitos números, provavelmente é apenas o telefone
    const digitCount = (lowerName.match(/\d/g) || []).length;
    if (digitCount > 5) return 'Apenas telefone';

    return null;
}
