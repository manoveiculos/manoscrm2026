import { createClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionToken } from '@/lib/extensionAuth';

export async function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PATCH, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
}

export async function OPTIONS() {
    return NextResponse.json({}, { headers: await corsHeaders() });
}

export async function POST(req: NextRequest) {
    const authError = verifyExtensionToken(req);
    if (authError) return authError;

    const headers = await corsHeaders();

    try {
        const body = await req.json();
        const { 
            lead_id, 
            score, 
            score_label, 
            category, 
            reason, 
            correct_label,
            user_name,
            lead_name,
            lead_phone,
            lead_status
        } = body;

        if (!lead_id || !category || !reason) {
            return NextResponse.json({ error: 'Dados incompletos' }, { status: 400, headers });
        }

        const supabase = createClient();
        const cleanId = lead_id.toString().replace(/^(main_|crm26_|dist_|master_|lead_)/, '');

        // 1. Salvar feedback na tabela ai_feedback
        const { error: feedbackError } = await supabase
            .from('ai_feedback')
            .insert({
                lead_id: cleanId,
                lead_name: lead_name || '',
                lead_phone: lead_phone || '',
                reported_score: score,
                reported_label: score_label,
                correct_label: correct_label || '',
                reason: reason.trim(),
                category: category,
                lead_status: lead_status || '',
                reported_by: user_name || 'Extension User',
                created_at: new Date().toISOString()
            });

        if (feedbackError) throw feedbackError;

        // 2. Registrar na timeline (interactions_manos_crm)
        const { error: iterationError } = await supabase
            .from('interactions_manos_crm')
            .insert({
                lead_id: cleanId,
                type: 'ai_feedback',
                notes: `⚠️ FEEDBACK DE SCORE: ${category}. Motivo: "${reason.trim()}". IA disse: ${score}% (${score_label}). Vendedor indicou erro.`,
                user_name: user_name || 'Extension User',
                created_at: new Date().toISOString(),
            });

        if (iterationError) throw iterationError;

        return NextResponse.json({ success: true }, { headers });

    } catch (err: any) {
        console.error("AI Feedback API Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500, headers });
    }
}
