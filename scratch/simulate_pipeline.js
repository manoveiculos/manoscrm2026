
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

// Simulates exactly what leadService.getLeadsPaginated does for pipeline page
// role='admin', consultantId=undefined, pipelineOnly=true, startDate=90 days ago
async function main() {
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const LEAN_COLS = 'id,name,phone,email,source,origem,status,ai_score,ai_classification,ai_summary,vehicle_interest,assigned_consultant_id,created_at,updated_at,vendedor,proxima_acao,valor_investimento,observacoes,carro_troca,region,source_table';

  const PIPELINE_STATUSES = [
    'new', 'received', 'entrada', 'novo',
    'attempt', 'contacted', 'triagem',
    'confirmed', 'scheduled', 'visited', 'ataque',
    'test_drive', 'proposed', 'negotiation', 'fechamento'
  ];

  console.log('=== Simulating exact leadService.getLeadsPaginated call ===');
  console.log('role: admin, consultantId: undefined, pipelineOnly: true');
  console.log('startDate (90 days ago):', startDate.split('T')[0]);
  console.log('');

  // Step 1: Simulate the lean query
  console.log('--- Step 1: Lean query (no consultant filter since admin + no consultantId) ---');
  const { data: leanData, error: leanErr, count: leanCount } = await sb
    .from('leads')
    .select(LEAN_COLS, { count: 'exact' })
    .in('status', PIPELINE_STATUSES)
    .gte('created_at', startDate)
    .order('created_at', { ascending: false })
    .range(0, 499);

  if (leanErr) {
    console.error('❌ Lean query error:', leanErr.message);
  } else {
    console.log(`✅ Lean query returned ${leanData.length} rows (total count: ${leanCount})`);
    if (leanData.length > 0) {
      console.log('\nSample leads:');
      leanData.slice(0, 5).forEach(l => {
        console.log(`  ${l.name} | status: ${l.status} | source: ${l.source_table} | consultant: ${l.assigned_consultant_id ? l.assigned_consultant_id.slice(0,8) : 'NULL'}`);
      });

      // Step 2: Simulate isLeadQualified filter (frontend)
      console.log('\n--- Step 2: Frontend filter (isLeadQualified) ---');
      const GENERIC_NAMES = ['lead w', 'lead whatsapp', 'sem nome', 'cliente', 'contato whatsapp', 'novo lead'];
      
      const qualified = leanData.filter(l => {
        const rawName = (l.name || '').trim();
        if (!rawName || rawName === '---') return false;
        const lowerName = rawName.toLowerCase();
        if (lowerName.length < 2) return false;
        if (GENERIC_NAMES.some(g => lowerName.includes(g))) return false;
        const digitCount = (lowerName.match(/\d/g) || []).length;
        if (digitCount > 5) return false;
        return true;
      });

      const rejected = leanData.filter(l => {
        const rawName = (l.name || '').trim();
        if (!rawName || rawName === '---') return true;
        const lowerName = rawName.toLowerCase();
        if (lowerName.length < 2) return true;
        const GENERIC_NAMES_CHECK = ['lead w', 'lead whatsapp', 'sem nome', 'cliente', 'contato whatsapp', 'novo lead'];
        if (GENERIC_NAMES_CHECK.some(g => lowerName.includes(g))) return true;
        const digitCount = (lowerName.match(/\d/g) || []).length;
        if (digitCount > 5) return true;
        return false;
      });

      console.log(`  ✅ Qualified (pass isLeadQualified): ${qualified.length}`);
      console.log(`  ❌ Rejected (fail isLeadQualified): ${rejected.length}`);
      
      if (rejected.length > 0) {
        console.log('\n  Rejected name samples:');
        rejected.slice(0, 10).forEach(l => console.log(`    "${l.name}" (${l.status})`));
      }

      // Step 3: Filter out vendido/perdido (which normalizeStatus would catch)
      const LEGACY_MAP = { received: 'entrada', new: 'entrada', attempt: 'triagem', contacted: 'triagem', scheduled: 'ataque', visited: 'ataque', test_drive: 'ataque', negotiation: 'fechamento', proposed: 'fechamento', closed: 'vendido', lost: 'perdido', post_sale: 'vendido', triagem: 'triagem', entrada: 'entrada', ataque: 'ataque', fechamento: 'fechamento', novo: 'entrada', nova: 'entrada' };
      const normalize = (s) => {
        if (!s) return 'entrada';
        const lower = s.toLowerCase().trim();
        const VALID = ['entrada', 'triagem', 'ataque', 'fechamento', 'vendido', 'perdido'];
        if (VALID.includes(lower)) return lower;
        return LEGACY_MAP[lower] || 'entrada';
      };

      const afterStatusFilter = qualified.filter(l => {
        const norm = normalize(l.status);
        return norm !== 'vendido' && norm !== 'perdido';
      });
      console.log(`\n  After removing vendido/perdido: ${afterStatusFilter.length}`);
      
      // Status breakdown after all filters
      const statusBreakdown = {};
      afterStatusFilter.forEach(l => {
        const norm = normalize(l.status);
        statusBreakdown[norm] = (statusBreakdown[norm] || 0) + 1;
      });
      console.log('  Status breakdown (normalized):', statusBreakdown);
    }
  }
}

main().catch(console.error);
