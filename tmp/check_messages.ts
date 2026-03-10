
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkTable() {
    const { data, error } = await supabase.from('whatsapp_messages').select('*').limit(5);
    if (error) console.error(error);
    else console.log("Sample messages:", JSON.stringify(data, null, 2));
}

checkTable();
