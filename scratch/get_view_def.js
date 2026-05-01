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
  const { data, error } = await supabase.rpc('get_view_definition', { view_name: 'leads_unified' });
  if (error) {
    // If RPC doesn't exist, try direct query to pg_views
    const { data: data2, error: error2 } = await supabase.from('pg_views').select('definition').eq('viewname', 'leads_unified').maybeSingle();
    if (error2) {
       console.error('Error:', error2);
    } else {
       console.log('View Definition:', data2?.definition);
    }
  } else {
    console.log('View Definition:', data);
  }
}

main();
