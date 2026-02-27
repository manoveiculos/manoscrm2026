
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jkblxdxnbmciicakusnl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmx4ZHhuYm1jaWljYWt1c25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUwNDg0MiwiZXhwIjoyMDY5MDgwODQyfQ.d1EtCmCuZkzgKz6Pv1lyhFH-mDvyHEKaltmhFwS9DPQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function globalSync() {
    const tables = ['leads_distribuicao_crm_26', 'leads_distribuicao'];

    for (const table of tables) {
        console.log(`--- Syncing ${table} ---`);
        const { data: unassigned } = await supabase
            .from(table)
            .select('*')
            .not('vendedor', 'is', null)
            .eq('enviado', false);

        if (unassigned) {
            for (const lead of unassigned) {
                console.log(`Processing lead ${lead.nome} for ${lead.vendedor}...`);
                const { data: cons } = await supabase.from('consultants_manos_crm').select('id').ilike('name', lead.vendedor).single();
                if (cons) {
                    const cleanPhone = (lead.telephone || lead.telefone || '').replace(/\D/g, '');

                    // Check if exists
                    const { data: ext } = await supabase.from('leads_manos_crm').select('id').eq('phone', cleanPhone).limit(1);
                    if (ext && ext.length > 0) {
                        console.log(`${lead.nome} already in main. Marking as sent.`);
                        await supabase.from(table).update({ enviado: true }).eq('id', lead.id);
                        continue;
                    }

                    const { error: insErr } = await supabase.from('leads_manos_crm').insert({
                        name: lead.nome,
                        phone: cleanPhone,
                        vehicle_interest: lead.interesse || '',
                        assigned_consultant_id: cons.id,
                        status: 'new',
                        source: 'WhatsApp',
                        ai_classification: lead.ai_classification || 'warm',
                        created_at: lead.criado_em
                    });
                    if (!insErr) {
                        await supabase.from(table).update({ enviado: true }).eq('id', lead.id);
                        console.log(`Success: ${lead.nome} is now active for ${lead.vendedor}`);
                    } else {
                        console.error(`Error for ${lead.nome}:`, insErr);
                    }
                }
            }
        }
    }
}

globalSync();
