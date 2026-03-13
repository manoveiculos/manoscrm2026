import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Read .env.local manually
const envPath = path.resolve('.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const envVars = envContent.split('\n').reduce((acc: any, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    acc[match[1]] = match[2];
  }
  return acc;
}, {});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLead() {
  console.log("Searching for lead Diogo Rodrigues or phone (85) 99767-4827...");
  
  let { data: leadsPhone, error: errPhone } = await supabase
    .from('leads')
    .select('*')
    .like('phone', '%85%99767%4827%');
    
  if (errPhone) {
    console.error("Error searching by phone:", errPhone);
  }
  
  let leads = leadsPhone || [];
  
  if (leads.length === 0) {
    let { data: leadsName, error: errName } = await supabase
      .from('leads')
      .select('*')
      .ilike('name', '%Diogo Rodrigues%');
      
    if (errName) {
      console.error("Error searching by name:", errName);
    }
    leads = leadsName || [];
  }
  
  console.log(`Found ${leads.length} leads matching criteria.`);
  for (const lead of leads) {
    console.log(JSON.stringify(lead, null, 2));
    
    // Attempt audit logs
    const tables = ['lead_history', 'audit_logs', 'notes', 'activities'];
    for (const table of tables) {
      try {
        let { data: tableData, error: tableErr } = await supabase
          .from(table)
          .select('*')
          .eq('lead_id', lead.id);
          
        if (!tableErr && tableData && tableData.length > 0) {
          console.log(`\nFound ${tableData.length} records in table '${table}':`);
          console.log(JSON.stringify(tableData, null, 2));
        }
      } catch (e) {
        // Table might not exist
      }
    }
  }
}

checkLead().catch(console.error);
