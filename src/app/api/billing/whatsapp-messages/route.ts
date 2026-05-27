import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

// GET /api/billing/whatsapp-messages
//   ?telefone=47999999999   (mensagens de um número específico, ordem cronológica)
//   ?recent=true            (últimas conversas agrupadas por telefone — para inbox)
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const telefone = searchParams.get('telefone');
        const recent = searchParams.get('recent');

        const admin = createClient();

        if (telefone) {
            const { data, error } = await admin
                .from('billing_whatsapp_messages')
                .select('id, record_id, cpf_cnpj, telefone, direction, body, media_url, media_type, push_name, ai_intent, ai_summary, created_at')
                .eq('telefone', telefone)
                .order('created_at', { ascending: true })
                .limit(500);

            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json(data || []);
        }

        if (recent) {
            // Pega últimas 100 conversas distintas por telefone
            const { data, error } = await admin
                .from('billing_whatsapp_messages')
                .select('id, telefone, push_name, body, direction, ai_intent, created_at, record_id')
                .order('created_at', { ascending: false })
                .limit(500);

            if (error) return NextResponse.json({ error: error.message }, { status: 500 });

            const map: Record<string, any> = {};
            for (const m of (data || [])) {
                if (!map[m.telefone]) {
                    map[m.telefone] = {
                        telefone: m.telefone,
                        push_name: m.push_name,
                        last_message: m.body,
                        last_direction: m.direction,
                        last_intent: m.ai_intent,
                        last_at: m.created_at,
                        record_id: m.record_id,
                        unread: 0,
                    };
                }
                if (m.direction === 'INBOUND') map[m.telefone].unread += 0; // placeholder, sem read receipts ainda
            }
            return NextResponse.json(Object.values(map).slice(0, 100));
        }

        return NextResponse.json({ error: 'parâmetro obrigatório: telefone ou recent=true' }, { status: 400 });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'erro' }, { status: 500 });
    }
}

// POST /api/billing/whatsapp-messages — envia uma mensagem manual
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { telefone, message, recordId, cpfCnpj } = body;

        if (!telefone || !message) {
            return NextResponse.json({ error: 'telefone e message obrigatórios' }, { status: 400 });
        }

        const { sendCobrancaWhatsApp } = await import('@/lib/services/cobrancaWhatsappSender');
        const result = await sendCobrancaWhatsApp({
            toPhone: telefone,
            message,
            recordId,
            cpfCnpj,
        });

        if (!result.ok) {
            return NextResponse.json({ error: result.error }, { status: 502 });
        }
        return NextResponse.json({ ok: true, evolutionMsgId: result.evolutionMsgId });
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'erro' }, { status: 500 });
    }
}
