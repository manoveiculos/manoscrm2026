import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/aiProviders';
import { createClient } from '@/lib/supabase/admin';

const supabaseAdmin = createClient();

function buildLeadText(lead: Record<string, any>): string {
    return [
        lead.name          && `Cliente: ${lead.name}`,
        lead.vehicle_interest && `Interesse: ${lead.vehicle_interest}`,
        lead.status        && `Etapa: ${lead.status}`,
        lead.source        && `Origem: ${lead.source}`,
        lead.valor_investimento && `Orçamento: ${lead.valor_investimento}`,
        lead.carro_troca   && `Troca: ${lead.carro_troca}`,
        lead.notes         && `Observações: ${lead.notes}`,
    ].filter(Boolean).join('. ');
}

// POST /api/ai/embed-lead
// body: { lead_id: string } | { batch: true }
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        if (body.batch) {
            // Gera embeddings para leads sem embedding (até 50 por vez)
            const { data: leads, error: fetchErr } = await supabaseAdmin
                .from('leads_manos_crm')
                .select('id, name, vehicle_interest, status, source, valor_investimento, carro_troca, notes')
                .is('embedding', null)
                .limit(50);

            if (fetchErr) throw fetchErr;
            if (!leads?.length) return NextResponse.json({ success: true, indexed: 0 });

            let indexed = 0;
            for (const lead of leads) {
                const text = buildLeadText(lead);
                if (!text.trim()) continue;

                const embRes = await openai.embeddings.create({
                    model: 'text-embedding-3-small',
                    input: text,
                });
                const embedding = embRes.data[0].embedding;

                await supabaseAdmin
                    .from('leads_manos_crm')
                    .update({ embedding: embedding })
                    .eq('id', lead.id);

                indexed++;
            }

            return NextResponse.json({ success: true, indexed, total: leads.length });
        }

        // Lead único
        const { lead_id } = body;
        if (!lead_id) return NextResponse.json({ error: 'lead_id obrigatório' }, { status: 400 });

        const { data: lead, error: fetchErr } = await supabaseAdmin
            .from('leads_manos_crm')
            .select('id, name, vehicle_interest, status, source, valor_investimento, carro_troca, notes')
            .eq('id', lead_id)
            .single();

        if (fetchErr || !lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });

        const text = buildLeadText(lead);
        const embRes = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: text || lead.name || 'lead',
        });
        const embedding = embRes.data[0].embedding;

        const { error: updateErr } = await supabaseAdmin
            .from('leads_manos_crm')
            .update({ embedding: embedding })
            .eq('id', lead_id);

        if (updateErr) throw updateErr;

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error('[embed-lead]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
