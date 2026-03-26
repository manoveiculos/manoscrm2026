import { createClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';

export const maxDuration = 30;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * GET /api/ai/daily-brief?consultantId=X&name=X
 * Gera um briefing matinal personalizado para o consultor.
 * Chamado 1x por sessão pelo Pipeline (client-side sessionStorage como cache).
 *
 * Retorna:
 * { saudacao, resumo, prioridades[], aviso, stats }
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const consultantId = searchParams.get('consultantId');
        const name = searchParams.get('name') || 'Consultor';

        const admin = createClient();

        // Busca leads ativos (máx 30 para contexto)
        let query = admin
            .from('leads_manos_crm')
            .select('id, name, ai_score, ai_classification, status, vehicle_interest, updated_at, created_at, proxima_acao, next_step')
            .not('status', 'in', '("vendido","perdido","lost","comprado","lixo","duplicado","desqualificado")')
            .order('ai_score', { ascending: false })
            .limit(30);

        if (consultantId) {
            query = query.eq('assigned_consultant_id', consultantId);
        }

        const { data: leads } = await query;

        if (!leads?.length) {
            return NextResponse.json({
                saudacao: `Bom dia, ${name}!`,
                resumo: 'Nenhum lead ativo no momento. Bora trazer novos alvos!',
                prioridades: [],
                aviso: null,
                stats: { total: 0, hot: 0, slaBreached: 0 },
            });
        }

        const now = Date.now();
        const hotLeads = leads.filter(l => (Number(l.ai_score) || 0) >= 70);
        const slaBreached = leads.filter(l => {
            const h = (now - new Date(l.updated_at || l.created_at).getTime()) / 3_600_000;
            return h > 24;
        });
        const top3 = leads.slice(0, 3);

        const leadsCtx = top3
            .map(l => {
                const script = (l.proxima_acao || l.next_step || '').slice(0, 80);
                return `• ${l.name} — ${l.ai_score || 0}% — ${l.status} — ${l.vehicle_interest || '?'}${script ? ` — "${script}"` : ''}`;
            })
            .join('\n');

        const res = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{
                role: 'user',
                content: `Briefing matinal Manos Veículos para ${name}:\n- Leads ativos: ${leads.length}\n- Quentes (≥70%): ${hotLeads.length}\n- Sem contato há +24h: ${slaBreached.length}\n- Top 3:\n${leadsCtx}\n\nJSON (sem markdown): { "saudacao": "1 frase curta de bom dia + 1 dado impactante", "resumo": "1 frase estratégica do dia", "prioridades": ["Nome — ação exata"] (máx 3, só leads quentes ou com SLA vencido), "aviso": "1 alerta urgente ou null" }`,
            }],
            response_format: { type: 'json_object' },
            temperature: 0.4,
            max_tokens: 300,
        });

        const result = JSON.parse(res.choices[0]?.message?.content || '{}');

        return NextResponse.json({
            saudacao: result.saudacao || `Bom dia, ${name}!`,
            resumo: result.resumo || '',
            prioridades: Array.isArray(result.prioridades) ? result.prioridades.slice(0, 3) : [],
            aviso: result.aviso || null,
            stats: { total: leads.length, hot: hotLeads.length, slaBreached: slaBreached.length },
        });
    } catch (err: any) {
        console.error('[daily-brief]', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
