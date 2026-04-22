const url = 'https://jkblxdxnbmciicakusnl.supabase.co/rest/v1/';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmx4ZHhuYm1jaWljYWt1c25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUwNDg0MiwiZXhwIjoyMDY5MDgwODQyfQ.d1EtCmCuZkzgKz6Pv1lyhFH-mDvyHEKaltmhFwS9DPQ';

async function verify() {
    console.log('Verificando tabelas no Supabase...');
    
    // Testar se notification_failures existe
    const resFailures = await fetch(`${url}notification_failures?select=*&limit=1`, {
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`
        }
    });

    if (resFailures.ok) {
        console.log('✅ Tabela notification_failures existe.');
    } else {
        console.log('❌ Tabela notification_failures NÃO encontrada ou erro:', resFailures.status);
    }

    // Testar se ai_pending existe em leads_manos_crm
    const resLeads = await fetch(`${url}leads_manos_crm?select=ai_pending&limit=1`, {
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`
        }
    });

    if (resLeads.ok) {
        console.log('✅ Coluna ai_pending existe em leads_manos_crm.');
    } else {
        console.log('❌ Coluna ai_pending NÃO encontrada ou erro em leads_manos_crm:', resLeads.status);
    }
}

verify();
