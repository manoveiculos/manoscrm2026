import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export const maxDuration = 60; // Allows up to 60s execution

/**
 * THE ANTI-LOSS ENGINE (Cron Job)
 * Runs periodically to find leads that are stuck in the pipeline
 * and boosts their score to 99 so they float to the top of the V2 Kanban.
 * 
 * Target Leads: 
 * - Status: 'new' or 'received' -> > 2 hours without contact
 * - Status: 'contacted' or 'attempt' -> > 24 hours without contact
 * - Status: NOT 'closed', 'lost', 'comprado'
 */
export async function GET(request: Request) {
    // Basic security check for cron endpoints (if triggered via Vercel or external service)
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV === 'production') {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    console.log("[Anti-Loss Engine] Inicializando varredura de leads esquecidos...");
    let leadsReactivated = 0;

    try {
        const now = new Date();
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

        // 1. Process Main CRM Leads
        const { data: mainLeads, error: mainError } = await supabaseAdmin
            .from('leads_manos_crm')
            .select('id, status, updated_at, ai_score, name')
            .not('status', 'in', '("closed","lost","comprado")')
            .lt('ai_score', 90); // Only process if not already boosted

        if (mainError) throw mainError;

        for (const lead of (mainLeads || [])) {
            let shouldBoost = false;
            const lastUpdated = new Date(lead.updated_at).toISOString();

            if (['new', 'received'].includes(lead.status) && lastUpdated < twoHoursAgo) {
                shouldBoost = true;
            } else if (['contacted', 'attempt'].includes(lead.status) && lastUpdated < twentyFourHoursAgo) {
                shouldBoost = true;
            }

            if (shouldBoost) {
                await supabaseAdmin
                    .from('leads_manos_crm')
                    .update({
                        ai_score: 99, 
                        ai_reason: `🚨 ALERTA ANTI-PERDA: Este lead ( ${lead.status} ) está sem avanço há muito tempo. Chame agora! Diga:"Olá, tudo bem? Vi que conversamos e acabou ficando corrido. Ainda tem interesse?"`
                    })
                    .eq('id', lead.id);
                leadsReactivated++;
                console.log(`[Anti-Loss] Boosted Main Lead: ${lead.name}`);
            }
        }

        // 2. Process CRM26 Leads
        const { data: crm26Leads, error: crm26Error } = await supabaseAdmin
            .from('leads_distribuicao_crm_26')
            .select('id, status, atualizado_em, criado_em, ai_score, nome')
            .not('status', 'in', '("closed","lost","comprado")')
            .lt('ai_score', 90);

        if (crm26Error) throw crm26Error;

        for (const lead of (crm26Leads || [])) {
            let shouldBoost = false;
            const lastUpdatedDate = lead.atualizado_em || lead.criado_em;
            if (!lastUpdatedDate) continue;
            const lastUpdated = new Date(lastUpdatedDate).toISOString();

            // Handle empty/new status in CRM26
            const status = (lead.status && lead.status !== '') ? lead.status.toLowerCase() : 'received';

            if (['new', 'received', 'novo'].includes(status) && lastUpdated < twoHoursAgo) {
                shouldBoost = true;
            } else if (['contacted', 'attempt'].includes(status) && lastUpdated < twentyFourHoursAgo) {
                shouldBoost = true;
            }

            if (shouldBoost) {
                // For CRM26, we also inject the reason inside 'resumo_consultor' just in case
                await supabaseAdmin
                    .from('leads_distribuicao_crm_26')
                    .update({
                        ai_score: 99, 
                        ai_reason: `🚨 ALERTA ANTI-PERDA: Lead estagnado. Chame agora! "Olá, tudo bem? Vi que conversamos e acabou ficando corrido. Ainda tem interesse?"`,
                        resumo_consultor: "🚨 LEAD EM RISCO DE PERDA! FAÇA FOLLOW-UP."
                    })
                    .eq('id', lead.id);
                leadsReactivated++;
                console.log(`[Anti-Loss] Boosted CRM26 Lead: ${lead.nome}`);
            }
        }


        return NextResponse.json({ 
            success: true, 
            message: `Anti-Loss Engine ejecutado com sucesso. ${leadsReactivated} leads foram impulsionados para o topo do Kanban V2 para atendimento imediato.` 
        });

    } catch (err: any) {
        console.error("Anti-Loss Engine Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
