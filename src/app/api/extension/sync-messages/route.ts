
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
        const isNumeric = (str: string) => /^\d+$/.test(str);

        // Identificar se o leadId é compatível com BIGINT
        const cleanId = leadId.replace('crm26_', '');

        if (!isNumeric(cleanId)) {
            console.error(`[Sync API] Lead ID ${leadId} não é numérico (BigInt). Abortando inserção em whatsapp_messages.`);
            // Se o seu banco usa UUID para a tabela principal, você deve alterar o campo lead_id para TEXT ou UUID.
            return NextResponse.json({
                success: false,
                error: `O Lead ${leadId} usa UUID, mas o banco espera BigInt. Altere o campo lead_id para TEXT.`
            }, { status: 400 });
        }

        const messagesToInsert = messages.map((m: any) => ({
            lead_id: parseInt(cleanId),
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
