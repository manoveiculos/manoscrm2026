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
  // Use postgrest to query information_schema.views or similar
  // But often RLS blocks this. 
  // Let's try to just query one row and check the keys again.
  const { data, error } = await supabase.from('leads_unified').select('*').limit(1);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Keys:', Object.keys(data[0] || {}));
  }
}

main();
