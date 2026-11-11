// src/lib/agentes/carregar.ts — LÊ OS REGISTROS REAIS DE CADA AGENTE — SÓ SERVIDOR
//
// Só leitura. Cada fonte vira RegistroAgente (frase curta, no máximo primeiro
// nome e carro do cliente). Fonte que falhar volta vazia — o agente aparece
// "ocioso" com a última ação conhecida, nunca com atividade inventada.

import type { SupabaseClient } from '@supabase/supabase-js';
import { AGENTES, agentePorSquad } from './catalogo';
import { lerConfigs } from './config';
import type { EntradaAgentes, ItemDecisao, RegistroAgente, StatusRegistro } from './estado';

const MIN = 60_000;
const DIA = 86_400_000;
const CRONS_SUPERVISOR: Record<string, string> = {
    'sla-watcher': 'varredura de SLA',
    'zombie-triage': 'faxina de leads parados',
    'morning-summary': 'resumo da manhã para o gestor',
};

const primeiroNome = (s: string | null | undefined) => {
    const n = String(s || '').replace(/[^\p{L}\s'-]/gu, ' ').trim().split(/\s+/)[0] || '';
    return n ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : 'cliente';
};
const segundos = (ms: number | null | undefined) => (typeof ms === 'number' && ms > 0 ? ` · ${(ms / 1000).toFixed(1).replace('.', ',')} s` : '');
const corta = (s: string | null | undefined, n = 90) => {
    const x = String(s || '').replace(/\s+/g, ' ').trim();
    return x.length > n ? x.slice(0, n - 1) + '…' : x;
};
const semNorm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function seguro<T = any>(rotulo: string, q: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
    try {
        const { data, error } = await q;
        if (error) { console.warn(`[agentes] ${rotulo}:`, error.message); return []; }
        return (data || []) as T[];
    } catch (e: any) {
        console.warn(`[agentes] ${rotulo}:`, e?.message);
        return [];
    }
}

export async function carregarEntradaAgentes(admin: SupabaseClient, agora: number = Date.now()): Promise<EntradaAgentes> {
    const desde24h = new Date(agora - DIA).toISOString();
    const desde14d = new Date(agora - 14 * DIA).toISOString();
    const registros: RegistroAgente[] = [];
    const decisoes: ItemDecisao[] = [];

    // ── consultores (nomes e ids) ─────────────────────────────────────────
    const consultores = await seguro<any>('consultores', admin.from('consultants_manos_crm').select('id, name, is_active'));
    const nomeConsultor = new Map<string, string>(consultores.map(c => [c.id, primeiroNome(c.name)]));
    const consultorDoAgente = new Map<string, string>(); // consultant_id → agente id
    for (const a of AGENTES.filter(x => x.consultor)) {
        const c = consultores.find(k => k.is_active !== false && semNorm(String(k.name || '')).split(/\s+/)[0] === a.consultor);
        if (c) consultorDoAgente.set(c.id, a.id);
    }
    const idsConsultores = [...consultorDoAgente.keys()];

    const [
        cfg, laurCfg, execs, msgsLaura, distrib, beats, escal, alertas, followHist, followAi,
        copiloto, interacoes, chats, msgsVend, runs, semDono,
    ] = await Promise.all([
        lerConfigs(admin),
        seguro<any>('wa_ia_config', admin.from('wa_ia_config').select('modo').eq('id', 1)),
        seguro<any>('wa_ia_execucoes', admin.from('wa_ia_execucoes')
            .select('id, conversa_id, modo, status, motivo, custo_usd, tempo_ms, iniciada_em, terminada_em')
            .gte('iniciada_em', desde14d).order('iniciada_em', { ascending: false }).limit(200)),
        seguro<any>('wa_mensagens laura', admin.from('wa_mensagens')
            .select('id, conversa_id, tipo, criada_em').eq('autor', 'laura')
            .gte('criada_em', desde14d).order('criada_em', { ascending: false }).limit(200)),
        seguro<any>('lead_distribuicao', admin.from('lead_distribuicao')
            .select('lead_uid, status, assigned_consultant_id, distribuido_em, atendido_em')
            .gte('atualizado_em', desde14d).order('atualizado_em', { ascending: false }).limit(200)),
        seguro<any>('cron_heartbeats', admin.from('cron_heartbeats')
            .select('cron_name, started_at, finished_at, duration_ms, success, error_message')
            .in('cron_name', Object.keys(CRONS_SUPERVISOR)).gte('started_at', desde24h)
            .order('started_at', { ascending: false }).limit(400)),
        seguro<any>('sla_escalations', admin.from('sla_escalations')
            .select('id, level, triggered_at').gte('triggered_at', desde24h).order('triggered_at', { ascending: false }).limit(100)),
        seguro<any>('cowork_alerts', admin.from('cowork_alerts')
            .select('id, type, title, priority, created_at, acknowledged_at, expires_at, is_active')
            .gte('created_at', desde24h).order('created_at', { ascending: false }).limit(200)),
        seguro<any>('historico_followup', admin.from('historico_followup')
            .select('id, attempt_number, enviado_em').gte('enviado_em', desde14d).order('enviado_em', { ascending: false }).limit(100)),
        seguro<any>('follow_ups ai', admin.from('follow_ups')
            .select('id, status, created_at, completed_at').eq('type', 'ai_auto').eq('status', 'sent')
            .gte('created_at', desde14d).order('created_at', { ascending: false }).limit(100)),
        seguro<any>('copiloto', admin.from('leads_distribuicao_crm_26')
            .select('id, ai_last_run_at').gte('ai_last_run_at', desde14d).order('ai_last_run_at', { ascending: false }).limit(100)),
        idsConsultores.length ? seguro<any>('interacoes', admin.from('interactions_manos_crm')
            .select('id, type, consultant_id, created_at').in('consultant_id', idsConsultores)
            .gte('created_at', desde14d).order('created_at', { ascending: false }).limit(200)) : Promise.resolve([]),
        idsConsultores.length ? seguro<any>('chats', admin.from('consultant_active_chats')
            .select('id, consultant_id, lead_name, opened_at, last_heartbeat_at, closed_at').in('consultant_id', idsConsultores)
            .gte('opened_at', desde14d).order('opened_at', { ascending: false }).limit(100)) : Promise.resolve([]),
        idsConsultores.length ? seguro<any>('wa_mensagens vendedor', admin.from('wa_mensagens')
            .select('id, conversa_id, consultant_id, criada_em').eq('autor', 'vendedor').in('consultant_id', idsConsultores)
            .gte('criada_em', desde14d).order('criada_em', { ascending: false }).limit(200)) : Promise.resolve([]),
        seguro<any>('marketing_agent_runs', admin.from('marketing_agent_runs')
            .select('id, squad, skill_name, status, title, summary, error_message, duration_ms, created_at')
            .gte('created_at', new Date(agora - 30 * DIA).toISOString()).order('created_at', { ascending: false }).limit(400)),
        seguro<any>('conversas sem dono', admin.from('wa_conversas')
            .select('id, nome_cliente, nome_contato, status, ultima_mensagem_em').is('assigned_consultant_id', null)
            .neq('status', 'encerrada').order('ultima_mensagem_em', { ascending: false }).limit(30)),
    ]);

    // Nome do cliente por conversa (só o primeiro nome vai para a tela).
    const idsConversa = [...new Set([...execs, ...msgsLaura, ...msgsVend].map((r: any) => r.conversa_id).filter(Boolean))];
    const conversas = idsConversa.length
        ? await seguro<any>('wa_conversas nomes', admin.from('wa_conversas').select('id, nome_cliente, nome_contato').in('id', idsConversa.slice(0, 300)))
        : [];
    const nomeConversa = new Map<string, string>(conversas.map(c => [c.id, primeiroNome(c.nome_cliente || c.nome_contato)]));
    const nomeDe = (conversaId: string | null) => (conversaId && nomeConversa.get(conversaId)) || 'cliente';

    // ── Laura no CRM (wa_ia_execucoes) ────────────────────────────────────
    for (const x of execs) {
        const nome = nomeDe(x.conversa_id);
        const statusMap: Record<string, StatusRegistro> = { rodando: 'rodando', ok: 'ok', erro: 'erro', pulada: 'pulada', abandonada: 'erro' };
        const st = statusMap[x.status] || 'ok';
        const ensaio = x.modo === 'ensaio';
        const frase = st === 'rodando' ? `respondendo ${nome}${ensaio ? ' (ensaio)' : ''}`
            : st === 'erro' ? `erro ao responder ${nome}${x.status === 'abandonada' ? ' (rodada abandonada)' : ''}`
            : st === 'pulada' ? `não respondeu ${nome}: ${corta(x.motivo, 60) || 'regra da Laura'}`
            : ensaio ? `rascunhou resposta para ${nome}${segundos(x.tempo_ms)}` : `respondeu ${nome}${segundos(x.tempo_ms)}`;
        registros.push({
            id: `laura:${x.id}:${st}`, evento: st === 'erro' ? { tipo: 'erro' } : st === 'rodando' ? { tipo: 'fala' } : st === 'ok' ? { tipo: 'fala' } : undefined,
            agenteId: 'laura', em: x.iniciada_em, fimEm: x.terminada_em, status: st, frase,
            custoUsd: x.custo_usd != null ? Number(x.custo_usd) : null, duracaoMs: x.tempo_ms,
            link: x.conversa_id ? `/conversas?conversa=${x.conversa_id}` : null,
        });
    }
    // ── Laura do n8n (mensagens que ela mandou pelo número da loja) ──────
    for (const m of msgsLaura) {
        registros.push({
            id: `laura-n8n:${m.id}`, evento: { tipo: 'fala' },
            agenteId: 'laura', em: m.criada_em, status: 'ok',
            frase: `respondeu ${nomeDe(m.conversa_id)} no WhatsApp (n8n)`,
            link: m.conversa_id ? `/conversas?conversa=${m.conversa_id}` : null,
        });
    }

    // ── Distribuidor (roleta) e atendimento dos consultores ──────────────
    for (const d of distrib) {
        if (d.distribuido_em) {
            registros.push({
                id: `dist:${d.lead_uid}:${d.distribuido_em}`,
                evento: { tipo: 'lead_distribuido', para: consultorDoAgente.get(d.assigned_consultant_id) },
                agenteId: 'distribuidor', em: d.distribuido_em, status: 'ok',
                frase: `lead → ${nomeConsultor.get(d.assigned_consultant_id) || 'vendedor'}`,
            });
        }
        const agenteConsultor = consultorDoAgente.get(d.assigned_consultant_id);
        if (agenteConsultor && d.atendido_em) {
            registros.push({ agenteId: agenteConsultor, em: d.atendido_em, status: 'ok', frase: 'pegou um lead da roleta' });
        }
    }

    // ── Supervisor (crons + escalonamentos + alerta de lead quente) ──────
    for (const b of beats) {
        const aberto = !b.finished_at && agora - new Date(b.started_at).getTime() < 2 * MIN;
        const st: StatusRegistro = aberto ? 'rodando' : b.success === false ? 'erro' : 'ok';
        const nome = CRONS_SUPERVISOR[b.cron_name] || b.cron_name;
        registros.push({
            id: `beat:${b.cron_name}:${b.started_at}:${st}`, evento: st === 'erro' ? { tipo: 'erro' } : b.cron_name === 'sla-watcher' ? undefined : { tipo: 'fala' },
            agenteId: 'supervisor', em: b.started_at, fimEm: b.finished_at, status: st, duracaoMs: b.duration_ms,
            frase: st === 'erro' ? `erro na ${nome}: ${corta(b.error_message, 60)}` : st === 'rodando' ? `rodando a ${nome}` : `${nome}${segundos(b.duration_ms)}`,
            // A varredura de SLA roda a cada ~5 min: só aparece no feed se der erro.
            noFeed: b.cron_name === 'sla-watcher' && st !== 'erro',
        });
    }
    for (const s of escal) {
        registros.push({ id: `sla:${s.id}`, evento: { tipo: 'fala' }, agenteId: 'supervisor', em: s.triggered_at, status: 'ok', frase: `escalou um lead parado (nível ${s.level})` });
    }
    for (const a of alertas) {
        if (a.type === 'lead_quente') registros.push({ id: `alerta:${a.id}`, evento: { tipo: 'lead_quente', texto: 'Lead quente sem resposta há 15 min' }, agenteId: 'supervisor', em: a.created_at, status: 'ok', frase: 'alertou: lead quente sem resposta há 15 min' });
    }

    // ── Reengajamento ─────────────────────────────────────────────────────
    for (const f of followHist) {
        registros.push({ id: `follow:${f.id}`, evento: { tipo: 'fala' }, agenteId: 'reengajamento', em: f.enviado_em, status: 'ok', frase: `mandou follow-up (tentativa ${f.attempt_number ?? '?'})` });
    }
    for (const f of followAi) {
        registros.push({ id: `follow-ai:${f.id}`, evento: { tipo: 'fala' }, agenteId: 'reengajamento', em: f.completed_at || f.created_at, status: 'ok', frase: 'mandou mensagem automática de retomada' });
    }

    // ── Copiloto ──────────────────────────────────────────────────────────
    for (const c of copiloto) {
        registros.push({ id: `copiloto:${c.id}:${c.ai_last_run_at}`, evento: { tipo: 'fala' }, agenteId: 'copiloto', em: c.ai_last_run_at, status: 'ok', frase: 'analisou uma conversa e sugeriu o próximo passo', link: `/lead/${encodeURIComponent(`leads_distribuicao_crm_26:${c.id}`)}` });
    }

    // ── Consultores ───────────────────────────────────────────────────────
    const fraseInteracao: Record<string, string> = {
        status_change: 'mudou a etapa de um lead', note: 'anotou num lead', ligacao: 'ligou pela Minha Fila',
        atendimento_iniciado: 'iniciou um atendimento', sale: 'registrou uma venda', loss: 'registrou uma perda',
    };
    for (const i of interacoes) {
        const agente = consultorDoAgente.get(i.consultant_id);
        if (agente) registros.push({ id: `inter:${i.id}`, evento: i.type === 'sale' ? { tipo: 'venda' } : { tipo: 'fala' }, agenteId: agente, em: i.created_at, status: 'ok', frase: fraseInteracao[i.type] || 'mexeu num lead no CRM' });
    }
    for (const c of chats) {
        const agente = consultorDoAgente.get(c.consultant_id);
        if (!agente) continue;
        const vivo = !c.closed_at && c.last_heartbeat_at && agora - new Date(c.last_heartbeat_at).getTime() < 2 * MIN;
        registros.push({
            id: `chat:${c.id}`, evento: { tipo: 'fala' },
            agenteId: agente, em: vivo ? c.last_heartbeat_at : c.opened_at, status: vivo ? 'rodando' : 'ok',
            frase: `${vivo ? 'atendendo' : 'atendeu'} ${primeiroNome(c.lead_name)} pelo WhatsApp`,
        });
    }
    for (const m of msgsVend) {
        const agente = consultorDoAgente.get(m.consultant_id);
        if (agente) registros.push({ id: `msg-vend:${m.id}`, evento: { tipo: 'fala' }, agenteId: agente, em: m.criada_em, status: 'ok', frase: `respondeu ${nomeDe(m.conversa_id)} pelo CRM`, link: `/conversas?conversa=${m.conversa_id}` });
    }

    // ── Marketing / Growth (marketing_agent_runs) ─────────────────────────
    const statusRun: Record<string, StatusRegistro> = {
        success: 'ok', approved: 'ok', error: 'erro', pending_approval: 'aguardando', rejected: 'decidido', running: 'rodando',
    };
    for (const r of runs) {
        const agente = agentePorSquad(r.squad);
        if (!agente) continue;
        const st = statusRun[r.status] || 'ok';
        const titulo = corta(r.title || r.skill_name || r.squad, 80);
        registros.push({
            id: `run:${r.id}:${st}`,
            evento: st === 'erro' ? { tipo: 'erro' } : st === 'aguardando' ? { tipo: 'aprovacao' } : st === 'ok' || st === 'rodando' ? { tipo: 'fala' } : undefined,
            agenteId: agente.id, em: r.created_at, status: st, duracaoMs: r.duration_ms,
            frase: st === 'erro' ? `erro: ${titulo}` : st === 'aguardando' ? `pediu aprovação: ${titulo}` : st === 'decidido' ? `rejeitado por você: ${titulo}` : titulo,
            link: '/admin/marketing',
        });
        if (r.status === 'pending_approval') {
            decisoes.push({ id: r.id, tipo: 'aprovacao', titulo, detalhe: corta(r.summary, 140) || null, em: r.created_at, agenteId: agente.id, link: '/admin/marketing' });
        }
    }

    // ── Decisões: conversas sem dono e alertas críticos ──────────────────
    for (const c of semDono) {
        decisoes.push({
            id: c.id, tipo: 'conversa_sem_dono', titulo: `Conversa de ${primeiroNome(c.nome_cliente || c.nome_contato)} sem vendedor`,
            em: c.ultima_mensagem_em || new Date(agora).toISOString(), link: `/conversas?conversa=${c.id}`,
        });
    }
    for (const a of alertas) {
        const ativo = a.is_active !== false && !a.acknowledged_at && (!a.expires_at || new Date(a.expires_at).getTime() > agora);
        const critico = a.type === 'lead_quente' || a.type === 'cliente_voltou' || (typeof a.priority === 'number' && a.priority <= 1);
        if (!ativo || !critico) continue;
        const lead = String(a.title || '').match(/#(\d+)/)?.[1];
        decisoes.push({
            id: a.id, tipo: 'alerta',
            // Tira final de telefone que alguns títulos trazem.
            titulo: corta(String(a.title || 'Alerta').replace(/\s*final\s+\d+/gi, ''), 90),
            em: a.created_at,
            link: lead ? `/lead/${encodeURIComponent(`leads_distribuicao_crm_26:${lead}`)}` : null,
        });
    }

    const modoLaura = (laurCfg[0]?.modo as EntradaAgentes['modoLaura']) ?? null;
    return { agora, registros, configs: cfg.configs, configInstalada: cfg.instalada, modoLaura, decisoes };
}
