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
  const { data, error } = await supabase
    .from('leads_unified_active')
    .select('uid, table_name, native_id, name, phone, vehicle_interest, source, ai_score, ai_classification, status, updated_at, created_at, proxima_acao, first_contact_channel')
    .limit(1);
    
  if (error) {
    console.error('Error Details:', JSON.stringify(error, null, 2));
  } else {
    console.log('Success! Columns returned:', Object.keys(data[0] || {}));
  }
}

main();
