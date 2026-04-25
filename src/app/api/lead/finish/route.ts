import { createClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

type LeadTable = 'leads_manos_crm' | 'leads_compra' | 'leads_distribuicao_crm_26' | 'leads_master';

interface TableSchema {
    statusSold: string;
    statusLost: string;
    updatedAtCol: string;
    wonAtCol: string | null;
    lostAtCol: string | null;
    lossReasonCol: string | null;
}

const SCHEMA: Record<LeadTable, TableSchema> = {
    leads_manos_crm: {
        statusSold: 'vendido', statusLost: 'perdido',
        updatedAtCol: 'updated_at', wonAtCol: 'won_at',
        lostAtCol: 'lost_at', lossReasonCol: 'motivo_perda',
    },
    leads_compra: {
        statusSold: 'comprado', statusLost: 'perdido',
        updatedAtCol: 'atualizado_em', wonAtCol: null,
        lostAtCol: null, lossReasonCol: 'motivo_perda',
    },
    leads_distribuicao_crm_26: {
        statusSold: 'vendido', statusLost: 'perdido',
        updatedAtCol: 'atualizado_em', wonAtCol: null,
        lostAtCol: null, lossReasonCol: null,
    },
    leads_master: {
        statusSold: 'vendido', statusLost: 'perdido',
        updatedAtCol: 'updated_at', wonAtCol: 'won_at',
        lostAtCol: 'lost_at', lossReasonCol: 'motivo_perda',
    },
};

const VALID_TABLES = new Set<LeadTable>(['leads_manos_crm', 'leads_compra', 'leads_distribuicao_crm_26', 'leads_master']);

export async function POST(req: NextRequest) {
    try {
        const { lead_id, lead_table, finish_type, vehicle_details, loss_reason, consultant_name, consultant_id } = await req.json();

        if (!lead_id || !finish_type) {
            return NextResponse.json({ error: 'lead_id e finish_type são obrigatórios' }, { status: 400 });
        }

        const table: LeadTable = VALID_TABLES.has(lead_table) ? lead_table : 'leads_manos_crm';
        const schema = SCHEMA[table];

        const admin = createClient();
        const cleanId = lead_id.toString().replace(/^(main_|crm26_|dist_|lead_|crm25_|master_|compra_)/, '');
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(cleanId);
        const cleanConsId = (consultant_id || '').toString().replace(/^(main_|crm26_|dist_|lead_|crm25_|master_)/, '') || null;
        const now = new Date().toISOString();

        const newStatus = finish_type === 'perda' ? schema.statusLost : schema.statusSold;

        const notePrefix = finish_type === 'perda'
            ? '🚫 ENCERRADO COMO PERDA'
            : finish_type === 'compra'
            ? '🔄 COMPRA / TROCA REGISTRADA'
            : '🏆 VENDA REALIZADA';
        const noteDetail = finish_type === 'perda'
            ? (loss_reason || 'Motivo não informado')
            : (vehicle_details || 'Veículo não informado');

        // Snapshot pré-update (perda apenas — leads_manos_crm)
        let scoreAtLoss: number | null = null;
        if (finish_type === 'perda' && table === 'leads_manos_crm' && isUUID) {
            const { data: snapshot } = await admin
                .from('leads_manos_crm')
                .select('ai_score')
                .eq('id', cleanId)
                .maybeSingle();
            scoreAtLoss = Number(snapshot?.ai_score) || 0;
        }

        const updatePayload: Record<string, any> = {
            status: newStatus,
            [schema.updatedAtCol]: now,
        };
        if (scoreAtLoss !== null && table === 'leads_manos_crm') {
            updatePayload.ai_score_at_loss = scoreAtLoss;
        }
        if (finish_type === 'perda') {
            if (schema.lostAtCol) updatePayload[schema.lostAtCol] = now;
            if (schema.lossReasonCol) updatePayload[schema.lossReasonCol] = loss_reason || 'Não informado';
        } else if (schema.wonAtCol) {
            updatePayload[schema.wonAtCol] = now;
        }

        const { error: statusError } = await admin
            .from(table)
            .update(updatePayload)
            .eq('id', cleanId);

        if (statusError) {
            console.error(`[finish] Erro ao atualizar status em ${table}:`, statusError);
            return NextResponse.json({ error: statusError.message }, { status: 500 });
        }

        // Timeline (sempre interactions_manos_crm — única tabela de timeline)
        await admin.from('interactions_manos_crm').insert({
            [isUUID ? 'lead_id' : 'lead_id_v1']: cleanId,
            type: finish_type === 'perda' ? 'loss' : 'sale',
            notes: `${notePrefix}: ${noteDetail}`,
            consultant_id: cleanConsId,
            user_name: consultant_name || 'Sistema',
            created_at: now,
        });

        // Registro de venda (apenas venda real)
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

        // Classifica motivo de perda em background (apenas leads_manos_crm tem loss_category)
        if (finish_type === 'perda' && loss_reason && table === 'leads_manos_crm') {
            classifyLossReasonAsync(cleanId, loss_reason, admin).catch(
                (e) => console.error('[finish] classifyLoss falhou:', e)
            );
        }

        return NextResponse.json({
            success: true,
            status: newStatus,
            table,
            ai_score_at_loss: scoreAtLoss,
        });
    } catch (err: any) {
        console.error('[finish-lead CRM]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

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
        .eq('id', leadId);
}
