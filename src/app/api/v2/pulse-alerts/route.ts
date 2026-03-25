import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const consultantName = searchParams.get('consultantName'); // Extensão passa o nome ou ID

        if (!consultantName) {
            return NextResponse.json({ error: 'consultantName is required' }, { status: 400 });
        }

        // Busca o ID do consultor pelo nome (ou assume que já é o ID)
        const { data: consultant } = await supabaseAdmin
            .from('consultants_manos_crm')
            .select('id, name')
            .ilike('name', `${consultantName}%`)
            .single();

        const consultantId = consultant ? consultant.id : consultantName; // Fallback se passar ID direto

        // Buscar leads deste consultor que:
        // 1. Estão em status 'new' ou 'received' há muito tempo
        // 2. Têm agendamento para hoje
        // 3. Score alto (> 80) e status ativo

        const { data: leads, error } = await supabaseAdmin
            .from('leads_manos_crm')
            .select('id, name, phone, status, ai_score, scheduled_at, updated_at')
            .eq('assigned_consultant_id', consultantId)
            .not('status', 'in', '("closed", "lost", "comprado", "lixo", "desqualificado")')
            .order('ai_score', { ascending: false });

        if (error) {
            console.error("Pulse Alerts Error:", error);
            throw error;
        }

        const alerts = [];
        const now = new Date();

        for (const lead of leads || []) {
            const updatedAt = new Date(lead.updated_at);
            const diffHours = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);

            // Alerta 1: Lead quente esquecido
            if (lead.ai_score >= 80 && diffHours > 24) {
                alerts.push({
                    id: `alert-hot-forgotten-${lead.id}`,
                    type: 'danger',
                    lead_id: lead.id,
                    title: '🔥 Lead Quente Congelando',
                    message: `${lead.name} tem score ${lead.ai_score}% mas está há mais de 24h sem ação. Chame agora!`,
                    priority: 1
                });
            }

            // Alerta 2: Lead Novo sem contato
            if ((lead.status === 'new' || lead.status === 'received') && diffHours > 2) {
                alerts.push({
                    id: `alert-new-ignored-${lead.id}`,
                    type: 'warning',
                    lead_id: lead.id,
                    title: '🕒 Lead Novo Esperando',
                    message: `${lead.name} entrou há algumas horas e ainda não foi contatado.`,
                    priority: 2
                });
            }

            // Alerta 3: Agendamentos de Hoje
            if (lead.scheduled_at) {
                const scheduledDate = new Date(lead.scheduled_at);
                if (scheduledDate.toDateString() === now.toDateString()) {
                    alerts.push({
                        id: `alert-schedule-${lead.id}`,
                        type: 'info',
                        lead_id: lead.id,
                        title: '📅 Agendamento Hoje',
                        message: `${lead.name} tem visita agendada para hoje. Confirme o horário.`,
                        priority: 1
                    });
                }
            }
        }

        // Ordenar por prioridade (1 é mais prioritário)
        alerts.sort((a, b) => a.priority - b.priority);

        return NextResponse.json({
            success: true,
            alerts: alerts.slice(0, 5) // Retornar os 5 principais alertas
        });

    } catch (err: any) {
        console.error("API GET Pulse Alerts Error:", err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
