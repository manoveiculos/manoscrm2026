import { useState, useEffect } from 'react';
import { calculateLeadScore, getScoreLabel } from '@/utils/calculateScore';
import { normalizeStatus } from '@/constants/status';

export function useLeadScore(lead: any, interactionsCount: number, lastInteractionDate?: string) {
    const [finalScore, setFinalScore] = useState(Number(lead.ai_score) || 0);
    const [scoreInfo, setScoreInfo] = useState(getScoreLabel(finalScore));

    useEffect(() => {
        const now = new Date();
        const createdAt = new Date(lead.created_at);
        const tempoFunilH = Math.max(0, (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60));
        
        const lastDate = lastInteractionDate ? new Date(lastInteractionDate) : createdAt;
        const lastInterH = Math.max(0, (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60));

        const calculated = calculateLeadScore({
            status: normalizeStatus(lead.status),
            tempoFunilHoras: tempoFunilH,
            totalInteracoes: interactionsCount,
            ultimaInteracaoH: lastInterH,
            temValorDefinido: !!lead.valor_investimento && lead.valor_investimento !== '0',
            temVeiculoInteresse: !!lead.vehicle_interest && lead.vehicle_interest !== '---'
        });

        // Sync display score with 48h reset rule from original code
        const lastUpdate = lead.updated_at ? new Date(lead.updated_at).getTime() : new Date(lead.created_at).getTime();
        const fortyEightHours = 48 * 60 * 60 * 1000;
        
        if (Date.now() - lastUpdate > fortyEightHours) {
            setFinalScore(0);
            setScoreInfo(getScoreLabel(0));
        } else {
            setFinalScore(calculated);
            setScoreInfo(getScoreLabel(calculated));
        }
    }, [lead, interactionsCount, lastInteractionDate]);

    return {
        finalScore,
        scoreInfo
    };
}
