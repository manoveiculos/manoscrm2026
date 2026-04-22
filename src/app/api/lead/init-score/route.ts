import { createClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
import { getAIContext } from '@/lib/services/aiFeedbackService';
import { notifyLeadArrival } from '@/lib/services/vendorNotifyService';

export const maxDuration = 60; // Elevado para 60s (Auditoria Forense)

// Verificação de ambiente no boot
if (!process.env.OPENAI_API_KEY) {
    console.error('[init-score] CRÍTICO: OPENAI_API_KEY não configurada nas variáveis de ambiente.');
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy' });

/**
 * POST /api/lead/init-score
 * Análise inicial leve (GPT-4o mini) para leads recém-criados.
 */
export async function POST(req: NextRequest) {
    // Etapa 3-a: Guard
    if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json({ 
            error: 'Serviço de IA indisponível (chave ausente). Informe ao administrador.' 
        }, { status: 500 });
    }

    let leadIdForCatch: string | null = null;

    try {
        const body = await req.json();
        const { leadId } = body;
        leadIdForCatch = leadId;

        if (!leadId) return NextResponse.json({ error: 'leadId é obrigatório' }, { status: 400 });

        const admin = createClient();
        const cleanId = leadId.toString().replace(/^(main_|crm26_|dist_|lead_|crm25_|master_)/, '');

        // Tenta buscar em leads_manos_crm (padrão)
        let { data: lead } = await admin
            .from('leads_manos_crm')
            .select('id, name, vehicle_interest, source, origem, valor_investimento, carro_troca, status')
            .eq('id', cleanId)
            .maybeSingle();

        let tableName = 'leads_manos_crm';

        // Se não encontrar, tenta em leads_compra (webhook novo)
        if (!lead) {
            const { data: leadCompra } = await admin
                .from('leads_compra')
                .select('id, nome, veiculo_original, origem')
                .eq('id', cleanId)
                .maybeSingle();
            
            if (leadCompra) {
                lead = {
                    id: leadCompra.id,
                    name: leadCompra.nome,
                    vehicle_interest: leadCompra.veiculo_original,
                    source: leadCompra.origem,
                    status: 'received'
                } as any;
                tableName = 'leads_compra';
            }
        }

        if (!lead) return NextResponse.json({ error: 'Lead não encontrado em nenhuma vertical' }, { status: 404 });

        const feedbackContext = await getAIContext(cleanId).catch(() => '');

        const res = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{
                role: 'system',
                content: 'Você é um analista comercial da Manos Veículos (concessionária multimarcas, Tijucas/SC). Classifique o lead e crie o script de primeiro contato. Retorne APENAS JSON válido.' + feedbackContext,
            }, {
                role: 'user',
                content: `Lead:\n- Nome: ${lead.name || 'Desconhecido'}\n- Interesse: ${lead.vehicle_interest || 'Não informado'}\n- Origem: ${lead.source || lead.origem || 'Desconhecida'}\n- Investimento: ${lead.valor_investimento || 'Não informado'}\n- Troca: ${lead.carro_troca || 'Sem troca'}\n\nJSON esperado:\n{\n  "ai_score": 0-99,\n  "ai_classification": "hot"|"warm"|"cold",\n  "vehicle_interest_normalized": "Marca Modelo Ano (ou vazio se nao informado)",\n  "proxima_acao": "Script EXATO de 1-2 frases para WhatsApp. Sem listas. Sem gerundismo. Comece pelo nome do lead.",\n  "diagnostico": "1 linha sobre o perfil do lead"\n}`,
            }],
            response_format: { type: 'json_object' },
            temperature: 0.3,
            max_tokens: 250,
        });

        const result = JSON.parse(res.choices[0]?.message?.content || '{}');

        const updatePayload: Record<string, any> = {
            ai_score: Math.min(99, Math.max(1, Number(result.ai_score) || 40)),
            ai_classification: ['hot', 'warm', 'cold'].includes(result.ai_classification) ? result.ai_classification : 'warm',
            ai_reason: result.diagnostico || '',
            next_step: result.proxima_acao || '',
            proxima_acao: result.proxima_acao || '',
            ai_pending: false // Limpa flag de erro se houver
        };

        const normalized = (result.vehicle_interest_normalized || '').trim();
        if (normalized.length > 3 && normalized.toLowerCase() !== 'vazio') {
            if (tableName === 'leads_manos_crm') updatePayload.vehicle_interest = normalized;
            else updatePayload.veiculo_original = normalized;
        }

        await admin.from(tableName).update(updatePayload).eq('id', cleanId);

        // Indexar embedding em background
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
        fetch(`${siteUrl}/api/ai/embed-lead`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lead_id: cleanId }),
        }).catch(() => {});

        // 8. Auto-atribuição (Round-Robin) se não tiver consultor
        // Buscamos o lead atualizado para checar se já tem consultor
        const { data: currentLead } = await admin
            .from(tableName)
            .select('assigned_consultant_id')
            .eq('id', cleanId)
            .maybeSingle();

        if (!currentLead?.assigned_consultant_id) {
            try {
                const { assignNextConsultant } = await import('@/lib/services/autoAssignService');
                await assignNextConsultant(cleanId, tableName as any);
            } catch (assignErr) {
                console.warn('[init-score] auto-assignment failed:', assignErr);
            }
        }

        // 9. Notificar vendedor
        notifyLeadArrival(cleanId).catch(e =>
            console.warn('[init-score] vendor notify failed:', e?.message)
        );

        return NextResponse.json({ success: true, leadId: cleanId, ...updatePayload });

    } catch (err: any) {
        console.error('[init-score] Erro crítico:', err);
        
        // Etapa 3-b: Marcar como ai_pending para evitar lead órfão
        if (leadIdForCatch) {
            try {
                const admin = createClient();
                const cleanId = leadIdForCatch.toString().replace(/^(main_|crm26_|dist_|lead_|crm25_|master_)/, '');
                // Tenta marcar em ambas as tabelas (o que existir, atualiza)
                await admin.from('leads_manos_crm').update({ ai_pending: true }).eq('id', cleanId);
                await admin.from('leads_compra').update({ ai_pending: true }).eq('id', cleanId);
            } catch (updateErr) {
                console.error('[init-score] Falha ao marcar ai_pending:', updateErr);
            }
        }

        return NextResponse.json({ 
            error: err.message, 
            leadId: leadIdForCatch,
            details: 'Análise de IA falhou. O lead foi marcado para reprocessamento manual/automático (ai_pending).' 
        }, { status: 500 });
    }
}
