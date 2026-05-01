const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Ler .env.local manualmente
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
        env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
    }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('URL ou Key do Supabase não encontradas no .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
    console.log('Iniciando migrações...');

    const queries = [
        `ALTER TABLE leads_manos_crm ADD COLUMN IF NOT EXISTS ai_silence_until TIMESTAMPTZ;`,
        `ALTER TABLE consultants_manos_crm ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;`,
        `CREATE TABLE IF NOT EXISTS system_settings (
            id TEXT PRIMARY KEY, 
            ai_paused BOOLEAN DEFAULT FALSE, 
            updated_at TIMESTAMPTZ DEFAULT NOW()
        );`,
        `INSERT INTO system_settings (id, ai_paused) VALUES ('global', false) ON CONFLICT (id) DO NOTHING;`
    ];

    for (const query of queries) {
        console.log(`Executando: ${query}`);
        // Usar postgREST para executar SQL se houver um RPC execute_sql
        // Caso contrário, precisaremos de outra estratégia.
        // Muitos projetos Supabase têm um RPC 'execute_sql' para migrações administrativas.
        const { data, error } = await supabase.rpc('execute_sql', { sql_query: query });
        if (error) {
            console.error(`Erro ao executar query: ${error.message}`);
        } else {
            console.log('Sucesso!');
        }
    }
}

runMigration();

