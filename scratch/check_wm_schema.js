const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

function getEnv() {
  const envPath = path.resolve(__dirname, '../.env.local');
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  content.split('\n').forEach(line => {
    const eqIdx = line.indexOf('=');
    if (eqIdx > 0) {
      const key = line.slice(0, eqIdx).trim();
      const val = line.slice(eqIdx + 1).trim().replace(/^"(.*)"$/, '$1');
      env[key] = val;
    }
  });
  return env;
}

const env = getEnv();
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data, error } = await supabase.from('whatsapp_messages').select('*').limit(1);
  if (error) {
    console.error('Error:', error);
  } else {
    // If we have data, we can infer types from the keys and values
    // But we need the real schema.
    const { data: schema, error: schemaError } = await supabase.rpc('get_schema_info', { table_name: 'whatsapp_messages' });
    if (schemaError) {
        // query pg_attribute
        const { data: pga, error: pgae } = await supabase.rpc('execute_sql', { sql: "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'whatsapp_messages'" });
        console.log('Schema Info:', pga || pgae);
    } else {
        console.log('Schema Info:', schema);
    }
  }
}

main();
