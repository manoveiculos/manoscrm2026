import { createClient } from '@supabase/supabase-js';

async function setup() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Check active consultants
    const { data: consultants } = await supabase.from('consultants_manos_crm').select('*').eq('is_active', true).limit(2);

    if (!consultants || consultants.length < 2) {
        console.log("Activating mock consultants for test...");
        // Activate/Create at least 2
        await supabase.from('consultants_manos_crm').upsert([
            { id: 'mock-1', name: 'Consultor Teste 1', is_active: true, on_duty: true },
            { id: 'mock-2', name: 'Consultor Teste 2', is_active: true, on_duty: true }
        ]);
        console.log("Mock consultants ready.");
    } else {
        console.log("Active consultants found:", consultants.map(c => c.name));
    }
}

setup().catch(console.error);
