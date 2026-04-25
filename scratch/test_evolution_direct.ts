const EVOLUTION_BASE = "https://evolution.drivvoo.com";
const EVOLUTION_INSTANCE = "teste";
const EVOLUTION_TOKEN = "E6780D799660-4FCE-BEDF-3F6CA21320C1";

async function test() {
    console.log('--- Testando Evolution API Standalone ---');
    const url = `${EVOLUTION_BASE}/message/sendText/${EVOLUTION_INSTANCE}`;
    
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': EVOLUTION_TOKEN,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                number: "554784860080", // Sergio
                text: "Teste direto Manos CRM + Evolution API. 🚀",
                linkPreview: false
            }),
        });

        const data = await res.json();
        console.log('Status:', res.status);
        console.log('Resposta:', JSON.stringify(data, null, 2));
    } catch (e: any) {
        console.error('Erro:', e.message);
    }
}

test();
