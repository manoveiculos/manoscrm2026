
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

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing credentials");
    process.exit(1);
}

const url = new URL(supabaseUrl);
const hostname = url.hostname;
const pathPrefix = '/rest/v1';

function request(method, endpoint) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: hostname,
            path: `${pathPrefix}${endpoint}`,
            method: method,
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
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
    console.log("Checking sales_manos_crm table...");
    const sales = await request('GET', '/sales_manos_crm?select=*&limit=1');
    console.log("Sales Sample:", JSON.stringify(sales, null, 2));

    console.log("\nChecking table columns (via OpenAPI)...");
    const spec = await request('GET', '/');
    if (spec && spec.definitions && spec.definitions.sales_manos_crm) {
        console.log("Columns:", Object.keys(spec.definitions.sales_manos_crm.properties));
    } else {
        console.log("Could not find table definition in OpenAPI spec.");
    }
}

run();
