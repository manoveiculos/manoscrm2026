
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
  // Find the Alexandre consultant record
  console.log('=== Looking for Alexandre consultant record ===');
  const r1 = await postJSON(
    'api.supabase.com',
    `/v1/projects/${PROJECT_REF}/database/query`,
    ACCESS_TOKEN,
    { query: `
      SELECT id, name, role, auth_id, is_active 
      FROM public.consultants_manos_crm
      WHERE name ILIKE '%alexandre%' OR auth_id IS NOT NULL
      ORDER BY name;
    `}
  );
  if (r1.status === 200 || r1.status === 201) {
    const rows = JSON.parse(r1.body);
    console.log('Consultants with auth_id or named Alexandre:');
    rows.forEach(r => console.log(`  id=${r.id?.slice(0,8)} | name=${r.name} | role=${r.role} | auth_id=${r.auth_id ? r.auth_id.slice(0,8) : 'NULL'} | active=${r.is_active}`));
  }

  // Check how many leads each consultant has
  console.log('\n=== Lead count per consultant (pipeline statuses, 90 days) ===');
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const PIPELINE_STATUSES = ['new', 'received', 'entrada', 'novo', 'attempt', 'contacted', 'triagem', 'confirmed', 'scheduled', 'visited', 'ataque', 'test_drive', 'proposed', 'negotiation', 'fechamento'];
  
  const r2 = await postJSON(
    'api.supabase.com',
    `/v1/projects/${PROJECT_REF}/database/query`,
    ACCESS_TOKEN,
    { query: `
      SELECT 
        l.assigned_consultant_id,
        c.name as consultant_name,
        c.role as consultant_role,
        COUNT(*) as lead_count
      FROM public.leads l
      LEFT JOIN public.consultants_manos_crm c ON c.id = l.assigned_consultant_id
      WHERE l.status IN ('${PIPELINE_STATUSES.join("','")}')
        AND l.created_at >= '${startDate}'
      GROUP BY l.assigned_consultant_id, c.name, c.role
      ORDER BY lead_count DESC
      LIMIT 20;
    `}
  );
  if (r2.status === 200 || r2.status === 201) {
    const rows = JSON.parse(r2.body);
    rows.forEach(r => console.log(`  ${r.consultant_name || 'SEM NOME'} (${r.consultant_role || 'no_role'}) | id=${r.assigned_consultant_id?.slice(0,8) || 'NULL'} | ${r.lead_count} leads`));
  }
}

main().catch(console.error);
