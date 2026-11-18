// src/lib/whatsapp/ia/visitaRodada.ts — grava a visita da Laura na Agenda (servidor)
//
// Chamado por motor.ts (executarEnvio) depois que a confirmação foi ao cliente. Nunca lança: quem
// chama guarda o resultado em wa_ia_execucoes.agendamento ({ gravada, id, erro }) para o erro aparecer.
//
// Decisão de 18/11/2026: visita da Laura NÃO dispara o webhook de criação do n8n (o cliente já recebeu
// a confirmação da Laura; evita mensagem duplicada). Os lembretes de 24h, do dia e de 2h continuam
// valendo, porque o cron lê a tabela agendamentos.

import type { SupabaseClient } from '@supabase/supabase-js';
import { enviarPushParaConsultor } from '@/lib/push/enviarPush';
import { msgErro } from '../erro';
import {
    STATUS_ATIVOS, avisoDeVisita, decidirVisita, montarLinhaVisita, quandoPorExtenso,
    type ConversaDaVisita, type VisitaExistente,
} from './visita';

/** Erro visível em webhook_errors (não importa ingestao.ts: ele carrega a OpenAI no import). */
async function registrarErroDaAgenda(supabase: SupabaseClient, mensagem: string, payload: unknown): Promise<void> {
    try {
        await supabase.from('webhook_errors').insert({ source: 'laura_agenda', error_message: mensagem.slice(0, 1000), payload });
    } catch (e) {
        console.error('[laura-crm] não consegui registrar o erro da agenda:', msgErro(e));
    }
}

export interface ResultadoVisita {
    gravada: boolean;
    id?: string;
    acao?: 'criar' | 'manter' | 'mover';
    erro?: string;
}

/** Dono da visita: o consultor da conversa; sem ele, a gerência (até alguém assumir). */
async function donoDaVisita(
    supabase: SupabaseClient, consultorId: string | null,
): Promise<{ authId: string; consultorId: string | null; semConsultor: boolean } | null> {
    if (consultorId) {
        const { data } = await supabase.from('consultants_manos_crm').select('id, auth_id').eq('id', consultorId).maybeSingle();
        if (data?.auth_id) return { authId: data.auth_id as string, consultorId: data.id as string, semConsultor: false };
    }
    const { data: adm } = await supabase.from('consultants_manos_crm').select('id, auth_id')
        .eq('role', 'admin').eq('is_active', true).not('auth_id', 'is', null).order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (adm?.auth_id) return { authId: adm.auth_id as string, consultorId: adm.id as string, semConsultor: true };
    return null;
}

export async function gravarVisitaDaLaura(
    supabase: SupabaseClient,
    p: {
        iso: string;
        conversaId: string;
        conversa: ConversaDaVisita & { assigned_consultant_id: string | null };
        nomeNaFicha?: string | null;
        carroInteresse?: string | null;
        agora?: Date;
    },
): Promise<ResultadoVisita> {
    const agora = p.agora ?? new Date();
    try {
        const dono = await donoDaVisita(supabase, p.conversa.assigned_consultant_id);
        if (!dono) throw new Error('nenhum consultor com login (auth_id) para ser dono da visita');

        // visitas ativas deste cliente (por lead; sem lead, pelo WhatsApp)
        const fone = montarLinhaVisita({ iso: p.iso, conversa: p.conversa, vendedorAuthId: dono.authId }).cliente_whatsapp;
        let q = supabase.from('agendamentos').select('id, data_hora, status').in('status', [...STATUS_ATIVOS]).gt('data_hora', agora.toISOString());
        q = p.conversa.lead_uid ? q.eq('lead_uid', p.conversa.lead_uid) : q.eq('cliente_whatsapp', fone || '__sem__');
        const { data: ex, error: eEx } = await q;
        if (eEx) throw new Error(`consulta: ${eEx.message}`);
        const decisao = decidirVisita((ex || []) as VisitaExistente[], p.iso, agora);

        const nome = (p.nomeNaFicha || p.conversa.nome_cliente || p.conversa.nome_contato || 'Cliente').trim();
        const quando = quandoPorExtenso(p.iso, agora);

        if (decisao.acao === 'manter') return { gravada: true, id: decisao.id, acao: 'manter' };

        let id: string;
        if (decisao.acao === 'mover') {
            // mesma linha, novo horário; zera os lembretes para dispararem de novo na data nova
            const { error } = await supabase.from('agendamentos').update({
                data_hora: p.iso, status: 'agendado', atualizado_em: agora.toISOString(),
                lembrete_1d_enviado_em: null, lembrete_dia_enviado_em: null, lembrete_2h_enviado_em: null,
            }).eq('id', decisao.id);
            if (error) throw new Error(`atualizar: ${error.message}`);
            id = decisao.id;
        } else {
            const linha = montarLinhaVisita({
                iso: p.iso, conversa: p.conversa, nomeNaFicha: p.nomeNaFicha, carroInteresse: p.carroInteresse,
                vendedorAuthId: dono.authId, semConsultor: dono.semConsultor,
            });
            const { data, error } = await supabase.from('agendamentos').insert(linha).select('id').single();
            if (error || !data) throw new Error(`inserir: ${error?.message || 'sem retorno'}`);
            id = data.id as string;
        }

        // aviso ao consultor (best-effort: nunca derruba a gravação)
        try {
            const av = avisoDeVisita({
                acao: decisao.acao === 'mover' ? 'mover' : 'criar',
                quando,
                quandoAntes: decisao.acao === 'mover' ? quandoPorExtenso(decisao.de, agora) : null,
                cliente: nome, carro: p.carroInteresse, semConsultor: dono.semConsultor,
            });
            await enviarPushParaConsultor(dono.consultorId, { titulo: av.titulo, corpo: av.corpo, url: '/agenda', tag: `visita-${id}` });
        } catch (e) {
            console.error('[laura-crm] aviso da visita falhou:', msgErro(e));
        }
        return { gravada: true, id, acao: decisao.acao };
    } catch (e) {
        const erro = msgErro(e).slice(0, 300);
        // erro VISÍVEL (antes era engolido): fica em webhook_errors e em wa_ia_execucoes.agendamento.erro
        await registrarErroDaAgenda(supabase, `visita da Laura não gravada: ${erro}`, { conversa_id: p.conversaId, iso: p.iso });
        return { gravada: false, erro };
    }
}
