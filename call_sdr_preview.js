
const https = require('https');

const data = JSON.stringify({
    leadName: "Teste",
    leadPhone: "5547988467855",
    vehicleInterest: "Onix",
    source: "Test",
    consultantName: "Felipe",
    flow: "venda"
});

const options = {
    hostname: 'manoscrm.com.br',
    port: 443,
    path: '/api/admin/sdr-preview',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': '096c967a99bb8d6409f13ef7b6bee5506cfcab01640bed1cf2be14c4e64f4e09'
    }
};

const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (d) => { body += d; });
    res.on('end', () => {
        console.log(body);
    });
});

req.on('error', (e) => {
    console.error(e);
});

req.write(data);
req.end();
