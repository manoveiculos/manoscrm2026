import { supabase } from '@/lib/supabase';

export async function getAIContext(leadId: string): Promise<string> {
    const cleanId = leadId.toString().replace(/^(main_|crm26_|dist_)/, '');

    // 1. Buscar feedbacks DESTE lead específico
    const { data: leadFeedbacks } = await supabase
        .from('ai_feedback')
        .select('*')
        .eq('lead_id', cleanId)
        .order('created_at', { ascending: false })
        .limit(5);

    // 2. Buscar feedbacks GERAIS recentes (últimos 30 dias) para padrões
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentFeedbacks } = await supabase
        .from('ai_feedback')
        .select('category, reason, correct_label, reported_score, lead_status, days_in_funnel, total_interactions, last_interaction_days')
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(50);

    let context = '\n\n═══════════════════════════════════════════════════════════\n';
    context += '🧠 SISTEMA DE APRENDIZADO DA IA (MANOS V2)\n';
    context += '═══════════════════════════════════════════════════════════\n';

    if (leadFeedbacks && leadFeedbacks.length > 0) {
        context += '\n⚠️ FEEDBACKS DOS CONSULTORES SOBRE ESTE LEAD ESPECÍFICO:\n';
        for (const fb of leadFeedbacks) {
            context += `- [${new Date(fb.created_at).toLocaleDateString()}] ${fb.reported_by} reportou erro de classificação: "${fb.reason}". `;
            context += `O Score era ${fb.reported_score}% (${fb.reported_label}), mas o vendedor afirmou que deveria ser "${fb.correct_label}". `;
            context += `Categoria: ${fb.category}.\n`;
        }
        context += 'INSTRUÇÃO: Não repita os erros acima. Ajuste sua análise de score baseando-se nestas correções humanas.\n';
    }

    if (recentFeedbacks && recentFeedbacks.length > 0) {
        // Agrupar por categoria para identificar padrões
        const patterns: Record<string, number> = {};
        for (const fb of recentFeedbacks) {
            patterns[fb.category] = (patterns[fb.category] || 0) + 1;
        }

        const topPatterns = Object.entries(patterns)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3);

        if (topPatterns.length > 0) {
            context += '\n📊 PADRÕES DE ERRO DETECTADOS NAS ÚLTIMAS 4 SEMANAS:\n';
            for (const [cat, count] of topPatterns) {
                const catNames: Record<string, string> = {
                    'score_alto_demais': 'IA inflando score de leads desengajados',
                    'score_baixo_demais': 'IA ignorando leads com alto interesse real',
                    'lead_morto': 'IA classificando SPAM/Número Errado como lead quente',
                    'lead_quente_ignorado': 'IA não dando prioridade a quem quer fechar hoje',
                    'status_errado': 'IA errando a etapa do funil (Pipeline)',
                };
                context += `- ${catNames[cat] || cat}: ${count} ocorrências reportadas.\n`;
            }
            context += 'AJUSTE GLOBAL: Se este lead apresentar características similares às categorias acima, seja mais conservador no score.\n';

            // Regras aprendidas dinâmicas
            const altoErrors = recentFeedbacks.filter(f => f.category === 'score_alto_demais');
            if (altoErrors.length >= 5) {
                const avgDays = altoErrors.reduce((sum, f) => sum + (f.last_interaction_days || 0), 0) / altoErrors.length;
                const avgInteractions = altoErrors.reduce((sum, f) => sum + (f.total_interactions || 0), 0) / altoErrors.length;
                context += `\n🔧 REGRA DE CALIBRAÇÃO: Vendedores afirmam que leads com mais de ${Math.round(avgDays)} dias sem interação e menos de ${Math.round(avgInteractions)} interações totais são FRIOS. Ignore scores altos de engajamento nestes casos.\n`;
            }

            const baixoErrors = recentFeedbacks.filter(f => f.category === 'score_baixo_demais');
            if (baixoErrors.length >= 3) {
                context += `\n🔧 REGRA DE CALIBRAÇÃO: Prioridade total para quem teve interação nas últimas 24h, mesmo se o funil for inicial.\n`;
            }
        }
    }

    context += '═══════════════════════════════════════════════════════════\n';
    return context;
}
