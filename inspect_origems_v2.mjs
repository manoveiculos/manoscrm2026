import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve('c:/Users/Usuario/OneDrive/Documentos/crm-manos/.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = Object.fromEntries(envContent.split('\n').filter(line => line.includes('=')).map(line => line.split('=').map(part => part.trim())));

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectLeads() {
    const { data, error } = await supabase
        .from('leads_distribuicao_crm_26')
        .select('*')
        .limit(20);

    if (error) {
        console.error('Error:', error);
        return;
    }

    data.forEach(lead => {
        console.log(`Lead ${lead.id} (${lead.nome}): origem="${lead.origem}", interesse="${lead.interesse}"`);
    });
}

inspectLeads();
