
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

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
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  // Check if leads_unified_active view exists
  console.log('=== Checking for leads_unified_active view ===');
  const res1 = await sb.from('leads_unified_active').select('*').limit(1);
  if (res1.error) {
    console.log('leads_unified_active error:', res1.error.message);
  } else {
    const cols = res1.data && res1.data[0] ? Object.keys(res1.data[0]) : 'empty';
    console.log('leads_unified_active exists! Columns:', cols);
  }

  // Verify leads view works now
  console.log('\n=== Verifying leads view ===');
  const res2 = await sb.from('leads').select('id, name, phone, status, created_at, assigned_consultant_id, source_table').limit(5);
  if (res2.error) {
    console.error('leads view error:', res2.error.message);
  } else {
    console.log(`✅ leads view OK - ${res2.data.length} rows sample:`);
    res2.data.forEach(r => console.log(`  [${r.source_table}] ${r.name} | status: ${r.status}`));
  }
}

main().catch(console.error);
