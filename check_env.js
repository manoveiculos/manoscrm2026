
const https = require('https');

const options = {
    hostname: 'manoscrm.com.br',
    port: 443,
    path: '/api/admin/env-check',
    method: 'GET',
    headers: {
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

req.end();
