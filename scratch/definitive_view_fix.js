
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

// DEFINITIVE FIX: 
// The current VIEW has incompatible column count/types, so CREATE OR REPLACE fails silently
// We must DROP first then CREATE with correct columns
// Based on actual schemas discovered:
// - leads_manos_crm: has name, phone, email, source, region, created_at, updated_at, assigned_consultant_id
// - leads_compra: has nome, telefone, criado_em, updated_at, assigned_consultant_id, ai_score, status  
// - leads_distribuicao_crm_26: has nome, telefone, criado_em, atualizado_em, assigned_consultant_id
// - leads_master: has name, phone, city, created_at, updated_at, assigned_consultant_id, next_step

const DEFINITIVE_SQL = `
-- Step 1: Drop with cascade to remove dependencies
DROP VIEW IF EXISTS public.leads CASCADE;

-- Step 2: Recreate the correct unified VIEW
CREATE VIEW public.leads AS
WITH all_sources AS (

  -- Source 1: leads_master (priority 1 — main new system)
  SELECT
    'master_' || m.id::text                       AS id,
    COALESCE(m.name, '')                           AS name,
    m.phone                                        AS phone,
    m.email                                        AS email,
    COALESCE(m.source, 'Meta Ads')                 AS source,
    COALESCE(m.source, 'Meta Ads')                 AS origem,
    m.vehicle_interest                             AS vehicle_interest,
    m.vehicle_interest                             AS interesse,
    COALESCE(m.ai_score, 0)                        AS ai_score,
    m.ai_classification                            AS ai_classification,
    m.ai_summary                                   AS ai_summary,
    m.ai_reason                                    AS ai_reason,
    CASE LOWER(TRIM(COALESCE(m.status, 'received')))
      WHEN 'novo'           THEN 'received'
      WHEN 'nova'           THEN 'received'
      WHEN 'new'            THEN 'received'
      WHEN 'received'       THEN 'received'
      WHEN 'aguardando'     THEN 'received'
      WHEN 'sem contato'    THEN 'received'
      WHEN 'em atendimento' THEN 'attempt'
      WHEN 'attempt'        THEN 'attempt'
      WHEN 'contatado'      THEN 'contacted'
      WHEN 'contacted'      THEN 'contacted'
      WHEN 'agendado'       THEN 'scheduled'
      WHEN 'scheduled'      THEN 'scheduled'
      WHEN 'visitou'        THEN 'visited'
      WHEN 'visited'        THEN 'visited'
      WHEN 'negociando'     THEN 'negotiation'
      WHEN 'negotiation'    THEN 'negotiation'
      WHEN 'proposed'       THEN 'negotiation'
      WHEN 'venda realizada' THEN 'closed'
      WHEN 'vendido'        THEN 'closed'
      WHEN 'fechado'        THEN 'closed'
      WHEN 'closed'         THEN 'closed'
      WHEN 'perda total'    THEN 'lost'
      WHEN 'perdido'        THEN 'lost'
      WHEN 'lost'           THEN 'lost'
      WHEN 'desistiu'       THEN 'lost'
      WHEN 'sem interesse'  THEN 'lost'
      WHEN 'inativo'        THEN 'lost'
      WHEN 'lixo'           THEN 'lost'
      WHEN 'duplicado'      THEN 'lost'
      ELSE COALESCE(m.status, 'received')
    END                                            AS status,
    m.assigned_consultant_id                       AS assigned_consultant_id,
    COALESCE(m.created_at, NOW())                  AS created_at,
    COALESCE(m.updated_at, NOW())                  AS updated_at,
    m.valor_investimento                           AS valor_investimento,
    m.metodo_compra                                AS metodo_compra,
    m.carro_troca                                  AS carro_troca,
    m.city                                         AS region,
    NULL::integer                                  AS response_time_seconds,
    NULL::timestamptz                              AS scheduled_at,
    m.observacoes                                  AS observacoes,
    m.primeiro_vendedor                            AS vendedor,
    m.ai_summary                                   AS resumo_consultor,
    m.next_step                                    AS proxima_acao,
    'leads_master'                                 AS source_table,
    1                                              AS priority
  FROM public.leads_master m
  WHERE m.phone IS NOT NULL AND trim(m.phone) != ''

  UNION ALL

  -- Source 2: leads_manos_crm (priority 2)
  SELECT
    'main_' || m.id::text                          AS id,
    COALESCE(m.name, '')                           AS name,
    m.phone                                        AS phone,
    m.email                                        AS email,
    m.source                                       AS source,
    m.source                                       AS origem,
    m.vehicle_interest                             AS vehicle_interest,
    m.vehicle_interest                             AS interesse,
    COALESCE(m.ai_score, 0)                        AS ai_score,
    m.ai_classification                            AS ai_classification,
    m.ai_summary                                   AS ai_summary,
    m.ai_reason                                    AS ai_reason,
    CASE LOWER(COALESCE(m.status, 'received'))
      WHEN 'new'         THEN 'received'
      WHEN 'received'    THEN 'received'
      WHEN 'attempt'     THEN 'attempt'
      WHEN 'contacted'   THEN 'contacted'
      WHEN 'scheduled'   THEN 'scheduled'
      WHEN 'visited'     THEN 'visited'
      WHEN 'negotiation' THEN 'negotiation'
      WHEN 'proposed'    THEN 'negotiation'
      WHEN 'closed'      THEN 'closed'
      WHEN 'lost'        THEN 'lost'
      ELSE m.status
    END                                            AS status,
    m.assigned_consultant_id                       AS assigned_consultant_id,
    m.created_at                                   AS created_at,
    m.updated_at                                   AS updated_at,
    m.valor_investimento                           AS valor_investimento,
    m.metodo_compra                                AS metodo_compra,
    m.carro_troca                                  AS carro_troca,
    m.region                                       AS region,
    m.response_time_seconds                        AS response_time_seconds,
    m.scheduled_at                                 AS scheduled_at,
    m.observacoes                                  AS observacoes,
    m.primeiro_vendedor                            AS vendedor,
    m.resumo_consultor                             AS resumo_consultor,
    m.proxima_acao                                 AS proxima_acao,
    'leads_manos_crm'                              AS source_table,
    2                                              AS priority
  FROM public.leads_manos_crm m
  WHERE m.phone IS NOT NULL AND trim(m.phone) != ''

  UNION ALL

  -- Source 3: leads_distribuicao_crm_26 (priority 3)
  SELECT
    'crm26_' || d.id::text                         AS id,
    COALESCE(d.nome, '')                           AS name,
    d.telefone                                     AS phone,
    NULL::text                                     AS email,
    COALESCE(d.origem, 'Meta Ads')                 AS source,
    d.origem                                       AS origem,
    COALESCE(d.vehicle_interest, d.interesse)      AS vehicle_interest,
    d.interesse                                    AS interesse,
    COALESCE(d.ai_score, 0)                        AS ai_score,
    d.ai_classification                            AS ai_classification,
    COALESCE(d.ai_summary, d.resumo_consultor)     AS ai_summary,
    d.ai_reason                                    AS ai_reason,
    CASE LOWER(TRIM(COALESCE(d.status, 'received')))
      WHEN 'novo'                   THEN 'received'
      WHEN 'nova'                   THEN 'received'
      WHEN 'new'                    THEN 'received'
      WHEN 'received'               THEN 'received'
      WHEN 'aguardando'             THEN 'received'
      WHEN 'aguardando atendimento' THEN 'received'
      WHEN 'sem contato'            THEN 'received'
      WHEN 'em atendimento'         THEN 'attempt'
      WHEN 'contatado'              THEN 'contacted'
      WHEN 'attempt'                THEN 'attempt'
      WHEN 'contacted'              THEN 'contacted'
      WHEN 'agendado'               THEN 'scheduled'
      WHEN 'agendamento'            THEN 'scheduled'
      WHEN 'scheduled'              THEN 'scheduled'
      WHEN 'visitou'                THEN 'visited'
      WHEN 'visita realizada'       THEN 'visited'
      WHEN 'visited'                THEN 'visited'
      WHEN 'negociando'             THEN 'negotiation'
      WHEN 'negotiation'            THEN 'negotiation'
      WHEN 'proposed'               THEN 'negotiation'
      WHEN 'venda realizada'        THEN 'closed'
      WHEN 'vendido'                THEN 'closed'
      WHEN 'fechado'                THEN 'closed'
      WHEN 'closed'                 THEN 'closed'
      WHEN 'perda total'            THEN 'lost'
      WHEN 'perda_total'            THEN 'lost'
      WHEN 'perdido'                THEN 'lost'
      WHEN 'lost'                   THEN 'lost'
      WHEN 'desistiu'               THEN 'lost'
      WHEN 'sem interesse'          THEN 'lost'
      WHEN 'inativo'                THEN 'lost'
      WHEN 'lixo'                   THEN 'lost'
      WHEN 'duplicado'              THEN 'lost'
      WHEN 'lost_redistributed'     THEN 'lost'
      ELSE COALESCE(d.status, 'received')
    END                                            AS status,
    d.assigned_consultant_id                       AS assigned_consultant_id,
    COALESCE(d.criado_em, NOW())                   AS created_at,
    COALESCE(d.atualizado_em::timestamptz, d.criado_em, NOW()) AS updated_at,
    d.valor_investimento                           AS valor_investimento,
    d.metodo_compra                                AS metodo_compra,
    d.carro_troca                                  AS carro_troca,
    d.cidade                                       AS region,
    d.response_time_seconds                        AS response_time_seconds,
    NULL::timestamptz                              AS scheduled_at,
    NULL::text                                     AS observacoes,
    d.vendedor                                     AS vendedor,
    d.resumo_consultor                             AS resumo_consultor,
    d.proxima_acao                                 AS proxima_acao,
    'leads_distribuicao_crm_26'                    AS source_table,
    3                                              AS priority
  FROM public.leads_distribuicao_crm_26 d
  WHERE d.nome IS NOT NULL
    AND trim(d.nome) != ''
    AND d.telefone IS NOT NULL
    AND trim(d.telefone) != ''
    AND LOWER(COALESCE(d.status, '')) != 'lost_redistributed'
)

SELECT DISTINCT ON (phone)
  id, name, phone, email, source, origem, vehicle_interest, interesse,
  ai_score, ai_classification, ai_summary, ai_reason, status,
  assigned_consultant_id, created_at, updated_at, valor_investimento,
  metodo_compra, carro_troca, region, response_time_seconds,
  scheduled_at, observacoes, vendedor, resumo_consultor, proxima_acao,
  source_table, priority
FROM all_sources
ORDER BY phone, priority ASC, created_at DESC;

-- Re-grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
`;

