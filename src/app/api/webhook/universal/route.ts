import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { assignNextConsultant } from '@/lib/services/autoAssignService';
import { scheduleFirstContact } from '@/lib/services/aiSdrService';
import { notifyLeadArrival } from '@/lib/services/vendorNotifyService';

/**
 * WEBHOOK UNIVERSAL (Fase E)
 * Recebe leads de OLX, Webmotors, iCarros, etc via Zapier/n8n.
 * 
 * Campos esperados (JSON):
 * - name / nome
 * - phone / telefone / celular
 * - email
 * - vehicle / veiculo / interesse
 * - source / origem
 * - message / mensagem / resumo
 */

export async function POST(req: NextRequest) {
    const admin = createClient();
    try {
        const body = await req.json();
        
        // Normalização de campos
        const name = body.name || body.nome || 'Lead Integrado';
        const rawPhone = body.phone || body.telefone || body.celular || '';
        const email = body.email || '';
        const vehicle = body.vehicle || body.veiculo || body.interesse || '';
        const source = body.source || body.origem || 'Integração';
        const message = body.message || body.mensagem || body.resumo || '';

        const cleanPhone = String(rawPhone).replace(/\D/g, '');
        if (!cleanPhone || cleanPhone.length < 8) {
            return NextResponse.json({ error: 'Telefone inválido ou ausente' }, { status: 400 });
        }

        // 1. DEDUPLICAÇÃO (Check de 30 dias)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
        const { data: existing } = await admin
            .from('leads_manos_crm')
            .select('id, status, assigned_consultant_id')
            .eq('phone', cleanPhone)
            .gte('created_at', thirtyDaysAgo)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (existing) {
            // Se já existe e não é status final, apenas atualiza
            const finalStatuses = ['vendido', 'perdido', 'lost', 'lost_by_inactivity'];
            if (!finalStatuses.includes(existing.status)) {
                await admin.from('leads_manos_crm').update({
                    updated_at: new Date().toISOString(),
                    resumo: `[RE-ENTRADA via ${source}]: ${message}\n\n` + (body.old_resumo || '')
                }).eq('id', existing.id);

                return NextResponse.json({ 
                    success: true, 
                    duplicated: true, 
                    lead_id: existing.id, 
                    message: 'Lead já existente. Atualizado histórico.' 
                });
            }
        }

        // 2. CRIAÇÃO DE NOVO LEAD
        const { data: newLead, error: insertError } = await admin
            .from('leads_manos_crm')
            .insert({
                name,
                phone: cleanPhone,
                email,
                vehicle_interest: vehicle,
                source: `${source} (API)`,
                status: 'new',
                dados_brutos: body,
                observacoes: message
            })
            .select()
            .single();

        if (insertError) throw insertError;

        // 3. ATRIBUIÇÃO AUTOMÁTICA
        const consultantId = await assignNextConsultant(newLead.id, 'leads_manos_crm');

        // 4. AI SDR (Primeiro Contato em ~30s)
        scheduleFirstContact({
            leadId: newLead.id,
            leadName: name,
            leadPhone: cleanPhone,
            vehicleInterest: vehicle,
            source: source,
            consultantName: null,
            flow: 'venda',
        }, 'leads_manos_crm');

        // 5. NOTIFICAÇÃO VENDEDOR
        notifyLeadArrival(newLead.id).catch(console.error);

        return NextResponse.json({ 
            success: true, 
            lead_id: newLead.id, 
            assigned_to: consultantId 
        });

    } catch (err: any) {
        console.error('[Universal Webhook] Erro:', err.message);
        return NextResponse.json({ error: 'Erro interno', details: err.message }, { status: 500 });
    }
}

// Handler para GET (Verificação/Teste)
export async function GET() {
    return NextResponse.json({ 
        status: 'online', 
        message: 'Manos CRM Universal Webhook Hub v1.0',
        usage: 'POST JSON with {name, phone, email, vehicle, source, message}' 
    });
}
