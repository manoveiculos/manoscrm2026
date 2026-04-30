
const fs = require('fs');
const path = require('path');
const https = require('https');
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
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PROJECT_REF = SUPABASE_URL.replace('https://', '').split('.')[0];
const ACCESS_TOKEN = 'sbp_87d134d5a8f8326317162353e1a46d1bd5da43e5';

function postJSON(hostname, apiPath, token, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options = {
      hostname, port: 443, path: apiPath, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function main() {
  const sbService = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const sbAnon = createClient(SUPABASE_URL, ANON_KEY);

  console.log('=== Test with SERVICE_ROLE ===');
  const r1 = await sbService.from('leads').select('id, name, phone, created_at, assigned_consultant_id').limit(2);
  if (r1.error) console.error('SERVICE_ROLE error:', r1.error.message);
  else console.log('✅ SERVICE_ROLE works:', r1.data.length, 'rows, cols:', Object.keys(r1.data[0] || {}).join(', '));

  console.log('\n=== Test with ANON_KEY ===');
  const r2 = await sbAnon.from('leads').select('id, name, phone, created_at').limit(2);
  if (r2.error) console.error('ANON error:', r2.error.message);
  else console.log('✅ ANON works:', r2.data.length, 'rows');

  console.log('\n=== Check RLS on leads view ===');
  const rlsCheck = await postJSON(
    'api.supabase.com',
    `/v1/projects/${PROJECT_REF}/database/query`,
    ACCESS_TOKEN,
    { query: `
      SELECT relrowsecurity, relname
      FROM pg_class 
      WHERE relname = 'leads' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
    `}
  );
  if (rlsCheck.status === 200 || rlsCheck.status === 201) {
    const rows = JSON.parse(rlsCheck.body);
    console.log('RLS status:', rows);
  }

  console.log('\n=== Check if anon has SELECT on leads view ===');
  const grantCheck = await postJSON(
    'api.supabase.com',
    `/v1/projects/${PROJECT_REF}/database/query`,
    ACCESS_TOKEN,
    { query: `
      SELECT grantee, privilege_type
      FROM information_schema.role_table_grants 
      WHERE table_name = 'leads' AND table_schema = 'public'
      ORDER BY grantee, privilege_type;
    `}
  );
  if (grantCheck.status === 200 || grantCheck.status === 201) {
    const rows = JSON.parse(grantCheck.body);
    console.log('Grants on leads:', rows);
  }
}

main().catch(console.error);
