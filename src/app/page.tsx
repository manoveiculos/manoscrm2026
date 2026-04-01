export const dynamic = 'force-dynamic';
import React from 'react';
import { createClient } from '@/lib/supabase/server';
import { metricsService } from '@/lib/metricsService';
import DashboardClient from './DashboardClient';
import { redirect } from 'next/navigation';
import { getSalesRanking } from '@/lib/services/analyticsService';
import { leadService } from '@/lib/leadService';
import { normalizeStatus, STAGE_SLA_HOURS } from '@/constants/status';

export default async function V2Dashboard() {

    const supabase = await createClient();
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        redirect('/login');
    }

    // Fetch user details from unified consultants table
    let userName = 'Consultor';
    const { data: consultant } = await supabase
        .from('consultants_manos_crm')
        .select('id, name, role')
        .eq('auth_id', user.id)
        .single();

    if (consultant) {
        userName = consultant.name.split(' ')[0];
    }

    const isAdmin = consultant?.role === 'admin' || user.email === 'alexandre_gorges@hotmail.com';

    // Fetch Metrics filtered by consultant — admin vê toda a equipe, consultor vê apenas seus dados
    const metricsResult = await metricsService.getFinancialMetrics(
        supabase,
        isAdmin ? undefined : (consultant?.id ?? undefined)
    );

    // Fetch Ranking to eliminate hardcoded text
    const ranking = (await getSalesRanking()) as any[];
    const mySales = metricsResult.salesCount;
    const topSales = ranking.length > 0 ? (ranking[0].count || ranking[0].salesCount || 10) : 10;
    const salesToTop = Math.max(0, topSales - mySales + 1);

    // Sugestões da IA — geradas a partir dos LEADS REAIS do pipeline
    let aiInsights: Array<{ title: string; desc: string; time: string; color: string; leadId?: string; leadName?: string }> = [];

    try {
        const { leads: pipelineLeads } = await leadService.getLeadsPaginated(supabase, {
            consultantId: isAdmin ? undefined : consultant?.id,
            role: isAdmin ? 'admin' : 'consultant',
            pipelineOnly: true,
            limit: 50,
            page: 1,
        });

        const now = Date.now();

        // SUGESTÃO 1: Lead mais quente (maior ai_score >= 70)
        const hotLead = pipelineLeads
            .filter(l => (l.ai_score ?? 0) >= 70)
            .sort((a, b) => (b.ai_score ?? 0) - (a.ai_score ?? 0))[0];

        if (hotLead) {
            const nome = hotLead.name?.split(' ')[0] || 'Lead';
            const veiculo = hotLead.vehicle_interest || hotLead.interesse || '';
            aiInsights.push({
                title: `Contatar ${nome} — score ${hotLead.ai_score}`,
                desc: veiculo ? `Interesse em ${veiculo}. Lead quente, priorize o contato.` : 'Lead quente com alta probabilidade de conversão.',
                time: 'Quente',
                color: 'red',
                leadId: hotLead.id,
                leadName: hotLead.name,
            });
        }

        // SUGESTÃO 2: Cliente esperando mais tempo (SLA estourado ou próximo)
        const waitingLead = pipelineLeads
            .filter(l => {
                const stage = normalizeStatus(l.status);
                const sla = STAGE_SLA_HOURS[stage];
                if (!sla) return false;
                const ref = l.updated_at || l.created_at;
                if (!ref) return false;
                const hours = (now - new Date(ref).getTime()) / 3_600_000;
                return hours > sla * 0.7; // 70% do SLA = alerta
            })
            .sort((a, b) => {
                const aRef = a.updated_at || a.created_at;
                const bRef = b.updated_at || b.created_at;
                return new Date(aRef).getTime() - new Date(bRef).getTime(); // mais antigo primeiro
            })
            .filter(l => !hotLead || l.id !== hotLead.id)[0];

        if (waitingLead) {
            const nome = waitingLead.name?.split(' ')[0] || 'Lead';
            const ref = waitingLead.updated_at || waitingLead.created_at;
            const hours = Math.round((now - new Date(ref).getTime()) / 3_600_000);
            const stage = normalizeStatus(waitingLead.status);
            aiInsights.push({
                title: `${nome} esperando há ${hours}h`,
                desc: `No estágio "${stage}" — retome o contato para não perder.`,
                time: 'Esperando',
                color: 'amber',
                leadId: waitingLead.id,
                leadName: waitingLead.name,
            });
        }

        // SUGESTÃO 3: Lead esfriando (maior churn_probability > 40)
        const usedIds = [hotLead?.id, waitingLead?.id].filter(Boolean);
        const churnLead = pipelineLeads
            .filter(l => (l.churn_probability ?? 0) > 40 && !usedIds.includes(l.id))
            .sort((a, b) => (b.churn_probability ?? 0) - (a.churn_probability ?? 0))[0];

        if (churnLead) {
            const nome = churnLead.name?.split(' ')[0] || 'Lead';
            const lastRef = churnLead.updated_at || churnLead.created_at;
            const daysAgo = Math.round((now - new Date(lastRef).getTime()) / 86_400_000);
            aiInsights.push({
                title: `${nome} está esfriando — risco ${churnLead.churn_probability}%`,
                desc: daysAgo > 0 ? `Sem atualização há ${daysAgo} dia${daysAgo > 1 ? 's' : ''}. Reengaje antes de perder.` : 'Risco de abandono detectado. Ação imediata recomendada.',
                time: 'Esfriando',
                color: 'violet',
                leadId: churnLead.id,
                leadName: churnLead.name,
            });
        }

        // Se não encontrou nenhuma sugestão real
        if (aiInsights.length === 0) {
            aiInsights.push({
                title: 'Pipeline em dia',
                desc: 'Nenhum lead crítico no momento. Continue acompanhando seus atendimentos.',
                time: 'OK',
                color: 'emerald',
            });
        }
    } catch (err) {
        console.error('[page.tsx] Erro ao gerar sugestões IA:', err);
        aiInsights = [{
            title: 'Pipeline em dia',
            desc: 'Nenhum lead crítico no momento.',
            time: 'OK',
            color: 'emerald',
        }];
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

