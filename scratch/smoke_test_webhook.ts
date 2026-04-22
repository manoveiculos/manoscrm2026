/**
 * SMOKE TEST: Facebook Leads Webhook
 * Simula um disparo do Meta Ads para o endpoint local.
 */

async function runSmokeTest() {
    console.log('🚀 Iniciando Smoke Test: Facebook Leads Webhook');
    
    const url = 'http://localhost:3000/api/webhook/facebook-leads';
    
    // Payload simulado do Meta
    const payload = {
        object: 'page',
        entry: [
            {
                id: '123456789',
                time: Math.floor(Date.now() / 1000),
                changes: [
                    {
                        field: 'leadgen',
                        value: {
                            leadgen_id: 'TEST_LEAD_' + Date.now(), // ID fictício
                            page_id: '123456789',
                            form_id: '987654321'
                        }
                    }
                ]
            }
        ]
    };

    try {
        console.log(`📡 Enviando POST para ${url}...`);
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const status = response.status;
        const data = await response.json();

        console.log(`✅ Resposta recebida (Status: ${status})`);
        console.log('📄 Body:', JSON.stringify(data, null, 2));

        if (status === 500 && data.error === 'Falha no Graph API') {
            console.log('ℹ️ O erro 500 é ESPERADO pois o ID do lead é fictício e o Meta Graph API não o encontrará.');
            console.log('✅ Webhook está ATIVO e tentando processar.');
        } else if (status === 200) {
            console.log('🌟 Sucesso total! (Provavelmente o fetch do Graph API foi mockado ou ignorado).');
        } else {
            console.error('❌ Resultado inesperado.');
        }

    } catch (error: any) {
        console.error('❌ Falha crítica ao conectar com o webhook:', error.message);
        console.log('👉 Certifique-se de que o servidor está rodando: npm run dev');
    }
}

runSmokeTest();

