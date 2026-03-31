import { createClient } from '@supabase/supabase-js';

// Cliente admin seguro para uso server-side (API routes / crons)
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
);

const CAT_NAMES: Record<string, string> = {
    'score_alto_demais': 'IA inflando score de leads desengajados',
    'score_baixo_demais': 'IA ignorando leads com alto interesse real',
    'lead_morto': 'IA classificando SPAM/Número Errado como lead quente',
    'lead_quente_ignorado': 'IA não dando prioridade a quem quer fechar hoje',
    'status_errado': 'IA errando a etapa do funil (Pipeline)',
};

function buildGlobalContext(recentFeedbacks: any[]): string {
    if (!recentFeedbacks.length) return '';

    const patterns: Record<string, number> = {};
    for (const fb of recentFeedbacks) {
        patterns[fb.category] = (patterns[fb.category] || 0) + 1;
    }

    const topPatterns = Object.entries(patterns).sort(([, a], [, b]) => b - a).slice(0, 3);
    if (!topPatterns.length) return '';

    let ctx = '\n📊 PADRÕES DE ERRO DETECTADOS NAS ÚLTIMAS 4 SEMANAS:\n';
    for (const [cat, count] of topPatterns) {
        ctx += `- ${CAT_NAMES[cat] || cat}: ${count} ocorrências reportadas.\n`;
    }
    ctx += 'AJUSTE GLOBAL: Se este lead apresentar características similares às categorias acima, seja mais conservador no score.\n';

    const altoErrors = recentFeedbacks.filter(f => f.category === 'score_alto_demais');
    if (altoErrors.length >= 5) {
        const avgDays = altoErrors.reduce((sum, f) => sum + (f.last_interaction_days || 0), 0) / altoErrors.length;
        const avgInteractions = altoErrors.reduce((sum, f) => sum + (f.total_interactions || 0), 0) / altoErrors.length;
        ctx += `\n🔧 REGRA: Leads com mais de ${Math.round(avgDays)} dias sem interação e menos de ${Math.round(avgInteractions)} interações totais são FRIOS. Ignore scores altos nestes casos.\n`;
    }

    const baixoErrors = recentFeedbacks.filter(f => f.category === 'score_baixo_demais');
    if (baixoErrors.length >= 3) {
        ctx += `\n🔧 REGRA: Prioridade total para quem teve interação nas últimas 24h, mesmo se o funil for inicial.\n`;
    }

    return ctx;
}

/**
 * Retorna apenas padrões globais de erro da IA (últimos 30 dias).
 * Usar em crons batch (1 chamada para N leads — eficiente).
 */
export async function getGlobalFeedbackContext(): Promise<string> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentFeedbacks } = await supabase
        .from('ai_feedback')
        .select('category, reason, correct_label, reported_score, lead_status, days_in_funnel, total_interactions, last_interaction_days')
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(50);

    if (!recentFeedbacks?.length) return '';

    let context = '\n\n═══════════════════════════════════════════════════════════\n';
    context += '🧠 SISTEMA DE APRENDIZADO DA IA (MANOS V2)\n';
    context += '═══════════════════════════════════════════════════════════\n';
    context += buildGlobalContext(recentFeedbacks);
    context += '═══════════════════════════════════════════════════════════\n';
    return context;
}

/**
 * Retorna contexto completo: feedbacks específicos do lead + padrões globais.
 * Usar em rotas que processam 1 lead por vez.
 */
export async function getAIContext(leadId: string): Promise<string> {
    const cleanId = leadId.toString().replace(/^(main_|crm26_|dist_)/, '');

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: leadFeedbacks }, { data: recentFeedbacks }] = await Promise.all([
        supabase
            .from('ai_feedback')
            .select('*')
            .eq('lead_id', cleanId)
            .order('created_at', { ascending: false })
            .limit(5),
        supabase
            .from('ai_feedback')
            .select('category, reason, correct_label, reported_score, lead_status, days_in_funnel, total_interactions, last_interaction_days')
            .gte('created_at', thirtyDaysAgo)
            .order('created_at', { ascending: false })
            .limit(50),
    ]);

    let context = '\n\n═══════════════════════════════════════════════════════════\n';
    context += '🧠 SISTEMA DE APRENDIZADO DA IA (MANOS V2)\n';
    context += '═══════════════════════════════════════════════════════════\n';

    if (leadFeedbacks && leadFeedbacks.length > 0) {
        context += '\n⚠️ FEEDBACKS DOS CONSULTORES SOBRE ESTE LEAD ESPECÍFICO:\n';
        for (const fb of leadFeedbacks) {
            context += `- [${new Date(fb.created_at).toLocaleDateString()}] ${fb.reported_by} reportou: "${fb.reason}". `;
            context += `Score era ${fb.reported_score}% (${fb.reported_label}), deveria ser "${fb.correct_label}". `;
            context += `Categoria: ${fb.category}.\n`;
        }
        context += 'INSTRUÇÃO: Não repita os erros acima. Ajuste sua análise com base nestas correções humanas.\n';
    }

    context += buildGlobalContext(recentFeedbacks || []);
    context += '═══════════════════════════════════════════════════════════\n';
    return context;
}
