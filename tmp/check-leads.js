
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
    console.log("Checking leads_distribuicao_crm_26...");
    const leads = await request('GET', '/leads_distribuicao_crm_26?select=id,nome,status&limit=10');
    console.log("Leads:", JSON.stringify(leads, null, 2));

    console.log("\nChecking statuses count...");
    const statuses = await request('GET', '/leads_distribuicao_crm_26?select=status');
    const counts = {};
    if (Array.isArray(statuses)) {
        statuses.forEach(l => {
            counts[l.status] = (counts[l.status] || 0) + 1;
        });
    }
    console.log("Status counts:", counts);
}

run();
