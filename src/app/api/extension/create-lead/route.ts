
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { dataService } from '@/lib/dataService';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { phone, name } = body;

        if (!phone) {
            return NextResponse.json({ error: 'Telefone não fornecido' }, { status: 400 });
        }

        const cleanPhone = phone.replace(/\D/g, '');
        console.log(`[Extension API] Criando lead: ${name} (${cleanPhone})`);

        // Usar o dataService para consistência (ele lida com deduplicação, AI, etc)
        const leadData = {
            name: name || 'Lead WhatsApp',
            phone: cleanPhone,
            source: 'WhatsApp Extension',
            status: 'received'
        };

        const result = await dataService.createLead(leadData);

        return NextResponse.json({
            success: true,
            lead: result
        });

    } catch (err: any) {
        console.error("Extension Create Lead API Error:", err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
