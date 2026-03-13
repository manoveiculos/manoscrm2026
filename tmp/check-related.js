
const https = require('https');
const fs = require('fs');
const path = require('path');

// Read .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        env[match[1]] = value;
    }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const url = new URL(supabaseUrl);
const hostname = url.hostname;

function request(method, path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: hostname,
            path: `/rest/v1${path}`,
            method: method,
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        });
        req.on('error', (e) => reject(e));
        req.end();
    });
}

async function run() {
    console.log("Checking consultants_manos_crm...");
    const consultants = await request('GET', '/consultants_manos_crm?select=id,name&limit=5');
    console.log("Consultants:", JSON.stringify(consultants, null, 2));

    console.log("\nChecking leads_manos_crm...");
    const leads = await request('GET', '/leads_manos_crm?select=id,name&limit=5');
    console.log("Leads:", JSON.stringify(leads, null, 2));

    console.log("\nChecking sales_manos_crm data...");
    const sales = await request('GET', '/sales_manos_crm?select=*&limit=5');
    console.log("Sales raw:", JSON.stringify(sales, null, 2));
}

run();
