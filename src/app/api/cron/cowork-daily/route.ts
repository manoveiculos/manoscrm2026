import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import OpenAI from 'openai';

// ─── Clients ────────────────────────────────────────────────────────────────
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const maxDuration = 120;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function hoursAgo(h: number) {
    return new Date(Date.now() - h * 3_600_000).toISOString();
}

async function insertAlert(payload: {
    title: string;
    message: string;
    type: string;
    priority: number;
    target_consultant_id: string | null;
}) {
    await supabase.from('cowork_alerts').insert({ ...payload, is_active: true });
}

// ─── Main cron handler ───────────────────────────────────────────────────────
/**
 * GET /api/cron/cowork-daily
 * Agendado para rodar todo dia às 08:00 (Brasil) via Vercel Cron.
 * Analisa performance de cada consultor e gera alertas automáticos no Cowork IA.
 */
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (
        process.env.NODE_ENV === 'production' &&
        authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    const log: string[] = [];
    const alertsCreated: number[] = [];

    try {
        // ── 1. Busca consultores ativos ─────────────────────────────────────
        const { data: consultants, error: consErr } = await supabase
            .from('consultants_manos_crm')
            .select('id, name, role')
            .eq('is_active', true)
            .eq('role', 'consultant');

        if (consErr) throw consErr;
        if (!consultants?.length) {
            return NextResponse.json({ success: true, message: 'Nenhum consultor ativo.' });
        }

        // ── 2. Busca dados globais do dia ───────────────────────────────────
        const { data: todayLeads } = await supabase
            .from('leads_manos_crm')
            .select('id, name, status, assigned_consultant_id, created_at, updated_at, first_contact_at, response_time_seconds, vehicle_interest')
            .gte('created_at', hoursAgo(24))
            .not('status', 'in', '("lost","comprado","lixo","duplicado")');

        const { data: uncontacted } = await supabase
            .from('leads_manos_crm')
            .select('id, name, status, assigned_consultant_id, created_at')
            .in('status', ['new', 'received', 'entrada'])
            .lt('created_at', hoursAgo(4))
            .not('status', 'in', '("lost","comprado","lixo","duplicado")');

        const { data: stuckLeads } = await supabase
            .from('leads_manos_crm')
            .select('id, name, status, assigned_consultant_id, updated_at')
            .in('status', ['contacted', 'attempt', 'confirmed'])
            .lt('updated_at', hoursAgo(48));

        const { data: closedToday } = await supabase
            .from('leads_manos_crm')
            .select('id, assigned_consultant_id, name')
            .in('status', ['closed', 'comprado'])
            .gte('updated_at', hoursAgo(24));

        // ── 3. Analisa cada consultor individualmente ───────────────────────
        const consultantStats: Array<{
            id: string; name: string;
            myUncontacted: number; myStuck: number;
            mySales: number; myLeadsToday: number;
            avgResponseSec: number;
        }> = [];

        for (const cons of consultants) {
            const myUncontacted = (uncontacted || []).filter(l => l.assigned_consultant_id === cons.id);
            const myStuck       = (stuckLeads  || []).filter(l => l.assigned_consultant_id === cons.id);
            const mySales       = (closedToday || []).filter(l => l.assigned_consultant_id === cons.id);
            const myToday       = (todayLeads  || []).filter(l => l.assigned_consultant_id === cons.id);

            const responseTimes = myToday
                .map(l => l.response_time_seconds)
                .filter(Boolean) as number[];
            const avgResponse = responseTimes.length
                ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
                : 0;

            const stats = {
                id: cons.id,
                name: cons.name,
                myUncontacted: myUncontacted.length,
                myStuck:       myStuck.length,
                mySales:       mySales.length,
                myLeadsToday:  myToday.length,
                avgResponseSec: Math.round(avgResponse),
            };
            consultantStats.push(stats);

            // Não gera alerta se tudo ok
            const needsAlert = stats.myUncontacted >= 2 || stats.myStuck >= 3;
            if (!needsAlert) {
                log.push(`✅ ${cons.name} — sem alertas necessários`);
                continue;
            }

            // ── GPT-4o gera mensagem personalizada ─────────────────────────
            try {
                const prompt = `
Você é o assistente de performance da Manos Veículos, uma concessionária de carros.
Gere um aviso direto e motivador para o consultor de vendas chamado "${cons.name}".

DADOS DO CONSULTOR HOJE:
- Leads sem contato inicial (> 4h): ${stats.myUncontacted}
- Leads parados sem atualização (> 48h): ${stats.myStuck}
- Vendas fechadas hoje: ${stats.mySales}
- Leads recebidos hoje: ${stats.myLeadsToday}
- Tempo médio de resposta: ${stats.avgResponseSec > 0 ? Math.round(stats.avgResponseSec / 60) + ' min' : 'não calculado'}

REGRAS:
1. Tom: firme, direto, motivador — como um gerente que se importa
2. Mencione os números reais acima
3. Máximo 4 linhas
4. NÃO invente dados além dos fornecidos
5. Finalize com uma ação clara: o que o consultor deve fazer AGORA

Responda SOMENTE no formato JSON:
{ "title": "título curto (máx 8 palavras)", "message": "mensagem do aviso", "priority": 1|2|3 }
`;

                const completion = await openai.chat.completions.create({
                    model: 'gpt-4o-mini',
                    temperature: 0.4,
                    max_tokens: 200,
                    response_format: { type: 'json_object' },
                    messages: [{ role: 'user', content: prompt }],
                });

                const parsed = JSON.parse(completion.choices[0].message.content || '{}');
                if (parsed.title && parsed.message) {
                    await insertAlert({
                        title: parsed.title,
                        message: parsed.message,
                        type: 'performance',
                        priority: Math.min(3, Math.max(1, Number(parsed.priority) || 2)),
                        target_consultant_id: cons.id,
                    });
                    alertsCreated.push(1);
                    log.push(`🚨 Alerta criado para ${cons.name}: "${parsed.title}"`);
                }
            } catch (aiErr: any) {
                log.push(`⚠️ GPT falhou para ${cons.name}: ${aiErr.message}`);
                // Fallback sem IA
                if (stats.myUncontacted >= 2) {
                    await insertAlert({
                        title: `${stats.myUncontacted} leads aguardando seu contato`,
                        message: `${cons.name}, você tem ${stats.myUncontacted} lead(s) sem contato inicial há mais de 4 horas. Cada minuto reduz a chance de conversão. Abra o CRM e entre em contato agora.`,
                        type: 'performance',
                        priority: stats.myUncontacted >= 5 ? 1 : 2,
                        target_consultant_id: cons.id,
                    });
                    alertsCreated.push(1);
                }
            }
        }

        // ── 4. Relatório diário para o admin ───────────────────────────────
        const totalUncontacted = (uncontacted || []).length;
        const totalSales       = (closedToday || []).length;
        const topSeller        = consultantStats.sort((a, b) => b.mySales - a.mySales)[0];
        const worstResponser   = consultantStats.sort((a, b) => b.avgResponseSec - a.avgResponseSec)[0];

        const adminPrompt = `
Você é o assistente de BI da Manos Veículos.
Gere um relatório executivo diário para o GERENTE com base nos dados abaixo.

DADOS DO DIA:
- Leads recebidos hoje: ${(todayLeads || []).length}
- Leads sem contato (> 4h): ${totalUncontacted}
- Leads parados > 48h: ${(stuckLeads || []).length}
- Vendas fechadas hoje: ${totalSales}
- Consultor destaque: ${topSeller?.name || 'N/A'} (${topSeller?.mySales || 0} vendas)
- Consultor com pior tempo de resposta: ${worstResponser?.name || 'N/A'}
- Alertas gerados automaticamente: ${alertsCreated.length}

RANKING DE CONSULTORES:
${consultantStats.map(c => `  - ${c.name}: ${c.mySales} vendas | ${c.myUncontacted} sem contato | ${c.myStuck} parados`).join('\n')}

REGRAS:
1. Tom: executivo, objetivo, com dados
2. Destaque oportunidades e riscos
3. Máximo 8 linhas
4. NÃO invente dados

Responda SOMENTE em JSON:
{ "title": "Relatório Diário — [data]", "message": "relatório completo" }
`;

        try {
            const adminCompletion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                temperature: 0.2,
                max_tokens: 400,
                response_format: { type: 'json_object' },
                messages: [{ role: 'user', content: adminPrompt }],
            });

            const adminParsed = JSON.parse(adminCompletion.choices[0].message.content || '{}');
            if (adminParsed.title && adminParsed.message) {
                await supabase.from('cowork_reports').insert({
                    type: 'daily_briefing',
                    title: adminParsed.title,
                    content: adminParsed.message,
                    metadata: {
                        total_leads_today: (todayLeads || []).length,
                        total_uncontacted: totalUncontacted,
                        total_sales: totalSales,
                        alerts_generated: alertsCreated.length,
                        consultant_stats: consultantStats,
                    },
                });
                log.push(`📊 Relatório diário salvo para o admin`);
            }
        } catch (adminErr: any) {
            log.push(`⚠️ Relatório admin falhou: ${adminErr.message}`);
        }

        return NextResponse.json({
            success: true,
            alerts_created: alertsCreated.length,
            consultants_analyzed: consultants.length,
            log,
        });

    } catch (err: any) {
        console.error('[Cowork Daily]', err);
        return NextResponse.json({ success: false, error: err.message, log }, { status: 500 });
    }
}
