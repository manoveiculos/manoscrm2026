import { NextResponse } from 'next/server';
import { consultorLogado } from '@/lib/fila/servidor';
import { parseUid } from '@/lib/services/unifiedLead';
import { telefoneKey } from '@/lib/whatsapp/evolutionParser';
import type { FichaLaura } from '@/lib/whatsapp/ia/regras';
import { faltaPerguntar, fichaEmLinhas, mensagensRecentes, situacaoDoBanco, uidDoIdDaLista, type MsgBanco } from '@/lib/leads/resumo';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const headers = { 'Cache-Control': 'no-store' };
const erro = (status: number, error: string) => NextResponse.json({ success: false, error }, { status, headers });

/** A view 'leads' tem TODOS os leads da lista (inclui leads_master, que a leads_unified não tem). */
const COLS_VIEW = 'id, name, phone, vehicle_interest, source, status, assigned_consultant_id, created_at, source_table';
const COLS_UNIFIED = 'uid, table_name, native_id, name, phone, vehicle_interest, source, status, assigned_consultant_id, created_at';

interface LeadBase {
    uid: string | null; nome: string; telefone: string | null; interesse: string | null; origem: string | null;
    status: string | null; criadoEm: string | null; consultorId: string | null;
}

/**
 * GET /api/leads/resumo?id=<id da lista ou uid> — o resumo que a gaveta da aba Leads mostra:
 * quem é, onde está (analista de IA), o que já disse (ficha da Laura) e as últimas mensagens.
 * Só leitura. Vendedor não vê lead de outro consultor.
 */
export async function GET(request: Request) {
    const ctx = await consultorLogado();
    if (!ctx.ok) return ctx.res;
    const { admin, eu } = ctx;

    const bruto = decodeURIComponent(new URL(request.url).searchParams.get('id') || '').trim();
    if (!bruto) return erro(400, 'lead não informado');

    // 1. o lead: primeiro na view da lista (todos os leads), depois na leads_unified (quando veio um uid)
    let lead: LeadBase | null = null;
    let tabela: string | null = null;
    const { data: v } = await admin.from('leads').select(COLS_VIEW).eq('id', bruto).maybeSingle();
    if (v) {
        tabela = (v.source_table as string | null) ?? null;
        lead = {
            uid: uidDoIdDaLista(bruto), nome: v.name, telefone: v.phone, interesse: v.vehicle_interest, origem: v.source,
            status: v.status, criadoEm: v.created_at, consultorId: v.assigned_consultant_id,
        };
    } else {
        const parsed = parseUid(bruto.includes(':') ? bruto : '');
        if (parsed) {
            const { data: u } = await admin.from('leads_unified').select(COLS_UNIFIED).eq('table_name', parsed.table).eq('native_id', parsed.nativeId).maybeSingle();
            if (u) {
                tabela = u.table_name as string;
                lead = { uid: u.uid, nome: u.name, telefone: u.phone, interesse: u.vehicle_interest, origem: u.source, status: u.status, criadoEm: u.created_at, consultorId: u.assigned_consultant_id };
            }
        }
    }
    if (!lead) return erro(404, 'lead não encontrado');

    if (eu.perfil !== 'admin' && lead.consultorId && lead.consultorId !== eu.consultorId) {
        return erro(403, 'este lead está com outro consultor');
    }

    // a ficha completa (/lead/[id]) lê da leads_unified: só oferece o botão quando o lead está lá
    let fichaCompleta = false;
    if (lead.uid) {
        const { data: u } = await admin.from('leads_unified').select('uid').eq('uid', lead.uid).maybeSingle();
        fichaCompleta = Boolean(u);
    }

    let consultorNome: string | null = null;
    if (lead.consultorId) {
        const { data: c } = await admin.from('consultants_manos_crm').select('name').eq('id', lead.consultorId).maybeSingle();
        consultorNome = (c?.name as string | undefined) ?? null;
    }

    // 2. conversa do WhatsApp: pelo lead e, se não achar, pelo telefone
    const CONV = 'id, status, ficha, situacao, ultima_mensagem_em';
    let conv: Record<string, unknown> | null = null;
    if (lead.uid) {
        const r = await admin.from('wa_conversas').select(CONV).eq('lead_uid', lead.uid).order('ultima_mensagem_em', { ascending: false }).limit(1).maybeSingle();
        conv = r.data;
    }
    if (!conv) {
        const tel = telefoneKey(lead.telefone);
        if (tel) {
            const r = await admin.from('wa_conversas').select(CONV).eq('telefone_key', tel).limit(1).maybeSingle();
            conv = r.data;
        }
    }

    let mensagens: ReturnType<typeof mensagensRecentes> = [];
    if (conv) {
        const { data: linhas } = await admin.from('wa_mensagens')
            .select('autor, tipo, texto, legenda, transcricao, midia_nome, apagada_em, criada_em')
            .eq('conversa_id', conv.id as string).order('criada_em', { ascending: false }).limit(12);
        mensagens = mensagensRecentes((linhas || []) as MsgBanco[], 5);
    }
    const ficha = (conv?.ficha && typeof conv.ficha === 'object' ? conv.ficha : null) as FichaLaura | null;

    return NextResponse.json({
        success: true,
        lead: {
            uid: lead.uid, nome: lead.nome, telefone: lead.telefone, interesse: lead.interesse, origem: lead.origem,
            status: lead.status, criadoEm: lead.criadoEm, consultorId: lead.consultorId, consultorNome, tabela, fichaCompleta,
        },
        conversa: conv ? { id: conv.id, status: conv.status, ultimaMensagemEm: conv.ultima_mensagem_em } : null,
        situacao: conv ? situacaoDoBanco(conv.situacao) : null,
        ficha: fichaEmLinhas(ficha),
        falta: conv ? faltaPerguntar(ficha) : [],
        mensagens,
    }, { headers });
}
