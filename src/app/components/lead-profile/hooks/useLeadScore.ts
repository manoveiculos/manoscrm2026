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

        // Fonte de Verdade Inquestionável: Score da IA vindo do Banco
        setFinalScore(aiScore);
        setScoreInfo(getScoreLabel(aiScore));
    }, [lead]);

    return { finalScore, scoreInfo };
}
