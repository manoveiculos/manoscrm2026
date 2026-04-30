
const fs = require('fs');
const path = require('path');
const https = require('https');

// Parse .env.local
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

// SQL to fix the VIEW
const FIX_SQL = `
CREATE OR REPLACE VIEW public.leads AS
WITH all_sources AS (

  -- Source 1: leads_master (priority 1 - newest, where updates go)
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
      WHEN 'novo'                    THEN 'received'
      WHEN 'nova'                    THEN 'received'
      WHEN 'new'                     THEN 'received'
      WHEN 'received'                THEN 'received'
      WHEN 'aguardando'              THEN 'received'
      WHEN 'sem contato'             THEN 'received'
      WHEN 'em atendimento'          THEN 'attempt'
      WHEN 'attempt'                 THEN 'attempt'
      WHEN 'contatado'               THEN 'contacted'
      WHEN 'contacted'               THEN 'contacted'
      WHEN 'agendado'                THEN 'scheduled'
      WHEN 'scheduled'               THEN 'scheduled'
      WHEN 'visitou'                 THEN 'visited'
      WHEN 'visited'                 THEN 'visited'
      WHEN 'negociando'              THEN 'negotiation'
      WHEN 'negotiation'             THEN 'negotiation'
      WHEN 'proposed'                THEN 'negotiation'
      WHEN 'venda realizada'         THEN 'closed'
      WHEN 'vendido'                 THEN 'closed'
      WHEN 'fechado'                 THEN 'closed'
      WHEN 'closed'                  THEN 'closed'
      WHEN 'perda total'             THEN 'lost'
      WHEN 'perdido'                 THEN 'lost'
      WHEN 'lost'                    THEN 'lost'
      WHEN 'desistiu'                THEN 'lost'
      WHEN 'sem interesse'           THEN 'lost'
      WHEN 'inativo'                 THEN 'lost'
      WHEN 'lixo'                    THEN 'lost'
      WHEN 'duplicado'               THEN 'lost'
      ELSE COALESCE(m.status, 'received')
    END                                            AS status,
    m.assigned_consultant_id                       AS assigned_consultant_id,
    COALESCE(m.created_at, NOW())                  AS created_at,
    COALESCE(m.updated_at, NOW())                  AS updated_at,
    m.valor_investimento                           AS valor_investimento,
    NULL::text                                     AS metodo_compra,
    NULL::text                                     AS carro_troca,
    COALESCE(m.city, m.region)                     AS region,
    NULL::integer                                  AS response_time_seconds,
    NULL::timestamptz                              AS scheduled_at,
    NULL::text                                     AS observacoes,
    m.primeiro_vendedor                            AS vendedor,
    m.ai_summary                                   AS resumo_consultor,
    m.next_step                                    AS proxima_acao,
    'leads_master'                                 AS source_table,
    1                                              AS priority
  FROM public.leads_master m
  WHERE m.phone IS NOT NULL
    AND trim(m.phone) != ''

  UNION ALL

  -- Source 2: leads_manos_crm (priority 2)
  SELECT
    'main_' || m.id::text                          AS id,
    m.name                                         AS name,
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
    NULL::text                                     AS vendedor,
    NULL::text                                     AS resumo_consultor,
    NULL::text                                     AS proxima_acao,
    'leads_manos_crm'                              AS source_table,
    2                                              AS priority
  FROM public.leads_manos_crm m

  UNION ALL

  -- Source 3: leads_distribuicao_crm_26 (priority 3)
  SELECT
    'crm26_' || d.id::text                         AS id,
    d.nome                                         AS name,
    d.telefone                                     AS phone,
    NULL::text                                     AS email,
    COALESCE(d.origem, 'Meta Ads')                 AS source,
    d.origem                                       AS origem,
    COALESCE(d.vehicle_interest, d.interesse)      AS vehicle_interest,
    d.interesse                                    AS interesse,
    COALESCE(d.ai_score, 0)                        AS ai_score,
    d.ai_classification                            AS ai_classification,
    d.resumo_consultor                             AS ai_summary,
    d.ai_reason                                    AS ai_reason,
    CASE LOWER(TRIM(COALESCE(d.status, 'received')))
      WHEN 'novo'                    THEN 'received'
      WHEN 'nova'                    THEN 'received'
      WHEN 'new'                     THEN 'received'
      WHEN 'received'                THEN 'received'
      WHEN 'aguardando'              THEN 'received'
      WHEN 'aguardando atendimento'  THEN 'received'
      WHEN 'sem contato'             THEN 'received'
      WHEN 'em atendimento'          THEN 'attempt'
      WHEN 'contatado'               THEN 'contacted'
      WHEN 'attempt'                 THEN 'attempt'
      WHEN 'contacted'               THEN 'contacted'
      WHEN 'agendado'                THEN 'scheduled'
      WHEN 'agendamento'             THEN 'scheduled'
      WHEN 'scheduled'               THEN 'scheduled'
      WHEN 'visitou'                 THEN 'visited'
      WHEN 'visita realizada'        THEN 'visited'
      WHEN 'visited'                 THEN 'visited'
      WHEN 'negociando'              THEN 'negotiation'
      WHEN 'negociacao'              THEN 'negotiation'
      WHEN 'negotiation'             THEN 'negotiation'
      WHEN 'proposed'                THEN 'negotiation'
      WHEN 'venda realizada'         THEN 'closed'
      WHEN 'vendido'                 THEN 'closed'
      WHEN 'fechado'                 THEN 'closed'
      WHEN 'closed'                  THEN 'closed'
      WHEN 'perda total'             THEN 'lost'
      WHEN 'perda_total'             THEN 'lost'
      WHEN 'perdido'                 THEN 'lost'
      WHEN 'lost'                    THEN 'lost'
      WHEN 'desistiu'                THEN 'lost'
      WHEN 'sem interesse'           THEN 'lost'
      WHEN 'inativo'                 THEN 'lost'
      WHEN 'lixo'                    THEN 'lost'
      WHEN 'duplicado'               THEN 'lost'
      WHEN 'lost_redistributed'      THEN 'lost'
      ELSE COALESCE(d.status, 'received')
    END                                            AS status,
    d.assigned_consultant_id                       AS assigned_consultant_id,
    d.criado_em                                    AS created_at,
    COALESCE(d.atualizado_em, d.criado_em)         AS updated_at,
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
`;

async function executeSQL(sql) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`);
    // Use the pg_dump approach: POST to /rest/v1/ with raw query via service_role
    // Actually Supabase REST API doesn't expose raw SQL - need to use the management API
    // Instead, use the supabase-js with service_role via HTTP
    
    // Direct approach: use the Supabase SQL Editor endpoint (unofficial but works with service_role)
    const postData = JSON.stringify({ query: sql });
    
    const urlObj = new URL(SUPABASE_URL);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: '/rest/v1/rpc/exec_sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
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
  console.log('Supabase URL:', SUPABASE_URL);
  console.log('Service Role Key present:', SERVICE_ROLE_KEY ? 'YES' : 'NO');
  
  console.log('\nTesting current leads VIEW columns...');
  
  // First check current columns
  const checkRes = await new Promise((resolve, reject) => {
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    sb.from('leads').select('*').limit(1).then(({ data, error }) => {
      if (error) resolve({ error });
      else if (data && data.length > 0) resolve({ columns: Object.keys(data[0]) });
      else resolve({ columns: 'NO_DATA' });
    });
  });
  
  console.log('Current VIEW result:', checkRes);
}

main().catch(console.error);
