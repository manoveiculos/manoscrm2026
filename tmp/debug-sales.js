
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSales() {
    console.log("Checking sales_manos_crm table...");
    const { data: sales, error: salesError } = await supabase
        .from('sales_manos_crm')
        .select('*');
    
    if (salesError) {
        console.error("Error fetching sales:", salesError);
    } else {
        console.log(`Found ${sales.length} sales.`);
        if (sales.length > 0) {
            console.log("First sale:", sales[0]);
        }
    }

    console.log("\nTesting getRecentSales query...");
    const { data: recent, error: recentError } = await supabase
        .from('sales_manos_crm')
        .select('*, lead:leads_manos_crm(name), consultant:consultants_manos_crm(name)')
        .order('created_at', { ascending: false })
        .limit(5);

    if (recentError) {
        console.error("Error in join query:", JSON.stringify(recentError, null, 2));
    } else {
        console.log("Join query successful!");
        console.log(recent);
    }
}

testSales();
