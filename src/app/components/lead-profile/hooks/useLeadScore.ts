import { useState, useEffect } from 'react';
import { calculateLeadScore, getScoreLabel } from '@/utils/calculateScore';
import { normalizeStatus } from '@/constants/status';

// interactionsCount e lastInteractionDate mantidos na assinatura por compatibilidade,
// mas o heurístico usa totalInteracoes: 0 para manter consistência com a lista
export function useLeadScore(lead: any, interactionsCount: number, lastInteractionDate?: string) {
    const [finalScore, setFinalScore] = useState(Number(lead.ai_score) || 0);
    const [scoreInfo, setScoreInfo] = useState(getScoreLabel(Number(lead.ai_score) || 0));

    useEffect(() => {
        const normalizedStatus = normalizeStatus(lead.status);
        const aiScore = Number(lead.ai_score);

        // REGRA INEGOCIÁVEL: Status final (Perdido/Vendido) SOBRESCREVE qualquer score da IA
        if (normalizedStatus === 'perdido') {
            setFinalScore(0);
            setScoreInfo({ label: 'PERDIDO', color: '#6b7280' });
            return;
        }
        if (normalizedStatus === 'vendido') {
            setFinalScore(100);
            setScoreInfo({ label: 'VENDIDO', color: '#f59e0b' });
            return;
        }

        // Prioridade 1: score real da IA (banco) — fonte de verdade
        if (aiScore > 0) {
            setFinalScore(aiScore);
            setScoreInfo(getScoreLabel(aiScore));
            return;
        }

        // Fallback heurístico — mesmo cálculo da lista (totalInteracoes: 0)
        const now = new Date();
        const createdAt = new Date(lead.created_at);
        const tempoFunilH = Math.max(0, (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60));

        const calculated = calculateLeadScore({
            status: normalizedStatus,
            tempoFunilHoras: tempoFunilH,
            totalInteracoes: 0,
            ultimaInteracaoH: tempoFunilH,
            temValorDefinido: !!lead.valor_investimento && lead.valor_investimento !== '0',
            temVeiculoInteresse: !!lead.vehicle_interest && lead.vehicle_interest !== '---'
        });

        setFinalScore(calculated);
        setScoreInfo(getScoreLabel(calculated));
    }, [lead]);

    return { finalScore, scoreInfo };
}
