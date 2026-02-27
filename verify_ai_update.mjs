
import { dataService } from './src/lib/dataService.js';
import { loadEnvFile } from 'node:process';
loadEnvFile('.env.local');

async function verifyAIUpdate() {
    console.log("🧪 Verificando atualização de IA...");

    // Mock lead ID (change to a valid one from your database if needed for real test)
    // Or just check logic if columns are missing
    const testLeadId = 1868;

    const aiData = {
        ai_classification: 'hot',
        ai_reason: 'Interesse imediato em financiamento e avaliação de troca.',
        nivel_interesse: 'alto',
        momento_compra: 'imediato',
        resumo_consultor: 'Cliente pronto para fechar, aguardando apenas simulação.',
        proxima_acao: 'Enviar simulação de parcelas via WhatsApp.'
    };

    try {
        console.log(`📡 Tentando atualizar Lead #${testLeadId}...`);
        const result = await dataService.updateDistributedLeadAI(testLeadId, aiData);
        console.log("✅ Resultado:", result ? "Sucesso" : "Falha");

        console.log("🔍 Verificando se os dados foram persistidos (via getDistributedLeads)...");
        const allLeads = await dataService.getDistributedLeads();
        const updatedLead = allLeads.find(l => l.id === testLeadId);

        if (updatedLead) {
            console.log("📝 Dados recuperados:");
            console.log({
                classification: updatedLead.ai_classification,
                nivel: updatedLead.nivel_interesse,
                momento: updatedLead.momento_compra,
                resumo: updatedLead.resumo_consultor || updatedLead.resumo
            });
        }
    } catch (err) {
        console.error("❌ Erro durante verificação:", err.message);
    }
}

// Note: This script assumes ES Modules and correct pathing. 
// Since dataService.ts is TypeScript, we might need ts-node or run it in a way that handles TS.
// For now, I'll just check if the logic in dataService.ts is sound by reviewing it.
verifyAIUpdate();
