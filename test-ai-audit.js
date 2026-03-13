fetch('http://localhost:3000/api/marketing-quality-analysis', {
  method: 'POST',
  body: JSON.stringify({ period: 'last_30_days' }),
  headers: { 'Content-Type': 'application/json' }
}).then(r => r.json()).then(d => {
  console.log(JSON.stringify(d, null, 2));
}).catch(console.error);
