// src/lib/avisos/passagem.ts — aviso URGENTE ao consultor quando a Laura passa o cliente (PURO + envio)
//
// Pedido do Alexandre (23/11/2026): toda vez que a Laura passa o cliente para uma pessoa (pediu
// atendente, pediu ligação, visita confirmada, assunto que ela não pode tratar), um vendedor é avisado
// NA HORA no WhatsApp. Antes saía só um push do navegador, e o WhatsApp do consultor só tocava 10 min
// depois, na cobrança (e nunca, se a conversa não tinha consultor).
//
//   tem consultor (ativo, WhatsApp confirmado) → aviso só para ele;
//   sem consultor → aviso para todos os disponíveis (o primeiro que pegar atende) e, se não houver
//   nenhum, para o Alexandre.
// A cobrança (cobranca.ts) continua valendo: 10 min sem resposta → lembra; 30 min → Alexandre.

import type { SupabaseClient } from '@supabase/supabase-js';
import { enviarAvisoVendedor } from './webhookVendedor';
import { escolherDestinatarios, type Consultor } from './fila';

export type MotivoPassagem = 'visita_confirmada' | 'pediu_pessoa' | 'fora_do_que_posso' | 'outro' | string;

export function tipoDoAvisoDePassagem(motivo: MotivoPassagem): 'visita_confirmada' | 'precisa_humano' {
    return motivo === 'visita_confirmada' ? 'visita_confirmada' : 'precisa_humano';
}

const primeiro = (n: string | null | undefined) => (n || '').trim().split(/\s+/)[0] || '';

export function textoDaPassagem(p: {
    motivo: MotivoPassagem; cliente: string | null; carro: string | null; resumo: string | null;
    visita: string | null; link: string; semDono: boolean;
}): string {
    const quem = primeiro(p.cliente) || 'Cliente';
    const carro = p.carro ? ` · ${p.carro}` : '';
    const titulo = p.motivo === 'visita_confirmada'
        ? `📅 *VISITA CONFIRMADA PELA LAURA*${p.visita ? ` (${p.visita})` : ''}`
        : p.motivo === 'pediu_pessoa'
            ? '🚨 *URGENTE: CLIENTE PEDIU ATENDIMENTO HUMANO*'
            : '🚨 *URGENTE: CLIENTE PRECISA DE VOCÊ*';
    const resumo = p.resumo ? `\n🤖 ${p.resumo.replace(/\s+/g, ' ').trim().slice(0, 280)}` : '';
    const acao = p.motivo === 'visita_confirmada'
        ? 'Confirme com ele e prepare o carro.'
        : 'Responda agora: a Laura já disse que você continua o atendimento.';
    const dono = p.semDono ? '\n_Cliente sem consultor: o primeiro que responder fica com ele._' : '';
    return `${titulo}\n${quem}${carro}${resumo}\n\n${acao}\n👉 ${p.link}${dono}`;
}

export interface ResultadoAvisoPassagem { avisados: number; falhas: number; semTelefone: number; destino: 'consultor' | 'todos' | 'gestor' | 'ninguem' }

/** Envia o aviso da passagem. Nunca lança. */
export async function avisarPassagem(supabase: SupabaseClient, p: {
    conversaId: string; leadUid: string | null; consultorId: string | null;
    motivo: MotivoPassagem; resumo: string | null; cliente: string | null; carro: string | null; visita: string | null;
    agora?: Date;
}): Promise<ResultadoAvisoPassagem> {
    const r: ResultadoAvisoPassagem = { avisados: 0, falhas: 0, semTelefone: 0, destino: 'ninguem' };
    try {
        const agora = p.agora ?? new Date();
        const base = (process.env.NEXT_PUBLIC_BASE_URL || 'https://manoscrm.com.br').replace(/\/$/, '');
        const link = `${base}/conversas?c=${p.conversaId}`;
        const tipo = tipoDoAvisoDePassagem(p.motivo);
        const { data } = await supabase.from('consultants_manos_crm').select('id, name, phone, phone_verified_at, is_active, recebe_leads, disponivel_em, role');
        const todos = (data || []).map(c => ({
            id: c.id as string, name: c.name as string, phone: (c.phone as string | null) ?? null, phoneVerificado: Boolean(c.phone_verified_at),
            ativo: c.is_active !== false, recebeLeads: c.recebe_leads !== false, disponivelEm: (c.disponivel_em as string | null) ?? null, role: String(c.role || ''),
        }));
        const apto = (c: Consultor) => c.ativo && c.phoneVerificado && Boolean(c.phone);

        let destinos: (Consultor & { role: string })[] = [];
        const dono = p.consultorId ? todos.find(c => c.id === p.consultorId) : undefined;
        if (dono && apto(dono)) { destinos = [dono]; r.destino = 'consultor'; }
        else {
            if (dono) r.semTelefone++;
            const hoje = new Date(agora.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
            destinos = escolherDestinatarios(todos, hoje) as (Consultor & { role: string })[];
            r.destino = 'todos';
            if (!destinos.length) { destinos = todos.filter(c => c.role === 'admin' && apto(c)); r.destino = 'gestor'; }
        }
        const mensagem = textoDaPassagem({ motivo: p.motivo, cliente: p.cliente, carro: p.carro, resumo: p.resumo, visita: p.visita, link, semDono: r.destino !== 'consultor' });
        for (const c of destinos) {
            const x = await enviarAvisoVendedor({
                nome: c.name, telefone: c.phone, tipo, consultorId: c.id, mensagem,
                leadRef: p.leadUid, conversaId: p.conversaId, origem: 'passagemLaura',
                meta: { motivo: p.motivo, destino: r.destino },
            });
            if (x.ok) r.avisados++; else r.falhas++;
        }
        // Lead que caiu na fila nesta passagem: a fila não manda de novo o 1º aviso (só lembrete e escalada).
        if (r.avisados && r.destino !== 'consultor' && p.leadUid) {
            await supabase.from('lead_distribuicao').update({ fila_avisada_em: agora.toISOString() })
                .eq('lead_uid', p.leadUid).eq('status', 'fila_espera').is('fila_avisada_em', null);
        }
    } catch (e) {
        console.warn('[passagem] aviso falhou:', e instanceof Error ? e.message : e);
        r.falhas++;
    }
    return r;
}
