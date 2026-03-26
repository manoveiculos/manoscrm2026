/**
 * dataService.ts - REDIRECIONAMENTO DE COMPATIBILIDADE (FASE 1B)
 * O código original de 2500 linhas foi decomposto em src/lib/services/.
 */

export { dataService } from './services';
export { dataService as default } from './services';

// Re-exportando tipos vinculados ao dataService se necessário em tempo de compilação
export * from './types';
