
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: NextRequest) {
    try {
        const { leadId, messages } = await req.json();

        if (!leadId) {
            return NextResponse.json({ error: 'Lead ID é obrigatório' }, { status: 400 });
        }

        // Simulação de lógica de IA para diagnóstico (No futuro integration com OpenAI/Gemini)
        // Por enquanto, baseado no status e se há mensagens
        const { data: lead } = await supabaseAdmin
            .from('leads_manos_crm')
            .select('*')
            .eq('id', leadId.replace(/main_|crm26_|dist_/, ''))
            .maybeSingle();

        const hasMessages = messages && messages.length > 0;
        
        let diagnostico = "Lead recém chegado. Necessário primeiro contato para qualificação.";
        let proximosPasos = ["Enviar apresentação da Manos Veículos", "Entender se possui carro na troca", "Validar forma de pagamento"];

        if (lead) {
            if (lead.status === 'contacted') {
                diagnostico = "Lead em atendimento. O cliente demonstrou interesse inicial.";
                proximosPasos = ["Agendar visita física", "Enviar ficha de financiamento", "Confirmar disponibilidade do veículo"];
            } else if (lead.status === 'scheduled') {
                diagnostico = "Agendamento confirmado. Foco em preparar o veículo para visita.";
                proximosPasos = ["Confirmar horário 1h antes", "Deixar veículo limpo e posicionado", "Separar ficha técnica"];
            }
        }

        if (!hasMessages && lead?.status === 'received') {
            diagnostico = "Lead ainda não respondeu ou conversa não sincronizada.";
            proximosPasos = ["Realizar ligação ativa", "Enviar mensagem de saudação personalizada", "Tentar contato em horário comercial"];
        }

        return NextResponse.json({
            success: true,
            diagnostico,
            proximos_passos: proximosPasos
        });

    } catch (err: any) {
        console.error("Next Steps API Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
