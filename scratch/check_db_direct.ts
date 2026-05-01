import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data, error } = await supabase.rpc('get_table_info', { table_name: 'leads_manos_crm' });
  if (error) {
    // fallback if rpc doesn't exist
    const { data: cols, error: err2 } = await supabase.from('leads_manos_crm').select('*').limit(1);
    if (err2) {
      console.error('Error:', err2);
    } else {
      console.log('Columns:', Object.keys(cols[0] || {}));
    }
  } else {
    console.log('Table Info:', data);
  }
}

main();
