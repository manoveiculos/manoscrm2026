// src/lib/avisos/filaRodada.ts — fila de espera e retorno do cliente (SÓ SERVIDOR)
//
// rodarFila(): lead sem dono (status fila_espera) → aviso a todos os consultores disponíveis; 10 min → lembrete;
// 20 min → alerta ao Alexandre. rodarRetorno(): cliente respondeu a um follow-up/lembrete da Laura → aviso ao
// consultor responsável. Chamado por /api/cron/wa-fila (a cada 2 min). Tudo sai pelo webhook único e entra em
// /admin/avisos. Só age com wa_ia_config.distribuicao = 'fila'.

import type { SupabaseClient } from '@supabase/supabase-js';
import { businessSecondsBetween, horarioLoja, isOpenNow } from '@/lib/services/slaEngine';
import { lerModoDistribuicao, type ModoDistribuicao } from '@/lib/services/modoDistribuicao';
import { enviarAvisoVendedor } from './webhookVendedor';
import {
    decidirFila, escolherDestinatarios, respostaAoFollowup, textoEscaladaFila, textoFila, textoLembreteFila, textoRetorno,
    type Consultor, type DadosLeadFila,
} from './fila';

export type { ModoDistribuicao };

const TABELA = 'leads_distribuicao_crm_26';
const base = () => (process.env.NEXT_PUBLIC_BASE_URL || 'https://manoscrm.com.br').replace(/\/$/, '');
const hojeBR = (agora: Date) => new Date(agora.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
const MAX_AVISOS_RODADA = 12;
const ESPERA_ENTRE_AVISOS_MS = 10_000;

export interface ResumoFila {
    ok: boolean; modo: ModoDistribuicao; motivo?: string;
    naFila: number; avisados: number; lembretes: number; escaladas: number; retornos: number; falhas: number;
}

async function consultores(supabase: SupabaseClient): Promise<(Consultor & { role: string })[]> {
    const { data } = await supabase.from('consultants_manos_crm').select('id, name, phone, phone_verified_at, is_active, recebe_leads, disponivel_em, role');
    return (data || []).map(c => ({
        id: c.id as string, name: c.name as string, phone: (c.phone as string | null) ?? null, phoneVerificado: Boolean(c.phone_verified_at),
        ativo: c.is_active !== false, recebeLeads: c.recebe_leads !== false, disponivelEm: (c.disponivel_em as string | null) ?? null, role: String(c.role || ''),
    }));
}

async function dadosDoLead(supabase: SupabaseClient, leadUid: string): Promise<DadosLeadFila> {
    const link = `${base()}/lead/${encodeURIComponent(leadUid)}`;
    const i = leadUid.indexOf(':');
    if (i > 0 && leadUid.slice(0, i) === 'leadsfacebook') {
        // lead do Facebook: tabela própria; o resumo da triagem fica nas observações
        const { data: f } = await supabase.from('leadsfacebook').select('nome, vehicle_interest, source, observacoes').eq('id', leadUid.slice(i + 1)).maybeSingle();
        const vi = ((f?.vehicle_interest as string | null) || '').trim();
        const apurouFb = /O que ela apurou:\s*([^\n]+)/.exec((f?.observacoes as string | null) || '')?.[1] ?? null;
        return { nome: (f?.nome as string | null) ?? null, carro: vi && vi.toLowerCase() !== String(f?.source || '').trim().toLowerCase() ? vi : null, origem: 'Facebook', resumo: apurouFb, link };
    }
    if (i <= 0 || leadUid.slice(0, i) !== TABELA) return { nome: null, carro: null, origem: null, resumo: null, link };
    const { data: l } = await supabase.from(TABELA).select('nome, vehicle_interest, interesse, origem, handoff_summary').eq('id', parseInt(leadUid.slice(i + 1), 10)).maybeSingle();
    const hs = (l?.handoff_summary as string | null) || '';
    // linha "O que ela apurou: ..." do resumo da triagem (se houver)
    const apurou = /O que ela apurou:\s*([^\n]+)/.exec(hs)?.[1] ?? null;
    return {
        nome: (l?.nome as string | null) ?? null,
        carro: ((l?.vehicle_interest as string | null) || (l?.interesse as string | null) || null),
        origem: (l?.origem as string | null) ?? null, resumo: apurou, link,
    };
}

export async function rodarFila(supabase: SupabaseClient, opts: { agora?: Date; esperar?: (ms: number) => Promise<void> } = {}): Promise<ResumoFila> {
    const agora = opts.agora ?? new Date();
    const esperar = opts.esperar ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
    const r: ResumoFila = { ok: true, modo: await lerModoDistribuicao(supabase), naFila: 0, avisados: 0, lembretes: 0, escaladas: 0, retornos: 0, falhas: 0 };
    if (r.modo !== 'fila') return { ...r, motivo: 'distribuição em rodízio (chave desligada)' };

    // lead que ficou em 'aguardando'/'standby' (webhooks antigos, resgate de órfãos): também vai para a fila
    await supabase.from('lead_distribuicao').update({ status: 'fila_espera', atualizado_em: agora.toISOString() }).in('status', ['standby', 'aguardando']);

    const horario = await horarioLoja(supabase);
    const lojaAberta = isOpenNow(agora, horario.horas, horario.feriados);
    const { data: fila } = await supabase.from('lead_distribuicao')
        .select('lead_uid, criado_em, fila_avisada_em, fila_lembrete_em, fila_escalou_em').eq('status', 'fila_espera').order('criado_em', { ascending: true }).limit(40);
    r.naFila = fila?.length ?? 0;
    if (!r.naFila) return r;

    const todos = await consultores(supabase);
    const destinatarios = escolherDestinatarios(todos, hojeBR(agora));
    const admins = todos.filter(c => c.role === 'admin' && c.ativo && c.phoneVerificado && c.phone);
    let enviados = 0;
    const mandar = async (c: { id: string; name: string; phone: string | null }, tipo: string, mensagem: string, leadUid: string, meta: Record<string, unknown>) => {
        if (enviados >= MAX_AVISOS_RODADA) return false;
        if (enviados > 0) await esperar(ESPERA_ENTRE_AVISOS_MS);
        const x = await enviarAvisoVendedor({ nome: c.name, telefone: c.phone, tipo, consultorId: c.id, mensagem, leadRef: leadUid, origem: 'filaRodada', meta });
        enviados++;
        if (!x.ok) r.falhas++;
        return x.ok;
    };

    for (const l of fila || []) {
        const minutos = l.fila_avisada_em ? Math.floor(businessSecondsBetween(new Date(l.fila_avisada_em as string), agora, horario.horas, horario.feriados) / 60) : 0;
        const acao = decidirFila({ status: 'fila_espera', avisadaEm: (l.fila_avisada_em as string | null) ?? null, lembreteEm: (l.fila_lembrete_em as string | null) ?? null, escalouEm: (l.fila_escalou_em as string | null) ?? null, lojaAberta, agora, minutosAbertosDesdeAviso: minutos });
        if (acao === 'esperar') continue;
        // um consultor já falou com o cliente (celular da loja ou CRM): o lead não está mais esperando
        const { data: cv } = await supabase.from('wa_conversas').select('id').eq('lead_uid', l.lead_uid).limit(1).maybeSingle();
        if (cv?.id) {
            const { count } = await supabase.from('wa_mensagens').select('id', { count: 'exact', head: true }).eq('conversa_id', cv.id).eq('autor', 'vendedor').gte('criada_em', l.criado_em);
            if (count) { await supabase.from('lead_distribuicao').update({ status: 'atendido', atendido_em: agora.toISOString(), atualizado_em: agora.toISOString() }).eq('lead_uid', l.lead_uid).eq('status', 'fila_espera'); continue; }
        }
        const dados = await dadosDoLead(supabase, l.lead_uid as string);

        if (acao === 'avisar') {
            if (!destinatarios.length) { // ninguém para avisar: vai direto ao Alexandre
                for (const a of admins) await mandar(a, 'lead_fila_escalada', `🚨 *Lead na fila e nenhum consultor disponível*\n${dados.nome || 'Cliente novo'}${dados.carro ? ` · ${dados.carro}` : ''}\n👉 ${dados.link}`, l.lead_uid as string, { motivo: 'sem_destinatario' });
                await supabase.from('lead_distribuicao').update({ fila_avisada_em: agora.toISOString() }).eq('lead_uid', l.lead_uid);
                r.escaladas++;
                continue;
            }
            let algum = false;
            for (const c of destinatarios) if (await mandar(c, 'lead_fila', textoFila(dados), l.lead_uid as string, { fila: true })) algum = true;
            if (algum) { await supabase.from('lead_distribuicao').update({ fila_avisada_em: agora.toISOString() }).eq('lead_uid', l.lead_uid); r.avisados++; }
        } else if (acao === 'lembrar') {
            for (const c of destinatarios) await mandar(c, 'lead_fila_lembrete', textoLembreteFila(dados, minutos), l.lead_uid as string, { minutos });
            await supabase.from('lead_distribuicao').update({ fila_lembrete_em: agora.toISOString() }).eq('lead_uid', l.lead_uid);
            r.lembretes++;
        } else if (acao === 'escalar') {
            for (const a of admins) await mandar(a, 'lead_fila_escalada', textoEscaladaFila(dados, minutos), l.lead_uid as string, { minutos });
            await supabase.from('lead_distribuicao').update({ fila_escalou_em: agora.toISOString() }).eq('lead_uid', l.lead_uid);
            r.escaladas++;
        }
    }
    return r;
}

/** O cliente respondeu a um follow-up (ou lembrete) da Laura: avisa o consultor responsável uma vez. */
export async function rodarRetorno(supabase: SupabaseClient, opts: { agora?: Date } = {}): Promise<{ avisados: number; falhas: number }> {
    const agora = opts.agora ?? new Date();
    const desde = new Date(agora.getTime() - 3 * 86_400_000).toISOString();
    const toques: { ref: string; conversaId: string; em: string }[] = [];
    const { data: fu } = await supabase.from('wa_followups').select('id, conversa_id, criado_em').eq('status', 'enviado').gte('criado_em', desde).limit(100);
    for (const f of fu || []) toques.push({ ref: `followup:${f.id}`, conversaId: f.conversa_id as string, em: f.criado_em as string });
    const { data: lb } = await supabase.from('wa_triagem').select('lead_uid, conversa_id, lembrete_em').not('lembrete_em', 'is', null).gte('lembrete_em', desde).limit(100);
    for (const t of lb || []) if (t.conversa_id) toques.push({ ref: `lembrete:${t.lead_uid}`, conversaId: t.conversa_id as string, em: t.lembrete_em as string });

    const todos = await consultores(supabase);
    let avisados = 0, falhas = 0;
    for (const t of toques) {
        if (avisados >= 10) break;
        const { data: conv } = await supabase.from('wa_conversas').select('id, lead_uid, nome_cliente, nome_contato, ficha, assigned_consultant_id').eq('id', t.conversaId).maybeSingle();
        const dono = conv?.assigned_consultant_id as string | null | undefined;
        if (!conv || !dono) continue;
        const { data: ja } = await supabase.from('avisos_enviados').select('id').eq('tipo', 'cliente_voltou').eq('conversa_id', t.conversaId).contains('meta', { ref: t.ref }).limit(1);
        const { data: falas } = await supabase.from('wa_mensagens').select('criada_em, texto, transcricao').eq('conversa_id', t.conversaId).eq('autor', 'cliente').gt('criada_em', t.em).order('criada_em', { ascending: true }).limit(3);
        const resp = respostaAoFollowup({
            falasDoCliente: (falas || []).map(f => ({ em: f.criada_em as string, texto: String(f.texto || f.transcricao || '[mídia]') })),
            followupEm: t.em, temConsultor: true, jaAvisado: Boolean(ja?.length),
        });
        if (!resp) continue;
        const c = todos.find(x => x.id === dono);
        if (!c || !c.ativo || !c.phoneVerificado || !c.phone) continue;
        const ficha = (conv.ficha && typeof conv.ficha === 'object') ? conv.ficha as Record<string, unknown> : {};
        const x = await enviarAvisoVendedor({
            nome: c.name, telefone: c.phone, tipo: 'cliente_voltou', consultorId: c.id, leadRef: (conv.lead_uid as string | null) ?? null, conversaId: t.conversaId, origem: 'retornoRodada',
            mensagem: textoRetorno({ cliente: (conv.nome_cliente as string | null) || (conv.nome_contato as string | null), carro: typeof ficha.carro_interesse === 'string' ? ficha.carro_interesse : null, texto: resp.texto, link: `${base()}/conversas?c=${t.conversaId}` }),
            meta: { ref: t.ref },
        });
        if (x.ok) avisados++; else falhas++;
    }
    return { avisados, falhas };
}
