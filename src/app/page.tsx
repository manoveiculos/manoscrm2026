export const dynamic = 'force-dynamic';
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
        .select('id, name, role')
        .eq('auth_id', session.user.id)
        .single();

    if (consultant) {
        userName = consultant.name.split(' ')[0];
    }

    const isAdmin = consultant?.role === 'admin' || session.user.email === 'alexandre_gorges@hotmail.com';

    // Fetch Metrics filtered by consultant — admin vê toda a equipe, consultor vê apenas seus dados
    const metricsResult = await metricsService.getFinancialMetrics(
        supabase,
        isAdmin ? undefined : (consultant?.id ?? undefined)
    );

    // Fetch Ranking to eliminate hardcoded text
    const ranking = await getSalesRanking();
    const mySales = metricsResult.salesCount;
    const topSales = ranking.length > 0 ? ranking[0].count : 10;
    const salesToTop = Math.max(0, topSales - mySales + 1);

    // Fetch AI insights - LOGICA CIRÚRGICA: 
    // Se for Admin/Marketing, vê a visão estratégica global.
    // Se for Consultor, vê a análise específica do seu atendimento (crm_daily_analysis).
    let aiInsights: Array<{ title: string; desc: string; time: string; color: string; leadId?: string }> = [];

    if (isAdmin) {
        const { data: globalAnalysis } = await supabase
            .from('intelligent_analysis_results')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (globalAnalysis?.recommended_actions) {
            aiInsights = (globalAnalysis.recommended_actions as any[]).map(action => ({
                title: action.title || 'Visão Estratégica',
                desc: action.description || action.reason || 'Análise de performance global executada.',
                time: 'Prio Alta',
                color: action.priority === 'high' ? 'red' : 'blue',
                leadId: action.lead_id, // Tenta capturar ID se existir na visão global
                leadName: action.lead_name // NOVO: Nome redundante para busca resiliente
            }));
        }
    } else {
        // Consultor vê sua análise diária personalizada
        const { data: personalAnalysis } = await supabase
            .from('crm_daily_analysis')
            .select('*')
            .eq('consultor_id', consultant?.id)
            .order('generated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (personalAnalysis?.analysis_json?.recommended_actions) {
            aiInsights = (personalAnalysis.analysis_json.recommended_actions as any[]).map(action => ({
                title: action.task || 'Ação Recomendada',
                desc: action.reason || 'Foque neste lead para aumentar sua conversão.',
                time: 'Sua Meta',
                color: 'red',
                leadId: action.lead_id, 
                leadName: action.lead_name || action.task?.split('para ')[1]?.split(' agora')[0] // Fallback inteligente: extrai nome da tarefa
            }));
        } else {
            // Fallback para consultores sem análise gerada ainda
            aiInsights = [
                { title: 'Oportunidade de Fechamento', desc: `Você tem ${metricsResult.leadCount} leads ativos. Foque nos estágios finais do funil.`, time: 'Sua Meta', color: 'red' },
                { title: 'Meta de Vendas', desc: `Faltam apenas ${salesToTop} vendas para você alcançar o topo do ranking este mês.`, time: 'Ranking', color: 'amber' }
            ];
        }
    }

    return (
        <DashboardClient 
            metrics={metricsResult} 
            userName={userName} 
            consultantId={consultant?.id}
            aiInsights={aiInsights.slice(0, 3)} 
            salesToTop={salesToTop}
        />
    );
}