async function main() {
  console.log('=== APPLYING DEFINITIVE leads VIEW FIX ===\n');
  
  // Execute the SQL
  const result = await postJSON(
    'api.supabase.com',
    `/v1/projects/${PROJECT_REF}/database/query`,
    ACCESS_TOKEN,
    { query: DEFINITIVE_SQL }
  );
  
  console.log('HTTP Status:', result.status);
  const responseText = result.body.slice(0, 1000);
  
  if (result.status === 200 || result.status === 201) {
    console.log('✅ SQL executado com sucesso!');
    console.log('Response:', responseText);
    
    // Verify
    console.log('\n=== Verifying new columns ===');
    const verifyResult = await postJSON(
      'api.supabase.com',
      `/v1/projects/${PROJECT_REF}/database/query`,
      ACCESS_TOKEN,
      { query: `
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'leads'
        ORDER BY ordinal_position;
      `}
    );
    if (verifyResult.status === 200 || verifyResult.status === 201) {
      const cols = JSON.parse(verifyResult.body);
      console.log(`✅ VIEW has ${cols.length} columns:`);
      cols.forEach(c => console.log(`  ${c.column_name} (${c.data_type})`));
    }

    // Count leads
    console.log('\n=== Counting leads ===');
    const sbService = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { count, error } = await sbService.from('leads').select('*', { count: 'exact', head: true });
    if (error) console.error('Count error:', error.message);
    else console.log(`✅ Total leads: ${count}`);
    
  } else {
    console.error('❌ Falha:', responseText);
  }
}

main().catch(console.error);
