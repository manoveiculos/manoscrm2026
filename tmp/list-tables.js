
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function listTables() {
  const { data, error } = await supabase
    .rpc('get_tables'); // Check if a custom RPC exists first, or use a query

  if (error) {
    // If RPC fails, try querying public.tables
    const { data: tables, error: tableError } = await supabase
      .from('pg_tables') // This might not work via standard API due to schema permissions
      .select('tablename')
      .eq('schemaname', 'public');
    
    if (tableError) {
      // Last resort: query common table names
      console.log('Could not list tables automatically. Trying common names...');
      const commonTables = ['profiles', 'users', 'admins', 'consultants', 'leads', 'vendedores'];
      for (const table of commonTables) {
        const { error: checkError } = await supabase.from(table).select('count').limit(0);
        if (!checkError) {
          console.log(`Table exists: ${table}`);
        }
      }
    } else {
      console.log('Tables:', tables.map(t => t.tablename));
    }
  } else {
    console.log('Tables:', data);
  }
}

listTables();
