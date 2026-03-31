import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';
import { OpenAI } from 'openai';

export const maxDuration = 30;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * POST /api/lead/pre-visit-brief
 * Gera briefing tático pré-visita para o consultor.
 * Disparado quando lead entra em status "scheduled"/"agendado"/"ataque".
 * Cria alerta tipo 'pre_visit_brief' no Cowork IA (dedup: 1 por lead por dia).
 *
 * Body: { leadId: string }
 */
export async function POST(req: NextRequest) {
    try {
        const { leadId } = await req.json();
        if (!leadId) {
            return NextResponse.json({ error: 'leadId obrigatório' }, { status: 400 });
        }

        const admin = createClient();

        // Dedup: não gera se já existe briefing pré-visita hoje para este lead
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const { data: existing } = await admin
            .from('cowork_alerts')
            .select('id')
            .eq('type', 'pre_visit_brief')
            .eq('is_active', true)
            .filter('metadata->>lead_id', 'eq', leadId)
            .gte('created_at', todayStart.toISOString())
            .maybeSingle();

        if (existing) {
            return NextResponse.json({ skipped: true, reason: 'Briefing já gerado hoje para este lead' });
        }

        // Busca dados completos do lead + últimas interações
        const [leadRes, interactionsRes] = await Promise.all([
            admin
                .from('leads_manos_crm')
                .select('id, name, nome, status, vehicle_interest, interesse, ai_score, ai_classification, ai_summary, behavioral_profile, valor_investimento, carro_troca, origem, source, next_step, proxima_acao, scheduled_at, assigned_consultant_id')
                .eq('id', leadId)
                .single(),
            admin
                .from('interactions_manos_crm')
                .select('notes, type, created_at')
                .eq('lead_id', leadId)
                .order('created_at', { ascending: false })
                .limit(5),
        ]);

        if (!leadRes.data) {
            return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });
        }

        const lead = leadRes.data;
        const recentInteractions = (interactionsRes.data || [])
            .map(i => `[${i.type}] ${i.notes?.slice(0, 100)}`)
            .join('\n');

        const leadName    = lead.name || lead.nome || 'Cliente';
        const vehicle     = lead.vehicle_interest || lead.interesse || 'não informado';
        const profile     = lead.behavioral_profile as any;
        const sentiment   = profile?.sentiment || 'não analisado';
        const urgency     = profile?.urgency || 'não analisada';
        const intentions  = Array.isArray(profile?.intentions) ? (profile.intentions as string[]).join(', ') : 'não mapeadas';
        const scheduledAt = lead.scheduled_at
            ? new Date(lead.scheduled_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
            : 'não definido';

        const res = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.25,
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content: 'Você é o coach de vendas da Manos Veículos. Gere briefings táticos pré-visita para consultores de concessionária. Seja direto, acionável e específico. Retorne APENAS JSON válido.',
                },
                {
                    role: 'user',
                    content: `Consultor vai atender AGORA. Prepare o briefing tático.

LEAD: ${leadName}
Veículo de interesse: ${vehicle}
Investimento estimado: ${lead.valor_investimento || 'não informado'}
Possui troca: ${lead.carro_troca || 'não'}
Origem: ${lead.origem || lead.source || 'não informada'}
Agendamento: ${scheduledAt}

PERFIL COMPORTAMENTAL:
- Sentimento: ${sentiment}
- Urgência: ${urgency}
- Intenções detectadas: ${intentions}
- Score IA: ${lead.ai_score}% (${lead.ai_classification || 'warm'})

CONTEXTO DA NEGOCIAÇÃO:
${lead.ai_summary || 'Sem análise prévia'}

ÚLTIMAS INTERAÇÕES:
${recentInteractions || 'Sem interações registradas'}

PRÓXIMA AÇÃO SUGERIDA PELA IA:
${lead.next_step || lead.proxima_acao || 'não definida'}

Retorne JSON:
{
  "abertura": "Frase de abertura ideal para este cliente (1 frase, pelo primeiro nome, sem 'tudo bem?')",
  "objecao_provavel": "Principal objeção esperada baseada no perfil",
  "argumento_chave": "O argumento mais forte para este cliente específico",
  "alerta": "Ponto de atenção crítico (ou null se não houver)"
}`,
                },
            ],
            max_tokens: 300,
        }, { timeout: 20000 });

        const parsed = JSON.parse(res.choices[0]?.message?.content || '{}');

        const abertura        = String(parsed.abertura || '').slice(0, 200);
        const objecao         = String(parsed.objecao_provavel || '').slice(0, 200);
        const argumento       = String(parsed.argumento_chave || '').slice(0, 200);
        const alerta          = parsed.alerta ? String(parsed.alerta).slice(0, 150) : null;

        if (!abertura) {
            return NextResponse.json({ error: 'IA retornou vazio' }, { status: 500 });
        }

        const message = [
            `🎯 Abertura: ${abertura}`,
            `💬 Objeção esperada: ${objecao}`,
            `⚡ Argumento-chave: ${argumento}`,
            alerta ? `⚠️ Atenção: ${alerta}` : null,
        ].filter(Boolean).join('\n\n');

        const priority = (lead.ai_score || 0) >= 70 || lead.ai_classification === 'hot' ? 1 : 2;

        await admin.from('cowork_alerts').insert({
            type: 'pre_visit_brief',
            title: `Briefing pré-visita — ${leadName}`,
            message,
            priority,
            target_consultant_id: lead.assigned_consultant_id,
            is_active: true,
            metadata: {
                lead_id: leadId,
                vehicle,
                scheduled_at: lead.scheduled_at,
                ai_score: lead.ai_score,
            },
        });

        return NextResponse.json({
            success: true,
            brief: { abertura, objecao_provavel: objecao, argumento_chave: argumento, alerta },
        });

    } catch (err: any) {
        console.error('[pre-visit-brief]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
