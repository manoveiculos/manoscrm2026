
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSales() {
    try {
        console.log("--- Count sales ---");
        const { count, error: countError } = await supabase
            .from('sales_manos_crm')
            .select('*', { count: 'exact', head: true });
        
        if (countError) {
            console.error("Error counting sales:", countError);
        } else {
            console.log("Total sales count:", count);
        }

        console.log("\n--- Try simple select ---");
        const { data, error } = await supabase
            .from('sales_manos_crm')
            .select('*')
            .limit(1);
        
        if (error) {
            console.error("Error simple select:", error);
        } else {
            console.log("Data sample:", data);
        }

        console.log("\n--- Try joint select ---");
        const { data: jointData, error: jointError } = await supabase
            .from('sales_manos_crm')
            .select('*, leads_manos_crm(name), consultants_manos_crm(name)')
            .limit(1);
        
        if (jointError) {
            console.error("Error joint select (leads_manos_crm, consultants_manos_crm):", jointError);
        } else {
            console.log("Joint data sample:", jointData);
        }

    } catch (err) {
        console.error("Unexpected error:", err);
    }
}

testSales();
