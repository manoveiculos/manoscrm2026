
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
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const PROJECT_REF = SUPABASE_URL.replace('https://', '').split('.')[0];
const ACCESS_TOKEN = 'sbp_87d134d5a8f8326317162353e1a46d1bd5da43e5';

// First let's check what columns leads_master and leads_manos_crm actually have
const CHECK_SQL = `
SELECT 
  column_name, 
  data_type,
  table_name
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name IN ('leads_master', 'leads_manos_crm', 'leads_distribuicao_crm_26')
ORDER BY table_name, ordinal_position;
`;

function postJSON(hostname, apiPath, token, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const options = {
      hostname,
      port: 443,
      path: apiPath,
      method: 'POST',
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
  console.log('=== Checking actual table columns in Supabase ===');
  
  const result = await postJSON(
    'api.supabase.com',
    `/v1/projects/${PROJECT_REF}/database/query`,
    ACCESS_TOKEN,
    { query: CHECK_SQL }
  );
  
  console.log('Status:', result.status);
  if (result.status === 200) {
    const rows = JSON.parse(result.body);
    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.table_name]) grouped[row.table_name] = [];
      grouped[row.table_name].push(`${row.column_name} (${row.data_type})`);
    }
    for (const [table, cols] of Object.entries(grouped)) {
      console.log(`\n${table}:\n  ${cols.join('\n  ')}`);
    }
  } else {
    console.log('Response:', result.body.slice(0, 1000));
  }
}

main().catch(console.error);
