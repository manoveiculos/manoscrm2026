
const { dataService } = require('./src/lib/dataService');

// Mocking lead data for testing mapping
const testLeads = [
    { id: '1', origem: 'instagram', plataforma_meta: 'instagram', name: 'Test Insta' },
    { id: '2', origem: 'facebook', plataforma_meta: 'facebook', name: 'Test FB' },
    { id: '3', origem: 'whatsapp', plataforma_meta: null, name: 'Test WA' },
    { id: '4', origem: 'google ads', plataforma_meta: null, name: 'Test Google' }
];

function testMapping() {
    console.log("Testing Lead Source Mapping Logic...");
    
    testLeads.forEach(lead => {
        const platformMatch = (lead.plataforma_meta || '').toLowerCase();
        let finalSource = lead.origem || 'WhatsApp';
        
        if (platformMatch.includes('instagram')) finalSource = 'Instagram';
        else if (platformMatch.includes('facebook')) finalSource = 'Facebook Leads';
        else if (finalSource.toLowerCase().includes('google')) finalSource = 'Google';

        console.log(`Input: Origem=${lead.origem}, Platform=${lead.plataforma_meta} => Output: ${finalSource}`);
    });
}

testMapping();
