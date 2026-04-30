
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
  // Get exact column names from the information_schema
  const colsResult = await postJSON(
    'api.supabase.com',
    `/v1/projects/${PROJECT_REF}/database/query`,
    ACCESS_TOKEN,
    { query: `
      SELECT column_name, data_type, ordinal_position
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'leads'
      ORDER BY ordinal_position;
    `}
  );

  console.log('=== Current "leads" VIEW columns in DB ===');
  if (colsResult.status === 200 || colsResult.status === 201) {
    const cols = JSON.parse(colsResult.body);
    cols.forEach(c => console.log(`  ${c.ordinal_position}. ${c.column_name} (${c.data_type})`));
  } else {
    console.log('Error:', colsResult.body.slice(0, 500));
  }

  // Get the actual VIEW definition
  console.log('\n=== VIEW definition (first 2000 chars) ===');
  const defResult = await postJSON(
    'api.supabase.com',
    `/v1/projects/${PROJECT_REF}/database/query`,
    ACCESS_TOKEN,
    { query: `SELECT pg_get_viewdef('public.leads'::regclass, true) AS definition;` }
  );
  if (defResult.status === 200 || defResult.status === 201) {
    const rows = JSON.parse(defResult.body);
    console.log(rows[0]?.definition?.slice(0, 2000));
  } else {
    console.log('Error:', defResult.body.slice(0, 500));
  }
}

main().catch(console.error);
