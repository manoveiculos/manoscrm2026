import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { STAGE_SLA_HOURS } from '@/constants/status';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const maxDuration = 60;

type SlaRow = { origem: string; stage: string; sla_hours: number };
type SlaMap = Map<string, number>; // key: "origem|stage"

/** Monta mapa de SLA por origem+etapa a partir da tabela sla_config */
async function loadSlaMap(): Promise<SlaMap> {
    const { data } = await supabase
        .from('sla_config')
        .select('origem, stage, sla_hours');
    const map: SlaMap = new Map();
    for (const row of (data as SlaRow[] || [])) {
        map.set(`${row.origem}|${row.stage}`, row.sla_hours);
    }
    return map;
}

/** Retorna SLA em horas para uma origem+etapa, com fallback para 'default' e depois para constante */
function getSlaHours(origem: string | null | undefined, stage: string, map: SlaMap): number {
    const key = `${origem || ''}|${stage}`;
    if (map.has(key)) return map.get(key)!;
    const defKey = `default|${stage}`;
    if (map.has(defKey)) return map.get(defKey)!;
    return STAGE_SLA_HOURS[stage] ?? 24;
}

/**
 * GET /api/cron/pipeline-sla
 * Roda a cada 2h via Vercel Cron.
 * Detecta leads que excederam o SLA de cada etapa e cria alertas no Cowork IA.
 * SLA é dinâmico por origem (tabela sla_config) com fallback para STAGE_SLA_HOURS.
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const log: string[] = [];
    let alertsCreated = 0;

    try {
        const slaMap = await loadSlaMap();

        // Busca leads ativos no pipeline (não vendidos/perdidos)
        const { data: leads, error } = await supabase
            .from('leads_manos_crm')
            .select('id, name, status, assigned_consultant_id, updated_at, vehicle_interest, origem, source')
            .not('status', 'in', '("vendido","perdido","lost","comprado","lixo","duplicado","desqualificado")')
            .not('assigned_consultant_id', 'is', null);

        if (error) throw error;
        if (!leads?.length) {
            return NextResponse.json({ success: true, message: 'Sem leads no pipeline.', alertsCreated: 0 });
        }

        // Busca consultores para lookup de nome
        const { data: consultants } = await supabase
            .from('consultants_manos_crm')
            .select('id, name');
        const consultantMap = new Map((consultants || []).map(c => [c.id, c.name]));

        // Busca alertas de SLA já ativos para evitar duplicatas
        const { data: existingAlerts } = await supabase
            .from('cowork_alerts')
            .select('metadata')
            .eq('type', 'sla_breach')
            .eq('is_active', true);

        const alertedLeadIds = new Set(
            (existingAlerts || [])
                .map(a => a.metadata?.lead_id)
                .filter(Boolean)
        );

        const now = Date.now();

        for (const lead of leads) {
            // Normaliza o status para o id da etapa
            const stageId = normalizeToStageId(lead.status);
            const leadOrigem = lead.origem || lead.source || null;
            const slaHours = getSlaHours(leadOrigem, stageId, slaMap);

            if (!slaHours) continue; // status fora do pipeline ativo

            const lastUpdate = new Date(lead.updated_at).getTime();
            const hoursStuck = (now - lastUpdate) / 3_600_000;

            if (hoursStuck < slaHours) continue; // dentro do SLA

            // Já tem alerta ativo para este lead?
            if (alertedLeadIds.has(lead.id)) {
                log.push(`⏭️ ${lead.name} — alerta SLA já existe`);
                continue;
            }

            const consultantName = consultantMap.get(lead.assigned_consultant_id) || 'Consultor';
            const hoursOverSla = Math.round(hoursStuck - slaHours);
            const daysStuck = hoursStuck >= 24 ? `${Math.floor(hoursStuck / 24)}d` : `${Math.round(hoursStuck)}h`;

            const title = `Lead parado em ${stageId.toUpperCase()} há ${daysStuck}`;
            const message = [
                `${consultantName}, o lead "${lead.name}" está na etapa ${stageId.toUpperCase()} há ${daysStuck} sem atualização.`,
                ``,
                `SLA desta etapa: ${slaHours}h · Excedido em: ${hoursOverSla}h`,
                lead.vehicle_interest ? `Interesse: ${lead.vehicle_interest}` : null,
                ``,
                `Acesse o Pipeline agora, atualize o status ou registre uma interação.`,
            ].filter(l => l !== null).join('\n');

            const priority = hoursStuck >= slaHours * 3 ? 1   // crítico: 3× além do SLA
                           : hoursStuck >= slaHours * 1.5 ? 2  // atenção: 1.5× além
                           : 3;                                 // aviso: recém excedido

            const { error: insertErr } = await supabase
                .from('cowork_alerts')
                .insert({
                    type: 'sla_breach',
                    title,
                    message,
                    priority,
                    target_consultant_id: lead.assigned_consultant_id,
                    is_active: true,
                    metadata: { lead_id: lead.id, stage: stageId, hours_stuck: Math.round(hoursStuck) },
                });

            if (!insertErr) {
                alertsCreated++;
                log.push(`🚨 SLA breach — ${lead.name} (${stageId}) · ${daysStuck} parado · prio ${priority}`);
            }
        }

        return NextResponse.json({ success: true, alertsCreated, leadsScanned: leads.length, log });

    } catch (err: any) {
        console.error('[pipeline-sla]', err);
        return NextResponse.json({ success: false, error: err.message, log }, { status: 500 });
    }
}

// Mapeia status do banco para id da etapa do Kanban
function normalizeToStageId(status: string): string {
    const s = (status || '').toLowerCase();
    if (['new', 'received', 'entrada', 'novo'].includes(s))           return 'entrada';
    if (['attempt', 'contacted', 'triagem'].includes(s))               return 'triagem';
    if (['confirmed', 'scheduled', 'visited', 'ataque'].includes(s))  return 'ataque';
    if (['test_drive', 'proposed', 'negotiation', 'fechamento'].includes(s)) return 'fechamento';
    return '';
}
