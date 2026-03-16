
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);


export async function POST(req: NextRequest) {
    try {
        const { leadId, messages, phone, name } = await req.json();

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json({ error: 'Mensagens inválidas' }, { status: 400 });
        }

        let finalLeadId = leadId;
        let numericId: number | null = null;

        // 1. Resolver o ID do lead
        // Se temos um leadId (pode ser UUID ou 'crm26_X')
        if (finalLeadId) {
            const cleanId = finalLeadId.replace('crm26_', '').replace('main_', '');
            if (/^\d+$/.test(cleanId)) {
                numericId = parseInt(cleanId);
            }
        }

        // Se não temos numericId e temos telefone, tentamos buscar ou criar
        if (!numericId && phone) {
            const cleanPhone = phone.replace(/\D/g, '');
            // Busca na crm26 primeiro (quem usa bigint)
            const { data: lead26 } = await supabaseAdmin
                .from('leads_distribuicao_crm_26')
                .select('id')
                .eq('telefone', cleanPhone)
                .maybeSingle();
            
            if (lead26) {
                numericId = lead26.id;
            } else {
                // Se não existe na crm26, tentamos criar no CRM Main (que gera UUID)
                // Mas whatsapp_messages ainda aponta para crm26 no schema...
                // Para manter compatibilidade agora, vamos criar na crm26 se for necessário salvar mensagens.
                const { data: newLead, error: createError } = await supabaseAdmin
                    .from('leads_distribuicao_crm_26')
                    .insert([{
                        nome: name || 'Lead WhatsApp',
                        telefone: cleanPhone,
                        origem: 'WhatsApp Extension',
                        status: 'received',
                        criado_em: new Date().toISOString()
                    }])
                    .select()
                    .single();
                
                if (!createError && newLead) {
                    numericId = newLead.id;
                }
            }
        }

        if (!numericId) {
            return NextResponse.json({ 
                success: false, 
                error: 'Não foi possível associar a um lead compatível com histórico (BigInt).' 
            }, { status: 404 });
        }


        // 2. Preparar mensagens para inserção
        const messagesToInsert = messages.map((m: any) => ({
            lead_id: numericId,
            message_text: m.text,
            direction: m.direction,
            created_at: m.timestamp || new Date().toISOString()
        }));

        // 3. Deduplicação BÁSICA: Buscar mensagens recentes deste lead para evitar duplicidade no mesmo sync
        // No futuro, adicionar um UNIQUE INDEX (lead_id, message_text, direction, created_at) no Postgres
        const { data: existingMsgs } = await supabaseAdmin
            .from('whatsapp_messages')
            .select('message_text, direction')
            .eq('lead_id', numericId)
            .order('created_at', { ascending: false })
            .limit(messagesToInsert.length + 50);

        const filteredMessages = messagesToInsert.filter(newMsg => {
            return !existingMsgs?.some(extMsg => 
                extMsg.message_text === newMsg.message_text && 
                extMsg.direction === newMsg.direction
            );
        });

        if (filteredMessages.length === 0) {
            return NextResponse.json({ 
                success: true, 
                count: 0, 
                message: 'Nenhuma mensagem nova para sincronizar.',
                leadId: `crm26_${numericId}`
            });
        }

        const { error } = await supabaseAdmin
            .from('whatsapp_messages')
            .insert(filteredMessages);

        if (error) throw error;

        return NextResponse.json({ 
            success: true, 
            count: filteredMessages.length,
            leadId: `crm26_${numericId}`
        });


    } catch (err: any) {
        console.error("Sync API Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

