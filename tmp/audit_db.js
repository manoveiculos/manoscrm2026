
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://jkblxdxnbmciicakusnl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmx4ZHhuYm1jaWljYWt1c25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUwNDg0MiwiZXhwIjoyMDY5MDgwODQyfQ.d1EtCmCuZkzgKz6Pv1lyhFH-mDvyHEKaltmhFwS9DPQ';

const supabase = createClient(supabaseUrl, supabaseKey);

async function auditSchema() {
    console.log("Auditing Schema...");

    // Check leads_manos_crm
    const { data: mainCols, error: err1 } = await supabase.rpc('get_column_info', { table_name: 'leads_manos_crm' });
    if (err1) {
        // Fallback: try a query and look at the types
        console.log("Main Table Sample:");
        const { data } = await supabase.from('leads_manos_crm').select('*').limit(1);
        console.log(data);
    } else {
        console.log("Main Cols:", mainCols);
    }

    // Check whatsapp_messages
    console.log("\nWhatsApp Messages Sample:");
    const { data: msgData, error: msgError } = await supabase.from('whatsapp_messages').select('*').limit(1);
    if (msgError) console.error(msgError);
    else console.log(msgData);

    // Check FKs if possible, or just deduce from a test insert
    console.log("\nDeducing FK for whatsapp_messages...");
    // Try inserting a UUID - if it fails with FK error to a different table, we know.
    const testUuid = '00000000-0000-0000-0000-000000000000';
    const { error: insertError } = await supabase.from('whatsapp_messages').insert({
        lead_id: testUuid, // We don't know if it's uuid or bigint yet
        message_text: 'Test Audit',
        direction: 'inbound'
    });
    console.log("Insert Test Result (UUID):", insertError?.message || "Success! (Wait, that's unexpected if it was bigint)");

    // Try inserting a BigInt
    const testBigInt = 999999999;
    const { error: insertError2 } = await supabase.from('whatsapp_messages').insert({
        lead_id: testBigInt,
        message_text: 'Test Audit BigInt',
        direction: 'inbound'
    });
    console.log("Insert Test Result (BigInt):", insertError2?.message || "Success!");
}

auditSchema();
