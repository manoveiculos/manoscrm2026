
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionToken } from '@/lib/extensionAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const TIPO_LABEL: Record<string, string> = {
    compra: 'Compra',
    financiamento: 'Financiamento',
    venda: 'Venda',
};

export async function POST(req: NextRequest) {
    const authError = verifyExtensionToken(req);
    if (authError) return authError;

    try {
        const body = await req.json();
        const { phone, name, interesse, valor_investimento, tipo, consultor_name, source } = body;

        if (!phone) {
            return NextResponse.json({ error: 'Telefone não fornecido' }, { status: 400 });
        }

        const cleanPhone = phone.replace(/\D/g, '');

        // ── Payload — apenas colunas conhecidas no schema ──
        const leadData: Record<string, any> = {
            name: name || 'Lead WhatsApp',
            phone: cleanPhone,
            source: source || 'WhatsApp Extension',
            status: 'received',
            ai_score: 0,
            ai_classification: 'cold',
        };

        if (interesse)          leadData.vehicle_interest  = interesse;
        if (valor_investimento) leadData.valor_investimento = valor_investimento;
        if (tipo)               leadData.metodo_compra      = TIPO_LABEL[tipo] ?? tipo;

        // Resolve consultant ID from name so lead appears in consultant's pipeline
        // leads_manos_crm.assigned_consultant_id references consultants_manos_crm.id
        if (consultor_name) {
            const firstName = consultor_name.trim().split(' ')[0];
            const { data: consultant } = await supabaseAdmin
                .from('consultants_manos_crm')
                .select('id')
                .ilike('name', `%${firstName}%`)
                .eq('is_active', true)
                .maybeSingle();
            if (consultant) {
                leadData.assigned_consultant_id = consultant.id;
            }
        }

        const { data: result, error } = await supabaseAdmin
            .from('leads_manos_crm')
            .insert([leadData])
            .select()
            .single();

        if (error) throw error;

        // ── Registrar na timeline ──────────────────────
        if (result?.id) {
            const tipoLabel = TIPO_LABEL[tipo] ?? tipo ?? 'Não informado';
            const consultant = consultor_name ? ` | Cadastrado por: ${consultor_name}` : '';

            supabaseAdmin
                .from('interactions_manos_crm')
                .insert([{
                    lead_id: result.id,
                    notes: `Lead cadastrado pela extensão WhatsApp | Tipo: ${tipoLabel}${consultant}`,
                    new_status: 'received',
                    created_at: new Date().toISOString(),
                }])
                .then(
                    () => {},
                    (e: any) => console.warn('[Extension] Timeline insert failed:', e.message)
                );
        }

        return NextResponse.json({ success: true, lead: result });

    } catch (err: any) {
        console.error("Extension Create Lead API Error:", err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
