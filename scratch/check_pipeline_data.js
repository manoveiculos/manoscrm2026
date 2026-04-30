
const fs = require('fs');
const path = require('path');
const https = require('https');

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
const PROJECT_REF = env.NEXT_PUBLIC_SUPABASE_URL.replace('https://', '').split('.')[0];
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
  console.log('=== Status distribution in leads VIEW ===');
  const r1 = await postJSON(
    'api.supabase.com',
    `/v1/projects/${PROJECT_REF}/database/query`,
    ACCESS_TOKEN,
    { query: `SELECT status, COUNT(*) as total FROM public.leads GROUP BY status ORDER BY total DESC LIMIT 30;` }
  );
  if (r1.status === 200 || r1.status === 201) {
    const rows = JSON.parse(r1.body);
    rows.forEach(r => console.log(`  ${r.status}: ${r.total}`));
  }

  console.log('\n=== Pipeline statuses with 90-day filter ===');
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const pipelineStatuses = ['new', 'received', 'entrada', 'novo', 'attempt', 'contacted', 'triagem', 'confirmed', 'scheduled', 'visited', 'ataque', 'test_drive', 'proposed', 'negotiation', 'fechamento'];
  const r2 = await postJSON(
    'api.supabase.com',
    `/v1/projects/${PROJECT_REF}/database/query`,
    ACCESS_TOKEN,
    { query: `
      SELECT COUNT(*) as total 
      FROM public.leads 
      WHERE status IN ('${pipelineStatuses.join("','")}')
        AND created_at >= '${cutoff}';
    `}
  );
  if (r2.status === 200 || r2.status === 201) {
    console.log('Pipeline leads in last 90 days:', JSON.parse(r2.body));
  }

  console.log('\n=== Total leads with assigned_consultant_id in last 90 days ===');
  const r3 = await postJSON(
    'api.supabase.com',
    `/v1/projects/${PROJECT_REF}/database/query`,
    ACCESS_TOKEN,
    { query: `
      SELECT 
        COUNT(*) as total,
        COUNT(assigned_consultant_id) as with_consultant,
        COUNT(CASE WHEN assigned_consultant_id IS NULL THEN 1 END) as without_consultant
      FROM public.leads 
      WHERE created_at >= '${cutoff}';
    `}
  );
  if (r3.status === 200 || r3.status === 201) {
    console.log(JSON.parse(r3.body));
  }
  
  console.log('\n=== Source distribution in last 90 days ===');
  const r4 = await postJSON(
    'api.supabase.com',
    `/v1/projects/${PROJECT_REF}/database/query`,
    ACCESS_TOKEN,
    { query: `
      SELECT source_table, COUNT(*) as total 
      FROM public.leads 
      WHERE created_at >= '${cutoff}'
      GROUP BY source_table;
    `}
  );
  if (r4.status === 200 || r4.status === 201) {
    console.log(JSON.parse(r4.body));
  }
}

main().catch(console.error);
