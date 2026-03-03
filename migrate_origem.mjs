import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// MANUALLY READ ENV FILE since dotenv is not in package.json
const envPath = path.resolve('c:/Users/Usuario/OneDrive/Documentos/crm-manos/.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = Object.fromEntries(envContent.split('\n').filter(line => line.includes('=')).map(line => line.split('=').map(part => part.trim())));

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials (SUPABASE_SERVICE_ROLE_KEY needed for bulk update)');
    console.log('Available env vars keys:', Object.keys(envVars));
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrateOrigem() {
    console.log('--- Starting Migration ---');

    // Perform the update for both 'Não identificado' and literal 'null' string
    const targetValues = ['Não identificado', 'NÃO IDENTIFICADO', 'null'];

    for (const val of targetValues) {
        console.log(`Checking for origin: "${val}"...`);
        const { count, error: countError } = await supabase
            .from('leads_distribuicao_crm_26')
            .select('*', { count: 'exact', head: true })
            .eq('origem', val);

        if (countError) {
            console.error(`Error counting "${val}":`, countError);
            continue;
        }

        if (count > 0) {
            console.log(`Updating ${count} leads with origin "${val}"...`);
            const { error: updateError } = await supabase
                .from('leads_distribuicao_crm_26')
                .update({ origem: 'Contato Direto WhatsApp' })
                .eq('origem', val);

            if (updateError) {
                console.error(`Error updating "${val}":`, updateError);
            } else {
                console.log(`Updated "${val}" leads successfully.`);
            }
        } else {
            console.log(`No leads with origin "${val}" found.`);
        }
    }

    // Also handle cases where 'origem' might be null (if the user wants all unidentified to be WhatsApp)
    const { count: nullCount, error: nullCountError } = await supabase
        .from('leads_distribuicao_crm_26')
        .select('*', { count: 'exact', head: true })
        .is('origem', null);

    if (nullCountError) {
        console.error('Error counting null leads:', nullCountError);
    } else if (nullCount > 0) {
        console.log(`Found ${nullCount} leads with NULL origin. Updating them too...`);
        const { error: nullUpdateError } = await supabase
            .from('leads_distribuicao_crm_26')
            .update({ origem: 'Contato Direto WhatsApp' })
            .is('origem', null);

        if (nullUpdateError) {
            console.error('Error updating null leads:', nullUpdateError);
        } else {
            console.log('Updated NULL origins successfully.');
        }
    }
}

migrateOrigem();
