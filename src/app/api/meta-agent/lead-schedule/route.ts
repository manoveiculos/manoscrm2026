import { NextRequest, NextResponse } from 'next/server';
import { validateMetaAgentAuth } from '@/lib/metaAgentAuth';
import { createLead } from '@/lib/services/leadCrud';
import { trackAppointmentScheduled } from '@/lib/services/metaConversionService';

export async function POST(req: NextRequest) {
    const auth = validateMetaAgentAuth(req);
    if (!auth.valid) return auth.response!;

    try {
        const body = await req.json();
        const customerName = body.customer_name || body.name || body.nome;
        const customerPhone = body.customer_phone || body.phone || body.telefone || body.whatsapp;
        const vehicleInterest = body.vehicle_id || body.vehicle_interest || body.interesse || 'Interesse Showroom';
        const desiredDate = body.desired_date || body.data_agendamento || body.horario;
        const notes = body.notes || body.observacoes || 'Lead cadastrado via Meta Business Agent (WhatsApp)';

        if (!customerPhone) {
            return NextResponse.json({ error: 'customer_phone (telefone) é obrigatório' }, { status: 400 });
        }

        // 1. Criar ou atualizar lead no Manos-CRM
        const leadRecord = await createLead({
            name: customerName || 'Lead WhatsApp Business Agent',
            phone: customerPhone,
            source: 'WhatsApp Meta Agent',
            status: desiredDate ? 'agendado' as any : 'received' as any,
            vehicle_interest: vehicleInterest,
            observacoes: `🤖 **Cadastrado via Meta Business Agent (WhatsApp)**\n📍 **Interesse:** ${vehicleInterest}\n📅 **Agendamento:** ${desiredDate || 'Não informado'}\n📝 **Obs:** ${notes}`
        });

        // 2. Disparar CAPI de agendamento se data informada
        if (desiredDate && leadRecord) {
            trackAppointmentScheduled({
                id: leadRecord.id,
                name: customerName,
                phone: customerPhone,
                vehicle_interest: vehicleInterest,
                source: 'WhatsApp Meta Agent'
            }).catch(e => console.warn('Non-blocking CAPI schedule error:', e));
        }

        return NextResponse.json({
            success: true,
            lead_id: leadRecord?.id || 'lead_created',
            message: desiredDate 
                ? `Visita/Test-drive agendado com sucesso para ${desiredDate}! Nossa equipe em Balneário Camboriú aguarda o cliente.`
                : `Atendimento registrado com sucesso! Um consultor entrará em contato em instantes.`,
            store_address: "Mano's Veículos - Av. Santa Catarina, 1200 - Balneário Camboriú / SC"
        });

    } catch (err: any) {
        console.error('API /api/meta-agent/lead-schedule error:', err);
        return NextResponse.json({ error: err.message || 'Erro ao registrar agendamento' }, { status: 500 });
    }
}
