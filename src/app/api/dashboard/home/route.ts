import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient();

// Camila tem cockpit de cobrança próprio — não entra no War Room de vendas.
const CAMILA_EMAILS = new Set(['camila.renatta@hotmail.com', 'camilarenatta@hotmail.com']);
const LOST = ['perdido', 'lost', 'lost_by_inactivity'];
const H8_MS = 8 * 3600_000;

// Início do dia em horário de Brasília (UTC-3), expresso em UTC ISO.
function startOfTodayBRT(): string {
    const now = new Date();
    const brt = new Date(now.getTime() - 3 * 3600_000);
    return new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 3, 0, 0)).toISOString();
}

const firstName = (s?: string | null) => (s || 'Lead').trim().split(/\s+/)[0];

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const authId = searchParams.get('authId');
        const startToday = startOfTodayBRT();
        const now = Date.now();

        // ── Identidade + papel (autoritativo pelo banco, não pelo cliente) ──
        let me: any = null;
        if (authId) {
            const { data } = await supabaseAdmin
                .from('consultants_manos_crm')
                .select('id, name, role, email')
                .eq('auth_id', authId)
                .maybeSingle();
            me = data;
        }
        const isAdmin = me?.role === 'admin';
        const view: 'gerencia' | 'consultor' = isAdmin ? 'gerencia' : 'consultor';

        // ── Dados base em paralelo ──
        const dobras48 = new Date(now - 48 * 3600_000).toISOString();
        const [consRes, activeRes, wonRes, lostRes, settingsRes, staleRes] = await Promise.all([
            supabaseAdmin.from('consultants_manos_crm').select('id, name, role, email, is_active').eq('is_active', true),
            supabaseAdmin.from('leads_unified_active').select(
                'uid, name, vehicle_interest, ai_score, status, assigned_consultant_id, atendimento_iniciado_em, ultima_interacao_humana, first_contact_at, flagged_reversao, created_at'
            ),
            supabaseAdmin.from('leads_unified').select('assigned_consultant_id').eq('status', 'vendido').gte('updated_at', startToday),
            supabaseAdmin.from('leads_unified').select('assigned_consultant_id').in('status', LOST).gte('updated_at', startToday),
            supabaseAdmin.from('system_settings').select('ai_paused').eq('id', 'global').maybeSingle(),
            // Cruft: leads travados em 'received/triagem', nunca atendidos e antigos (>48h) — higiene, não oportunidade quente
            supabaseAdmin.from('leads_unified').select('uid', { count: 'exact', head: true })
                .in('status', ['received', 'triagem', 'novo']).is('atendimento_iniciado_em', null).lt('created_at', dobras48),
        ]);

        const consultants = consRes.data || [];
        const active = activeRes.data || [];
        const wonRows = wonRes.data || [];
        const lostRows = lostRes.data || [];
        const aiPaused = !!settingsRes.data?.ai_paused;
        const capturaAntiga = staleRes.count || 0;

        // Vendedores do chão de loja (exclui Camila/cobrança)
        const vendedores = consultants.filter((c: any) => c.role === 'vendedor' && !CAMILA_EMAILS.has((c.email || '').toLowerCase()));
        const nameById = new Map<string, string>(consultants.map((c: any) => [c.id, c.name]));

        // ── Classificação de cada lead ativo ──
        const isHot = (l: any) => (l.ai_score || 0) >= 80;
        const semResposta = (l: any) => !l.atendimento_iniciado_em; // pego mas nunca iniciado
        const esfriando = (l: any) => l.atendimento_iniciado_em &&
            (!l.ultima_interacao_humana || now - new Date(l.ultima_interacao_humana).getTime() > H8_MS);
        const mexidoHoje = (l: any) => l.ultima_interacao_humana && new Date(l.ultima_interacao_humana).toISOString() >= startToday;

        // ── Agregados de loja ──
        const semDono = active.filter((l) => !l.assigned_consultant_id).length;
        const quentesLoja = active.filter(isHot).length;
        const esfriandoLoja = active.filter((l) => l.assigned_consultant_id && esfriando(l)).length;
        const reversaoRespondeu = active.filter((l) => l.flagged_reversao).length;

        const wonByCons = new Map<string, number>();
        for (const r of wonRows) if (r.assigned_consultant_id) wonByCons.set(r.assigned_consultant_id, (wonByCons.get(r.assigned_consultant_id) || 0) + 1);

        const kpisLoja = {
            ganhos_hoje: wonRows.length,
            perdas_hoje: lostRows.length,
            fila_ativa: active.length,        // leads em atendimento
            esfriando: esfriandoLoja,
            sla_critico: quentesLoja,          // quentes (ai_score >= 80)
            sem_dono: semDono,
        };

        // ── Atividade real recente (48h) — SEM ruído de SLA ──
        const desde48 = new Date(now - 48 * 3600_000).toISOString();
        const [msgsRes, aiRes] = await Promise.all([
            supabaseAdmin.from('whatsapp_messages')
                .select('id, message_text, created_at, direction, leads_manos_crm!lead_id(name), leads_compra!lead_compra_id(nome)')
                .gte('created_at', desde48).order('created_at', { ascending: false }).limit(12),
            supabaseAdmin.from('interactions_manos_crm')
                .select('id, type, created_at').in('type', ['ai_first_contact', 'ai_followup'])
                .gte('created_at', desde48).order('created_at', { ascending: false }).limit(8),
        ]);
        const atividade: any[] = [];
        for (const m of (msgsRes.data || []) as any[]) {
            const nome = firstName(m.leads_manos_crm?.name || m.leads_compra?.nome);
            atividade.push({
                id: `msg-${m.id}`, tipo: m.direction === 'inbound' ? 'mensagem_in' : 'mensagem_out',
                texto: m.direction === 'inbound' ? `${nome} respondeu no WhatsApp` : `Consultor respondeu ${nome}`,
                quem: nome, ts: m.created_at,
            });
        }
        for (const a of (aiRes.data || []) as any[]) {
            atividade.push({
                id: `ai-${a.id}`, tipo: 'ia',
                texto: a.type === 'ai_first_contact' ? 'IA iniciou contato com um lead' : 'IA enviou follow-up',
                quem: 'IA SDR', ts: a.created_at,
            });
        }
        for (const r of wonRows as any[]) {
            atividade.push({ id: `won-${r.assigned_consultant_id || Math.random()}`, tipo: 'venda', texto: `Venda fechada${r.assigned_consultant_id ? ` — ${firstName(nameById.get(r.assigned_consultant_id))}` : ''} 🎉`, quem: 'Venda', ts: startToday });
        }
        atividade.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
        const atividadeTop = atividade.slice(0, 12);

        // ═══════════════════ GERÊNCIA ═══════════════════
        if (view === 'gerencia') {
            const ranking = vendedores.map((c: any) => {
                const meus = active.filter((l) => l.assigned_consultant_id === c.id);
                return {
                    id: c.id, nome: firstName(c.name),
                    fila: meus.length,
                    quentes: meus.filter(isHot).length,
                    sem_resposta: meus.filter(semResposta).length,
                    esfriando: meus.filter(esfriando).length,
                    mexidos_hoje: meus.filter(mexidoHoje).length,
                    vendas_hoje: wonByCons.get(c.id) || 0,
                };
            }).sort((a, b) => b.fila - a.fila);

            const acoes: any[] = [];
            if (semDono > 0) acoes.push({ sev: 'critico', icon: 'inbox', titulo: `${semDono} leads sem dono na fila`, detalhe: 'Ninguém está atendendo. Distribua ou mande alguém pescar agora.', cta: { label: 'Abrir Inbox', href: '/inbox' } });
            for (const r of ranking) {
                const probs: string[] = [];
                if (r.quentes > 0 && r.sem_resposta > 0) probs.push(`${Math.min(r.quentes, r.sem_resposta)} quente(s) sem 1ª resposta`);
                else if (r.sem_resposta > 0) probs.push(`${r.sem_resposta} sem 1ª resposta`);
                if (r.esfriando > 0) probs.push(`${r.esfriando} esfriando +8h`);
                if (r.fila >= 8 && r.mexidos_hoje === 0) probs.push(`${r.fila} na fila, 0 mexidos hoje`);
                if (probs.length) acoes.push({ sev: r.quentes > 0 || r.mexidos_hoje === 0 ? 'aviso' : 'info', icon: 'user', titulo: `${r.nome}: ${probs.join(' · ')}`, detalhe: 'Cobrar no grupo pra não esfriar.' });
            }
            if (reversaoRespondeu > 0) acoes.push({ sev: 'aviso', icon: 'flame', titulo: `${reversaoRespondeu} cliente(s) responderam à reversão`, detalhe: 'Lead quente de volta — retomar antes que esfrie.' });
            if (kpisLoja.perdas_hoje > 0) acoes.push({ sev: 'info', icon: 'x', titulo: `${kpisLoja.perdas_hoje} perdido(s) hoje`, detalhe: 'Revisar motivos — a Karol tenta reverter automático.' });
            if (capturaAntiga >= 10) acoes.push({ sev: 'info', icon: 'inbox', titulo: `${capturaAntiga} leads antigos travados sem atendimento`, detalhe: 'Parados há +48h em "received", nunca atendidos. Arquivar ou reprocessar pra limpar a base.' });
            if (acoes.length === 0) acoes.push({ sev: 'ok', icon: 'check', titulo: 'Loja em dia', detalhe: 'Nenhum lead quente ou esfriando pendente. Bom momento pra prospectar.' });

            return NextResponse.json({ success: true, view, nome: firstName(me?.name), ai_paused: aiPaused, kpis: kpisLoja, ranking, acoes, atividade: atividadeTop });
        }

        // ═══════════════════ CONSULTOR ═══════════════════
        const consId = me?.id || null;
        const meus = active.filter((l) => l.assigned_consultant_id === consId);
        const kpisMe = {
            ganhos_hoje: wonByCons.get(consId) || 0,
            perdas_hoje: lostRows.filter((r) => r.assigned_consultant_id === consId).length,
            fila: meus.length,
            sla_critico: meus.filter(isHot).length,
        };

        const foco = [
            ...meus.filter((l) => isHot(l) && semResposta(l)).map((l) => ({ ...l, motivo: 'Quente sem 1ª resposta', prio: 0 })),
            ...meus.filter((l) => l.flagged_reversao).map((l) => ({ ...l, motivo: 'Respondeu à reversão', prio: 1 })),
            ...meus.filter((l) => esfriando(l) && !isHot(l)).map((l) => ({ ...l, motivo: 'Esfriando há +8h', prio: 2 })),
            ...meus.filter((l) => isHot(l) && !semResposta(l) && !esfriando(l)).map((l) => ({ ...l, motivo: 'Lead quente', prio: 3 })),
        ];
        const seen = new Set<string>();
        const focoLista = foco.filter((l) => (seen.has(l.uid) ? false : seen.add(l.uid)))
            .sort((a, b) => a.prio - b.prio)
            .slice(0, 8)
            .map((l) => ({ uid: l.uid, nome: firstName(l.name), veiculo: l.vehicle_interest || null, motivo: l.motivo, ai_score: l.ai_score || 0 }));

        const acoes: any[] = [];
        const qSemResp = meus.filter((l) => isHot(l) && semResposta(l)).length;
        const esf = meus.filter(esfriando).length;
        const rev = meus.filter((l) => l.flagged_reversao).length;
        if (qSemResp > 0) acoes.push({ sev: 'critico', icon: 'flame', titulo: `${qSemResp} lead(s) quente(s) sem 1ª resposta`, detalhe: 'Responde agora — cada minuto derruba a conversão.', cta: { label: 'Abrir Inbox', href: '/inbox' } });
        if (rev > 0) acoes.push({ sev: 'aviso', icon: 'flame', titulo: `${rev} responderam à reversão`, detalhe: 'Cliente voltou. Retomar a conversa.' });
        if (esf > 0) acoes.push({ sev: 'aviso', icon: 'clock', titulo: `${esf} esfriando há +8h`, detalhe: 'Manda um retorno antes de virar perdido por inatividade.' });
        if (acoes.length === 0) acoes.push({ sev: 'ok', icon: 'check', titulo: 'Fila limpa 👏', detalhe: meus.length ? 'Nada urgente. Siga trabalhando sua fila.' : 'Sem leads na sua fila. Vá pescar no Inbox.', cta: { label: 'Abrir Inbox', href: '/inbox' } });

        return NextResponse.json({ success: true, view, nome: firstName(me?.name), ai_paused: aiPaused, kpis: kpisMe, foco: focoLista, acoes, atividade: atividadeTop });
    } catch (err: any) {
        console.error('[API dashboard/home] erro:', err?.message);
        return NextResponse.json({ success: false, error: err?.message || 'erro' }, { status: 500 });
    }
}
