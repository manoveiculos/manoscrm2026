
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkLead(phone: string) {
    const cleanPhone = phone.replace(/\D/g, '');
    console.log(`Checking for phone: ${phone} (cleaned: ${cleanPhone})`);

    const { data: leads, error } = await supabase
        .from('leads_manos_crm')
        .select('*')
        .or(`phone.ilike.%${cleanPhone}%,phone.ilike.%${cleanPhone.substring(2)}%`);

    if (error) {
        console.error('Error fetching leads:', error);
        return;
    }

    console.log(`Found ${leads?.length || 0} leads in leads_manos_crm:`);
    console.table(leads?.map(l => ({ id: l.id, name: l.name, phone: l.phone })));

    const { data: leads26, error: error26 } = await supabase
        .from('leads_distribuicao_crm_26')
        .select('*')
        .or(`telefone.ilike.%${cleanPhone}%,telefone.ilike.%${cleanPhone.substring(2)}%`);

    if (error26) {
        console.error('Error fetching leads26:', error26);
        return;
    }

    console.log(`Found ${leads26?.length || 0} leads in leads_distribuicao_crm_26:`);
    console.table(leads26?.map(l => ({ id: l.id, nome: l.nome, telefone: l.telefone })));
}

checkLead('4796217787');
