/**
 * INDEX DE COMPATIBILIDADE (FASE 1B/2/4)
 * Centraliza e re-exporta todos os serviços especializados como o objeto legacy 'dataService'.
 */

import * as leadRouter from './leadRouter';
import * as leadCrud from './leadCrud';
import * as interactionService from './interactionService';
import * as inventoryService from './inventoryService';
import * as consultantService from './consultantService';
import * as salesService from './salesService';
import * as analyticsService from './analyticsService';
import * as followUpService from './followUpService';
import * as purchaseService from './purchaseService';
import * as deprecated from './deprecated';
import { setGlobalClient } from './supabaseClients';

// Re-exports individuais para novos componentes
export * from './leadRouter';
export * from './leadCrud';
export * from './interactionService';
export * from './inventoryService';
export * from './consultantService';
export * from './salesService';
export * from './analyticsService';
export * from './followUpService';
export * from './purchaseService';

// Objeto dataService para compatibilidade retroativa total (V1 e V2 Legada)
export const dataService: any = {};

// Merge manual via Object.assign para garantir exportação limpa no Turbopack
Object.assign(dataService, 
    leadRouter,
    leadCrud,
    interactionService,
    inventoryService,
    consultantService,
    salesService,
    analyticsService,
    followUpService,
    purchaseService,
    deprecated
);

// Métodos especiais que podem precisar de bind ou lógica extra
dataService.setClient = function(client: any) { 
    (this as any)._client = client; 
    setGlobalClient(client); // Sincroniza com os serviços modulares (Fase 4)
};
dataService.getClient = function() { return (this as any)._client || leadCrud.getLeads; };

export default dataService;
