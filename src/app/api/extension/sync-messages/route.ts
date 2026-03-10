
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: NextRequest) {
    try {
        const { leadId, messages } = await req.json();

        if (!leadId || !messages || !Array.isArray(messages)) {
            return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
        }

        // Preparar mensagens para inserção
        // Formato esperado: { text: string, direction: 'inbound' | 'outbound', timestamp: string }
        const messagesToInsert = messages.map((m: any) => ({
            lead_id: leadId.replace('crm26_', ''), // Remover prefixo se for da tabela crm26
            message_text: m.text,
            direction: m.direction,
            created_at: m.timestamp || new Date().toISOString()
        }));

        const { error } = await supabaseAdmin
            .from('whatsapp_messages')
            .insert(messagesToInsert);

        if (error) throw error;

        return NextResponse.json({ success: true, count: messagesToInsert.length });

    } catch (err: any) {
        console.error("Sync API Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
