
const phone = '554797043310';
const url = 'https://jkblxdxnbmciicakusnl.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmx4ZHhuYm1jaWljYWt1c25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUwNDg0MiwiZXhwIjoyMDY5MDgwODQyfQ.d1EtCmCuZkzgKz6Pv1lyhFH-mDvyHEKaltmhFwS9DPQ';

if (!url || !key) {
    console.error("Missing env vars");
    process.exit(1);
}

async function check() {
    console.log(`Checking lead ${phone}...`);
    
    // Check main table
    const resMain = await fetch(`${url}/rest/v1/leads_manos_crm?phone=ilike.*${phone}*&select=*`, {
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`
        }
    });
    
    if (resMain.ok) {
        const data = await resMain.json();
        console.log("Main Table Result:", data.length > 0 ? `Found ${data.length} leads` : "Not found");
        if (data.length > 0) console.log("Columns:", Object.keys(data[0]));
    } else {
        console.error("Main Table Fetch Error:", resMain.status, await resMain.text());
    }

    // Check crm 26 table
    const res26 = await fetch(`${url}/rest/v1/leads_distribuicao_crm_26?telefone=ilike.*${phone}*&select=*`, {
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`
        }
    });

    if (res26.ok) {
        const data = await res26.json();
        console.log("CRM26 Table Result:", data.length > 0 ? `Found ${data.length} leads` : "Not found");
        if (data.length > 0) console.log("Columns:", Object.keys(data[0]));
    } else {
        console.error("CRM26 Table Fetch Error:", res26.status, await res26.text());
    }
}

check();
