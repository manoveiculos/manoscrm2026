const url = 'https://jkblxdxnbmciicakusnl.supabase.co/rest/v1/';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprYmx4ZHhuYm1jaWljYWt1c25sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzUwNDg0MiwiZXhwIjoyMDY5MDgwODQyfQ.d1EtCmCuZkzgKz6Pv1lyhFH-mDvyHEKaltmhFwS9DPQ';

async function listColumns() {
    console.log('Listando uma linha para ver as colunas de leads_manos_crm...');
    
    // Tenta pegar um registro para ver as chaves (colunas)
    const res = await fetch(`${url}leads_manos_crm?select=*&limit=1`, {
        headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`
        }
    });

    if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
            console.log('Colunas encontradas:', Object.keys(data[0]).sort().join(', '));
        } else {
            console.log('Tabela vazia, não foi possível inferir colunas via select *');
        }
    } else {
        console.log('Erro ao listar colunas:', res.status);
    }
}

listColumns();
