import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/v2/inventory/sold-notify
 * Chamado quando um veículo é marcado como vendido no estoque.
 * Busca leads com interesse similar e cria alertas no Cowork IA
 * para os consultores responsáveis oferecerem alternativas.
 *
 * Body: { vehicleId: string, vehicleName: string, vehicleModel?: string }
 */
export async function POST(req: NextRequest) {
    try {
        const { vehicleId, vehicleName, vehicleModel } = await req.json();

        if (!vehicleName) {
            return NextResponse.json({ error: 'vehicleName é obrigatório' }, { status: 400 });
        }

        // Marca o veículo como vendido no estoque
        if (vehicleId) {
            await supabase.from('estoque').update({ status: 'sold' }).eq('id', vehicleId);
        }

        // Extrai palavras-chave do veículo vendido para busca por interesse
        const keywords = extractKeywords(vehicleName + ' ' + (vehicleModel || ''));

        // Busca leads ativos com interesse similar (não fechados/perdidos)
        const { data: allLeads } = await supabase
            .from('leads_manos_crm')
            .select('id, name, vehicle_interest, assigned_consultant_id, status')
            .not('status', 'in', '("vendido","perdido","lost","comprado","lixo","duplicado","desqualificado")')
            .not('vehicle_interest', 'is', null)
            .not('assigned_consultant_id', 'is', null);

        // Filtra leads com interesse que bate com as palavras-chave do veículo
        const interestedLeads = (allLeads || []).filter(lead => {
            const interest = (lead.vehicle_interest || '').toLowerCase();
            return keywords.some(kw => interest.includes(kw));
        });

        if (!interestedLeads.length) {
            return NextResponse.json({ success: true, notified: 0, message: 'Nenhum lead com interesse similar.' });
        }

        // Agrupa por consultor para gerar 1 alerta por consultor (não 1 por lead)
        const byConsultant = new Map<string, typeof interestedLeads>();
        for (const lead of interestedLeads) {
            const cid = lead.assigned_consultant_id;
            if (!byConsultant.has(cid)) byConsultant.set(cid, []);
            byConsultant.get(cid)!.push(lead);
        }

        // Busca nomes dos consultores
        const { data: consultants } = await supabase
            .from('consultants_manos_crm')
            .select('id, name')
            .in('id', Array.from(byConsultant.keys()));
        const consMap = new Map((consultants || []).map(c => [c.id, c.name]));

        let notified = 0;
        for (const [consultantId, leads] of byConsultant) {
            const consultantName = consMap.get(consultantId) || 'Consultor';
            const leadNames = leads.slice(0, 3).map(l => l.name.split(' ')[0]).join(', ');
            const extras = leads.length > 3 ? ` e mais ${leads.length - 3}` : '';

            const title = `${vehicleName} foi vendido — ofereça alternativas agora`;
            const message = [
                `${consultantName}, o veículo "${vehicleName}" que estava em seu radar acaba de ser vendido para outro cliente.`,
                ``,
                `Você tem ${leads.length} lead(s) com interesse similar: ${leadNames}${extras}.`,
                ``,
                `Ação imediata: entre em contato e apresente opções equivalentes do estoque. Cada minuto conta antes que eles busquem outro lugar.`,
            ].join('\n');

            await supabase.from('cowork_alerts').insert({
                type: 'inventory_sold',
                title,
                message,
                priority: 2,
                target_consultant_id: consultantId,
                is_active: true,
                metadata: {
                    vehicle_id: vehicleId,
                    vehicle_name: vehicleName,
                    interested_lead_ids: leads.map(l => l.id),
                },
            });
            notified++;
        }

        return NextResponse.json({
            success: true,
            notified,
            leadsImpacted: interestedLeads.length,
        });

    } catch (err: any) {
        console.error('[sold-notify]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// Extrai palavras-chave relevantes do nome do veículo
function extractKeywords(name: string): string[] {
    const stop = ['de','da','do','e','a','o','com','sem','em','para','por','um','uma'];
    return name.toLowerCase()
        .split(/[\s\/\-]+/)
        .filter(w => w.length >= 3 && !stop.includes(w))
        .slice(0, 5); // máximo 5 keywords
}
