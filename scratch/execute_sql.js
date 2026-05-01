
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL or Key missing in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const sql1 = `
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_messages;
        EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;
END $$;
`;

const sql2 = `
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'whatsapp_messages';
`;

async function run() {
  console.log('Aplicando migração...');
  const { data: data1, error: error1 } = await supabase.rpc('exec_sql', { sql: sql1 });
  
  if (error1) {
    // If rpc('exec_sql') is not available, we might need another way.
    // However, for migrations, we usually use the CLI or the Dashboard.
    // Let's try to use the postgres library directly if rpc fails.
    console.error('Erro ao executar sql1 via rpc:', error1.message);
    
    // Fallback: try to use the postgres client if we can.
    // But since this is a migration, maybe the user expects us to use the CLI.
    // "Use o supabase-mcp-server" strongly suggests an MCP tool.
  } else {
    console.log('Migração aplicada com sucesso.');
  }

  console.log('Confirmando publicação...');
  const { data: data2, error: error2 } = await supabase.rpc('exec_sql', { sql: sql2 });
  if (error2) {
    console.error('Erro ao executar sql2 via rpc:', error2.message);
  } else {
    console.log('Resultado da confirmação:', data2);
  }
}

run();
