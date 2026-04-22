import { createClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { analyzeLossAttribution } from '@/lib/services/lossAttributionService';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
    try {
        const { lead_id, finish_type, vehicle_details, loss_reason, consultant_name, consultant_id } = await req.json();

        if (!lead_id || !finish_type) {
            return NextResponse.json({ error: 'lead_id e finish_type são obrigatórios' }, { status: 400 });
        }

        const admin = createClient();
        const cleanId = lead_id.toString().replace(/^(main_|crm26_|dist_|lead_|crm25_|master_)/, '');
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(cleanId);
        const cleanConsId = (consultant_id || '').toString().replace(/^(main_|crm26_|dist_|lead_|crm25_|master_)/, '') || null;
        const now = new Date().toISOString();

        const newStatus = finish_type === 'perda' ? 'perdido' : 'vendido';

        const notePrefix = finish_type === 'perda'
            ? '🚫 ENCERRADO COMO PERDA'
            : finish_type === 'compra'
            ? '🔄 COMPRA / TROCA REGISTRADA'
            : '🏆 VENDA REALIZADA';
        const noteDetail = finish_type === 'perda'
            ? (loss_reason || 'Motivo não informado')
            : (vehicle_details || 'Veículo não informado');

        // ── 0. Snapshot ANTES de mudar status (perda apenas) ──
        // Captura o score IA e telefone no momento da perda. Sem isso,
        // não conseguimos auditar depois "lead bom perdido por vendedor ruim".
        let scoreAtLoss: number | null = null;
        let leadPhone: string | null = null;
        if (finish_type === 'perda' && isUUID) {
            const { data: snapshot } = await admin
                .from('leads_manos_crm')
                .select('ai_score, phone')
                .eq('id', cleanId)
                .maybeSingle();
            scoreAtLoss = Number(snapshot?.ai_score) || 0;
            leadPhone = snapshot?.phone || null;
        }

        // ── 1. Atualizar status (e ai_score_at_loss, se perda) ──
        const updatePayload: Record<string, any> = { status: newStatus, updated_at: now };
        if (scoreAtLoss !== null) updatePayload.ai_score_at_loss = scoreAtLoss;
        
        if (finish_type === 'perda') {
            updatePayload.lost_at = now;
            updatePayload.motivo_perda = loss_reason || 'Não informado';
        } else {
            updatePayload.won_at = now;
        }

        const { error: statusError } = await admin
            .from('leads_manos_crm')
            .update(updatePayload)
            .eq('id', cleanId);

        if (statusError) {
            console.error('[finish] Erro ao atualizar status:', statusError);
            return NextResponse.json({ error: statusError.message }, { status: 500 });
        }

        // ── 2. Timeline ──
        await admin.from('interactions_manos_crm').insert({
            [isUUID ? 'lead_id' : 'lead_id_v1']: cleanId,
            type: finish_type === 'perda' ? 'loss' : 'sale',
            notes: `${notePrefix}: ${noteDetail}`,
            consultant_id: cleanConsId,
            user_name: consultant_name || 'Sistema',
            created_at: now,
        });

        // ── 3. Sale (apenas venda real) ──
        if (finish_type === 'venda' && vehicle_details) {
            const salePayload = {
                lead_id: cleanId,
                consultant_id: cleanConsId,
                sale_date: now,
                created_at: now,
                vehicle_name: vehicle_details,
                consultant_name: consultant_name || 'Equipe',
                sale_value: 0,
            };
            await Promise.allSettled([
                admin.from('sales').insert([salePayload]),
                admin.from('sales_manos_crm').insert([salePayload]),
            ]);
        }

        // ── 4. Pipeline de análise da PERDA (fire-and-forget) ──
        // Roda em paralelo:
        //   a) Classifica motivo (preço/concorrente/sem_resposta/etc) — já existia
        //   b) Atribui culpa (client_disengaged | consultant_abandoned | external_factor)
        //      lendo o histórico WhatsApp via lossAttributionService
        if (finish_type === 'perda' && loss_reason) {
            classifyLossReasonAsync(cleanId, loss_reason, admin).catch(
                (e) => console.error('[finish] classifyLoss falhou:', e)
            );
        }

        if (finish_type === 'perda' && isUUID && leadPhone) {
            analyzeLossAttribution(cleanId, leadPhone, loss_reason || '')
                .then(async (result) => {
                    // Audit trail: registra análise na timeline com flag visual
                    const flag = result.loss_attribution === 'consultant_abandoned' ? '⚠️' : '✅';
                    await admin.from('interactions_manos_crm').insert({
                        [isUUID ? 'lead_id' : 'lead_id_v1']: cleanId,
                        type: 'loss_audit',
                        notes: `${flag} AUDITORIA IA: ${result.loss_attribution} (proatividade vendedor: ${result.consultant_response_score}/100) — ${result.loss_attribution_reason}`,
                        consultant_id: cleanConsId,
                        user_name: 'IA Auditor',
                        created_at: new Date().toISOString(),
                    });
                })
                .catch((e) => console.error('[finish] lossAttribution falhou:', e?.message));
        }

        return NextResponse.json({
            success: true,
            status: newStatus,
            ai_score_at_loss: scoreAtLoss,
        });
    } catch (err: any) {
        console.error('[finish-lead CRM]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// Classifica o motivo de perda com GPT-4o mini e salva em loss_category
async function classifyLossReasonAsync(leadId: string, reason: string, admin: ReturnType<typeof createClient>) {
    const { OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const res = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
            role: 'user',
            content: `Classifique o motivo de perda de venda de veículo em EXATAMENTE UMA das categorias:\npreco | concorrente | sem_interesse | sem_resposta | credito_negado | outro\n\nMotivo informado: "${reason}"\n\nResponda APENAS com a categoria, nada mais.`,
        }],
        max_tokens: 10,
        temperature: 0,
    });

    const raw = res.choices[0]?.message?.content?.trim().toLowerCase() || 'outro';
    const valid = ['preco', 'concorrente', 'sem_interesse', 'sem_resposta', 'credito_negado', 'outro'];
    const category = valid.includes(raw) ? raw : 'outro';

    await admin
        .from('leads_manos_crm')
        .update({ loss_category: category })
        .eq('id', leadId)
        .then(
            () => console.log(`[finish] loss_category=${category} para lead ${leadId}`),
            (e: any) => console.warn('[finish] loss_category não salvo:', e?.message)
        );
}
