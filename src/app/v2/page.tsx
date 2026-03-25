import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { metricsService } from '@/lib/metricsService';
import DashboardClient from './DashboardClient';
import { redirect } from 'next/navigation';
import { getSalesRanking } from '@/lib/services/analyticsService';

export default async function V2Dashboard() {

    const supabase = await createClient();
    
    // Check authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        redirect('/login');
    }

    // Fetch user details from unified consultants table
    let userName = 'Consultor';
    const { data: consultant } = await supabase
        .from('consultants_manos_crm')
        .select('name')
        .eq('auth_id', session.user.id)
        .single();
    
    if (consultant) {
        userName = consultant.name.split(' ')[0];
    }

    // Fetch Metrics using unified tables
    const metricsResult = await metricsService.getFinancialMetrics(supabase);

    // Fetch Ranking to eliminate hardcoded text
    const ranking = await getSalesRanking();
    const mySales = metricsResult.salesCount;
    const topSales = ranking.length > 0 ? ranking[0].count : 10;
    const salesToTop = Math.max(0, topSales - mySales + 1);

    // Fetch AI insights from intelligent_analysis_results
    const { data: aiResults } = await supabase
        .from('intelligent_analysis_results')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    const aiInsights = aiResults?.recommended_actions ? (aiResults.recommended_actions as any[]).map(action => ({
        title: action.title || 'Insight da IA',
        desc: action.description || action.reason || 'Análise em tempo real disponível.',
        time: 'Prio Alta',
        color: action.priority === 'high' ? 'red' : 'blue'
    })) : [
        { title: 'Oportunidade de Fechamento', desc: `Existem ${metricsResult.leadCount} leads ativos. Foque nos estágios finais do funil.`, time: 'Prioridade Alta', color: 'red' },
        { title: 'Desempenho Atual', desc: `Sua taxa de conversão é de ${metricsResult.conversionRate?.toFixed(1)}%. Boa performance!`, time: 'Relatório Diário', color: 'emerald' },
        { title: 'Meta de Vendas', desc: `Faltam apenas ${salesToTop} vendas para você alcançar o topo do ranking este mês.`, time: 'Ranking', color: 'amber' }
    ];

    return (
        <DashboardClient 
            metrics={metricsResult} 
            userName={userName} 
            aiInsights={aiInsights.slice(0, 3)} 
            salesToTop={salesToTop}
        />
    );
}

