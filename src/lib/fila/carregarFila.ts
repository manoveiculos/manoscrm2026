// src/lib/fila/carregarFila.ts — lê do banco o que a Minha Fila precisa (SÓ SERVIDOR)
//
// Tudo filtrado pelo consultor logado. Consultas auxiliares (conversa,
// estoque, alertas) são best-effort: se uma falhar, a fila chega sem aquele
// pedaço em vez de não chegar.

import type { SupabaseClient } from '@supabase/supabase-js';
import { buscarQualificacao, pisoEstoque } from '@/lib/services/qualificacaoService';
import { tabelaComQualificacao } from '@/lib/qualificacao';
import {
    MOTIVOS_RECUPERAVEIS,
    type ConversaResumo, type EntradaFila, type ItemEstoque, type LeadFila,
    type RetornoFila, type VisitaFila, type VoltouFila,
} from './montarFila';

import { veiculosDoEstoque } from '@/lib/estoque';

const DIA = 86_400_000;
/** Orientação do next-steps mais velha que isso não aparece no topo. */
const ORIENTACAO_VALIDA_DIAS = 7;
/** Tipos de follow_ups que são alerta da IA, não contato combinado. */
const FOLLOWUP_NAO_CONTATO = ['ai_auto', 'ai_alert_compra', 'admin_overload'];

const avisar = (onde: string, e: { message?: string } | null | undefined) => {
    if (e) console.warn(`[fila] ${onde}:`, e.message);
};

/** Início de hoje em Brasília (UTC-3), em ISO UTC. Igual ao da agenda. */
function inicioDeHojeBRT(agora: number): string {
    const brt = new Date(agora - 3 * 3_600_000);
    return new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 3, 0, 0)).toISOString();
}

function orientacaoDoResumo(resumo: string | null | undefined, rodouEm: string | null | undefined, agora: number): string | null {
    const s = String(resumo || '');
    const i = s.indexOf('ORIENTAÇÃO:');
    if (i < 0) return null;
    const t = rodouEm ? new Date(rodouEm).getTime() : NaN;
    if (!Number.isFinite(t) || agora - t > ORIENTACAO_VALIDA_DIAS * DIA) return null;
    return s.slice(i + 'ORIENTAÇÃO:'.length).trim() || null;
}

const sufixo = (tel: string | null | undefined) => {
    const d = String(tel || '').replace(/\D/g, '');
    return d.length >= 8 ? d.slice(-8) : null;
};

function textoDaMensagem(message: any): string {
    const c = message?.content ?? message?.text ?? message?.body ?? '';
    const s = typeof c === 'string' ? c : JSON.stringify(c);
    return s.replace(/\s+/g, ' ').trim().slice(0, 200);
}

/**
 * Última mensagem da conversa com a Laura (concessionaria_mensagens), por
 * lead. É a única conversa registrada hoje: a do vendedor fica no celular dele
 * até a Fase 2.
 */
async function conversasPorTelefone(admin: SupabaseClient, leads: { uid: string; telefone: string | null }[], agora: number): Promise<Record<string, ConversaResumo>> {
    const out: Record<string, ConversaResumo> = {};
    const uidsPorSufixo = new Map<string, string[]>();
    for (const l of leads) {
        const s = sufixo(l.telefone);
        if (s) (uidsPorSufixo.get(s) || uidsPorSufixo.set(s, []).get(s)!).push(l.uid);
    }
    const sufixos = [...uidsPorSufixo.keys()];
    if (sufixos.length === 0) return out;

    // dados_cliente: sessão da Laura ↔ telefone (o telefone vem com "@s.whatsapp.net").
    const sessaoParaSufixo = new Map<string, string>();
    for (let i = 0; i < sufixos.length; i += 40) {
        const lote = sufixos.slice(i, i + 40);
        const { data, error } = await admin
            .from('dados_cliente')
            .select('sessionid, telefone')
            .or(lote.map(s => `telefone.ilike.%${s}%`).join(','))
            .limit(500);
        avisar('dados_cliente', error);
        for (const r of (data || []) as any[]) {
            const s = sufixo(String(r.telefone || '').split('@')[0]);
            if (s && r.sessionid && uidsPorSufixo.has(s)) sessaoParaSufixo.set(String(r.sessionid), s);
        }
    }
    const sessoes = [...sessaoParaSufixo.keys()];
    if (sessoes.length === 0) return out;

    const desde = new Date(agora - 60 * DIA).toISOString();
    const vistos = new Set<string>();
    for (let i = 0; i < sessoes.length; i += 80) {
        const { data, error } = await admin
            .from('concessionaria_mensagens')
            .select('id, session_id, message, data')
            .in('session_id', sessoes.slice(i, i + 80))
            .gte('data', desde)
            .order('id', { ascending: false })
            .limit(3000);
        avisar('concessionaria_mensagens', error);
        for (const m of (data || []) as any[]) {
            const s = sessaoParaSufixo.get(String(m.session_id));
            if (!s) continue;
            const tipo = m.message?.type;
            const autor = tipo === 'human' ? 'cliente' : 'laura';
            const texto = textoDaMensagem(m.message);
            for (const uid of uidsPorSufixo.get(s) || []) {
                const r = out[uid] || (out[uid] = { ultima: null, ultimaDoClienteEm: null });
                if (!vistos.has(uid) && texto) {
                    r.ultima = { texto, autor, em: m.data };
                    vistos.add(uid);
                }
                if (autor === 'cliente' && !r.ultimaDoClienteEm) r.ultimaDoClienteEm = m.data;
            }
        }
    }
    return out;
}

