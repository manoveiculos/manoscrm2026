// src/lib/avisos/cobrancaRodada.ts — roda a cobrança dos consultores (SÓ SERVIDOR)
//
// Chamado por /api/cron/wa-cobranca (a cada 5 min). Liga com WA_COBRANCA_ATIVA=true.
// Manda pelo webhook único (chamadavendedorcrm), registra em avisos_enviados (tela /admin/avisos)
// e só avisa telefone JÁ CONFIRMADO por código (phone_verified_at). Tetos para não virar spam:
// 3 avisos por rodada, 15 s entre eles.

import type { SupabaseClient } from '@supabase/supabase-js';
import { horarioLoja, isOpenNow } from '@/lib/services/slaEngine';
import { enviarAvisoVendedor } from './webhookVendedor';
import { MAX_ESPERA_H, decidirCobranca, textoDaCobranca } from './cobranca';

export interface ResumoCobranca {
    ok: boolean;
    motivo?: string;
    candidatas: number;
    avisos: number;
    falhas: number;
    semTelefone: number;
    puladas: Record<string, number>;
}

const MAX_AVISOS_RODADA = 3;
const ESPERA_ENTRE_AVISOS_MS = 15_000;

function urlBase(): string {
    return (process.env.NEXT_PUBLIC_BASE_URL || 'https://manoscrm.com.br').replace(/\/$/, '');
}

export async function rodarCobranca(supabase: SupabaseClient, opts: { agora?: Date; esperar?: (ms: number) => Promise<void> } = {}): Promise<ResumoCobranca> {
    const agora = opts.agora ?? new Date();
    const esperar = opts.esperar ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
    const r: ResumoCobranca = { ok: true, candidatas: 0, avisos: 0, falhas: 0, semTelefone: 0, puladas: {} };
    const pular = (m: string) => { r.puladas[m] = (r.puladas[m] || 0) + 1; };

    const horario = await horarioLoja(supabase);
    const lojaAberta = isOpenNow(agora, horario.horas, horario.feriados);
    if (!lojaAberta) return { ...r, motivo: 'fora do horário da loja' };

    const desde = new Date(agora.getTime() - (MAX_ESPERA_H + 1) * 3_600_000).toISOString();
    const { data: convs, error } = await supabase.from('wa_conversas')
        .select('id, status, lead_uid, nome_cliente, nome_contato, ficha, assigned_consultant_id, ultima_mensagem_em')
        .neq('status', 'encerrada').not('assigned_consultant_id', 'is', null).gte('ultima_mensagem_em', desde)
        .order('ultima_mensagem_em', { ascending: true }).limit(200);
    if (error) return { ...r, ok: false, motivo: error.message };
    r.candidatas = convs?.length ?? 0;

    const ids = [...new Set((convs || []).map(c => c.assigned_consultant_id as string))];
    const { data: cons } = ids.length
        ? await supabase.from('consultants_manos_crm').select('id, name, phone, phone_verified_at, is_active').in('id', ids)
        : { data: [] as never[] };
    const porId = new Map((cons || []).map(c => [c.id as string, c]));
    const { data: admins } = await supabase.from('consultants_manos_crm').select('id, name, phone, phone_verified_at').eq('role', 'admin').eq('is_active', true);

    let enviados = 0;
    for (const c of convs || []) {
        if (enviados >= MAX_AVISOS_RODADA) break;
        const consultor = porId.get(c.assigned_consultant_id as string);
        if (!consultor || consultor.is_active === false) { pular('consultor inativo'); continue; }

        const { data: linhas } = await supabase.from('wa_mensagens').select('autor, criada_em')
            .eq('conversa_id', c.id).order('criada_em', { ascending: false }).limit(30);
        const msgs = (linhas || []).map(m => ({ autor: m.autor as string, criadaEm: m.criada_em as string }));

        // quando a Laura passou o cliente: execução da Laura do CRM com passagem enviada
        const { data: ex } = await supabase.from('wa_ia_execucoes').select('terminada_em')
            .eq('conversa_id', c.id).not('passagem', 'is', null).eq('enviada', true).order('terminada_em', { ascending: false }).limit(1).maybeSingle();
        let passagemEm = (ex?.terminada_em as string | null) ?? null;
        if (!passagemEm) {
            // passagem feita antes da Laura do CRM: o Analista leu "passou para o consultor" → vale a última fala da Laura
            const { data: s } = await supabase.from('wa_conversas').select('situacao').eq('id', c.id).maybeSingle();
            const sit = s?.situacao as { situacao?: string; confianca?: string } | null;
            if (sit?.situacao === 'passou_para_consultor' && sit.confianca !== 'baixa') {
                passagemEm = msgs.find(m => m.autor === 'laura')?.criadaEm ?? null;
            }
        }

        // níveis já avisados nesta espera
        const { data: ja } = await supabase.from('avisos_enviados').select('meta, criado_em')
            .eq('tipo', 'cobranca').eq('conversa_id', c.id).eq('status', 'enviado').gte('criado_em', desde);

        const primeira = decidirCobranca({ status: c.status, temConsultor: true, msgs, passagemEm, niveisJaEnviados: [], lojaAberta, agora });
        if (primeira.acao === 'pular') { pular(primeira.motivo); continue; }
        const niveis = (ja || []).filter(a => Date.parse(a.criado_em) >= Date.parse(primeira.esperaDesde)).map(a => Number((a.meta as { nivel?: number } | null)?.nivel) || 0);
        const d = decidirCobranca({ status: c.status, temConsultor: true, msgs, passagemEm, niveisJaEnviados: niveis, lojaAberta, agora });
        if (d.acao === 'pular') { pular(d.motivo); continue; }

        const ficha = (c.ficha && typeof c.ficha === 'object') ? c.ficha as Record<string, unknown> : {};
        const base = {
            nivel: d.nivel, minutos: d.minutos, cliente: (c.nome_cliente as string | null) || (c.nome_contato as string | null),
            carro: typeof ficha.carro_interesse === 'string' ? ficha.carro_interesse : null, consultor: consultor.name as string,
            link: `${urlBase()}/conversas?c=${c.id}`,
        };
        const destinos: { nome: string; telefone: string | null; verificado: boolean; paraGestor: boolean; id: string | null }[] = [];
        if (d.avisarConsultor) destinos.push({ nome: consultor.name, telefone: consultor.phone, verificado: Boolean(consultor.phone_verified_at), paraGestor: false, id: consultor.id });
        if (d.avisarGestor) for (const a of admins || []) destinos.push({ nome: a.name, telefone: a.phone, verificado: Boolean(a.phone_verified_at), paraGestor: true, id: a.id });

        let algum = false;
        for (const dest of destinos) {
            if (!dest.verificado || !dest.telefone) { r.semTelefone++; continue; }
            if (algum) await esperar(ESPERA_ENTRE_AVISOS_MS);
            const res = await enviarAvisoVendedor({
                nome: dest.nome, telefone: dest.telefone, tipo: 'cobranca', consultorId: dest.id,
                mensagem: textoDaCobranca({ ...base, paraGestor: dest.paraGestor }),
                leadRef: (c.lead_uid as string | null) ?? null, conversaId: c.id, origem: 'cobrancaRodada',
                meta: { nivel: d.nivel, minutos: d.minutos, consultor: consultor.name, gestor: dest.paraGestor },
            });
            if (res.ok) { r.avisos++; algum = true; } else r.falhas++;
        }
        if (algum) enviados++;
    }
    return r;
}
