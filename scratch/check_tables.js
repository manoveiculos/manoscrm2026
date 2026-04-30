
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

// The REAL fix: we need to check if leads_compra exists and fix the VIEW accordingly
async function main() {
  // First check what tables exist
  console.log('=== Checking available tables ===');
  const tablesResult = await postJSON(
    'api.supabase.com',
    `/v1/projects/${PROJECT_REF}/database/query`,
    ACCESS_TOKEN,
    { query: `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `}
  );

  let tableNames = [];
  if (tablesResult.status === 200 || tablesResult.status === 201) {
    const rows = JSON.parse(tablesResult.body);
    tableNames = rows.map(r => r.table_name);
    console.log('Tables:', tableNames.join(', '));
  }

  // Check if leads_compra has the needed columns
  if (tableNames.includes('leads_compra')) {
    console.log('\n=== leads_compra columns ===');
    const compraResult = await postJSON(
      'api.supabase.com',
      `/v1/projects/${PROJECT_REF}/database/query`,
      ACCESS_TOKEN,
      { query: `
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'leads_compra'
        ORDER BY ordinal_position;
      `}
    );
    if (compraResult.status === 200 || compraResult.status === 201) {
      const cols = JSON.parse(compraResult.body);
      cols.forEach(c => console.log(`  ${c.column_name} (${c.data_type})`));
    }
  }

  // Now build the DEFINITIVE VIEW that:
  // 1. Works with the actual schema (includes leads_compra if it exists)
  // 2. Uses the correct English column names expected by leadService.ts
  const hasCompra = tableNames.includes('leads_compra');
  const hasMaster = tableNames.includes('leads_master');
  
  console.log(`\nleads_compra exists: ${hasCompra}`);
  console.log(`leads_master exists: ${hasMaster}`);
}

main().catch(console.error);
