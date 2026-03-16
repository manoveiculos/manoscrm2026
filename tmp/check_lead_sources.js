
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://psuobvshsqezpizbhmis.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzdW9idnNocWV6cGl6YmhtaXMiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc0MTUzOTc2MSwiZXhwIjoyMDU3MTE1NzYxfQ.p8uBof3P5N8eNIn0dG60PCnnJMC7';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLeads() {
    const { data: leads, error } = await supabase
        .from('leads_manos_crm')
        .select('source, origem, plataforma_meta')
        .limit(300);

    if (error) {
        console.error('Error fetching leads:', error);
        return;
    }

    const sourceStats = {};
    const origemStats = {};
    const combinedStats = {};

    leads.forEach(l => {
        sourceStats[l.source] = (sourceStats[l.source] || 0) + 1;
        origemStats[l.origem] = (origemStats[l.origem] || 0) + 1;
        const key = `${l.source} | ${l.origem} | ${l.plataforma_meta || 'null'}`;
        combinedStats[key] = (combinedStats[key] || 0) + 1;
    });

    console.log('--- Source Stats ---');
    console.log(JSON.stringify(sourceStats, null, 2));
    console.log('\n--- Origem Stats ---');
    console.log(JSON.stringify(origemStats, null, 2));
    console.log('\n--- Combined Stats (Source | Origem | Platform) ---');
    console.log(JSON.stringify(combinedStats, null, 2));
}

checkLeads();