export async function carregarEntradaFila(
    admin: SupabaseClient,
    eu: { consultorId: string; authId: string },
    agora: number = Date.now(),
): Promise<EntradaFila> {
    // ── Leads ativos do consultor ─────────────────────────────────────────
    const { data: ativos, error: errAtivos } = await admin
        .from('leads_unified_active')
        .select('uid, table_name, native_id, name, phone, vehicle_interest, status, created_at, atendimento_iniciado_em, ultima_interacao_humana, first_contact_at, first_contact_channel, flow_type')
        .eq('assigned_consultant_id', eu.consultorId)
        .is('archived_at', null)
        .limit(400);
    if (errAtivos) throw new Error(`leads: ${errAtivos.message}`);
    const linhas = ((ativos || []) as any[]).filter(l => l.flow_type !== 'compra');

    // Telefone completo e orientação da IA vêm da tabela-base (decisão 3:
    // o vendedor vê o número completo).
    const crm26Ids = linhas.filter(l => l.table_name === 'leads_distribuicao_crm_26').map(l => Number(l.native_id)).filter(Number.isInteger);
    const fbIds = linhas.filter(l => l.table_name === 'leadsfacebook').map(l => String(l.native_id));
    const extra = new Map<string, { telefone?: string | null; orientacao?: string | null }>();
    const [r26, rfb] = await Promise.all([
        crm26Ids.length
            ? admin.from('leads_distribuicao_crm_26').select('id, telefone, resumo_consultor, ai_last_run_at').in('id', crm26Ids)
            : Promise.resolve({ data: [], error: null }),
        fbIds.length
            ? admin.from('leadsfacebook').select('id, phone').in('id', fbIds)
            : Promise.resolve({ data: [], error: null }),
    ]);
    avisar('crm26 extras', r26.error);
    avisar('leadsfacebook extras', rfb.error);
    for (const r of (r26.data || []) as any[]) {
        extra.set(`leads_distribuicao_crm_26:${r.id}`, { telefone: r.telefone, orientacao: orientacaoDoResumo(r.resumo_consultor, r.ai_last_run_at, agora) });
    }
    for (const r of (rfb.data || []) as any[]) extra.set(`leadsfacebook:${r.id}`, { telefone: r.phone });

    // ── Perdidos recuperáveis (faltou o carro, últimos 90 dias) ───────────
    const { data: perdidosRaw, error: errPerdidos } = await admin
        .from('leads_distribuicao_crm_26')
        .select('id, nome, telefone, interesse, vehicle_interest, status, criado_em, atualizado_em, motivo_perda_estruturado')
        .eq('assigned_consultant_id', eu.consultorId)
        .in('status', ['perdido', 'lost'])
        .in('motivo_perda_estruturado', MOTIVOS_RECUPERAVEIS)
        .gte('atualizado_em', new Date(agora - 90 * DIA).toISOString())
        .limit(100);
    avisar('perdidos', errPerdidos);

    const uidsQualificacao = [
        ...linhas.filter(l => tabelaComQualificacao(l.table_name)).map(l => l.uid as string),
        ...((perdidosRaw || []) as any[]).map(p => `leads_distribuicao_crm_26:${p.id}`),
    ];

    const [piso, qualificacao, estoqueFeed, visitasRes, retornosRes, voltouRes] = await Promise.all([
        pisoEstoque(admin).catch(() => null),
        buscarQualificacao(admin, uidsQualificacao).catch(() => new Map()),
        // estoque pelo feed da Altimus (a tabela `estoque` está obsoleta)
        veiculosDoEstoque().catch(() => []),
        admin.from('agendamentos')
            .select('id, lead_uid, cliente_nome, cliente_telefone, cliente_whatsapp, veiculo_interesse, tipo, data_hora, status')
            .eq('vendedor_id', eu.authId)
            .in('status', ['agendado', 'confirmado'])
            .gte('data_hora', inicioDeHojeBRT(agora))
            .order('data_hora', { ascending: true })
            .limit(200),
        admin.from('follow_ups')
            .select('id, lead_id, type, scheduled_at, note, metadata')
            .in('user_id', [eu.consultorId, eu.authId])
            .eq('status', 'pending')
            .limit(500),
        admin.from('cowork_alerts')
            .select('title, message, created_at')
            .eq('type', 'cliente_voltou')
            .eq('target_consultant_id', eu.consultorId)
            .gte('created_at', new Date(agora - 3 * DIA).toISOString())
            .limit(100),
    ]);
    avisar('agendamentos', visitasRes.error);
    avisar('follow_ups', retornosRes.error);
    avisar('cowork_alerts', voltouRes.error);

    const paraLead = (l: any): LeadFila => {
        const ex = extra.get(l.uid);
        return {
            uid: l.uid,
            table: l.table_name,
            nativeId: String(l.native_id),
            nome: l.name,
            telefone: ex?.telefone || l.phone || null,
            carro: l.vehicle_interest,
            status: l.status,
            criadoEm: l.created_at,
            atendimentoIniciadoEm: l.atendimento_iniciado_em,
            ultimaInteracaoHumana: l.ultima_interacao_humana,
            primeiroContatoEm: l.first_contact_at,
            primeiroContatoCanal: l.first_contact_channel,
            qualificacao: tabelaComQualificacao(l.table_name) ? (qualificacao.get(l.uid) || {}) : null,
            orientacaoIA: ex?.orientacao ?? null,
        };
    };
    const leads = linhas.map(paraLead);

    const perdidos: LeadFila[] = ((perdidosRaw || []) as any[]).map(p => {
        const uid = `leads_distribuicao_crm_26:${p.id}`;
        return {
            uid,
            table: 'leads_distribuicao_crm_26',
            nativeId: String(p.id),
            nome: p.nome,
            telefone: p.telefone,
            carro: p.vehicle_interest || p.interesse,
            status: p.status,
            criadoEm: p.criado_em,
            atendimentoIniciadoEm: null,
            ultimaInteracaoHumana: null,
            primeiroContatoEm: null,
            primeiroContatoCanal: null,
            qualificacao: qualificacao.get(uid) || {},
            orientacaoIA: null,
            motivoPerda: p.motivo_perda_estruturado,
            // Não existe "perdido_em" na tabela: a perda é a última atualização.
            perdidoEm: p.atualizado_em,
        };
    });

    const visitas: VisitaFila[] = ((visitasRes.data || []) as any[]).map(v => ({
        id: v.id,
        leadUid: v.lead_uid || null,
        clienteNome: v.cliente_nome,
        telefone: v.cliente_whatsapp || v.cliente_telefone || null,
        veiculo: v.veiculo_interesse,
        dataHora: v.data_hora,
        tipo: v.tipo,
        status: v.status,
    }));

    const retornos: RetornoFila[] = [];
    for (const f of (retornosRes.data || []) as any[]) {
        if (FOLLOWUP_NAO_CONTATO.includes(f.type)) continue;
        const leadUid = f.metadata?.lead_uid || (f.lead_id ? `leads_manos_crm:${f.lead_id}` : null);
        if (!leadUid || !f.scheduled_at) continue;
        retornos.push({ id: f.id, leadUid, quando: f.scheduled_at, nota: f.note || null });
    }

    const voltou: VoltouFila[] = [];
    for (const a of (voltouRes.data || []) as any[]) {
        const m = String(a.title || '').match(/lead #(\d+)/i);
        if (m) voltou.push({ leadUid: `leads_distribuicao_crm_26:${m[1]}`, em: a.created_at, texto: a.message || null });
    }

    const conversas = await conversasPorTelefone(admin, [...leads, ...perdidos], agora).catch((e) => {
        avisar('conversas', e);
        return {} as Record<string, ConversaResumo>;
    });

    return {
        agora,
        pisoEstoque: piso,
        leads,
        perdidos,
        estoque: estoqueFeed.map((v): ItemEstoque => ({
            marca: v.marca || null,
            modelo: v.modelo || null,
            ano: v.ano != null ? String(v.ano) : null,
            preco: v.preco != null ? `R$ ${v.preco.toLocaleString('pt-BR')}` : null,
        })),
        visitas,
        retornos,
        voltou,
        conversas,
    };
}
