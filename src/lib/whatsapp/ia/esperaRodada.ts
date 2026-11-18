// src/lib/whatsapp/ia/esperaRodada.ts — rodada do aviso da lista de espera (SÓ SERVIDOR)
//
// Chamado por /api/cron/wa-espera. Passos:
//   1. lê o feed da Altimus (vazio = não faz nada) e grava os carros vistos em estoque_snapshot;
//   2. "carro novo" = visto pela primeira vez nas últimas 48 h (a 1ª execução só registra o que já existia);
//   3. cada pedido aguardando que casa com um carro novo vira aviso:
//        conversa com a Laura (status 'ia') → mensagem da Laura + push ao consultor;
//        conversa com humano → só push ao consultor;
//   4. travas: Laura em "envia", horário da loja, 3 envios por rodada (75 s entre eles), 1 aviso por cliente por dia.
// Em "ensaio" não envia nem marca nada: só conta o que enviaria.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getInventory, type AltimusVehicle } from '@/lib/services/altimusInventory';
import { horarioLoja, isOpenNow } from '@/lib/services/slaEngine';
import { enviarPushParaConsultor } from '@/lib/push/enviarPush';
import { providerLoja } from '../evolutionProvider';
import { enviarPeloCrm } from '../envio';
import { msgErro } from '../erro';
import { lerConfigIa } from './config';
import { inicioDoDiaSP } from './regras';
import { carroParaIa } from './estoque';
import { leadFechado } from './followupRodada';
import { ESPERA_ENTRE_ENVIOS_MS } from './followup';
import { mensagemDeAviso, pedidoCombina, type PedidoDoBanco } from './esperaAviso';

export const JANELA_CARRO_NOVO_H = 48;
export const MAX_AVISOS_POR_RODADA = 3;

export interface ResumoEspera {
    ok: boolean;
    modo: string;
    motivo?: string;
    carrosNoFeed: number;
    carrosNovos: number;
    pedidos: number;
    avisados: number;
    soConsultor: number;
    ensaio: number;
    puladas: Record<string, number>;
    erros: number;
}

export async function rodarEspera(
    supabase: SupabaseClient,
    opts: { agora?: Date; esperar?: (ms: number) => Promise<void>; feed?: AltimusVehicle[] } = {},
): Promise<ResumoEspera> {
    const agora = opts.agora ?? new Date();
    const esperar = opts.esperar ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
    const r: ResumoEspera = { ok: true, modo: 'desligada', carrosNoFeed: 0, carrosNovos: 0, pedidos: 0, avisados: 0, soConsultor: 0, ensaio: 0, puladas: {}, erros: 0 };
    const pular = (m: string) => { r.puladas[m] = (r.puladas[m] || 0) + 1; };

    // 1. feed + snapshot. Feed vazio/fora do ar NUNCA é "estoque zerado": não mexe em nada.
    // Carro sem id_externo fica de fora: o id improvisado (nome+preço) mudaria com o preço e pareceria carro novo.
    const bruto = opts.feed ?? await getInventory().catch(() => [] as AltimusVehicle[]);
    const feed = bruto.filter(v => v.id_externo && v.marca && v.modelo);
    r.carrosNoFeed = feed.length;
    if (!feed.length) return { ...r, ok: false, motivo: 'feed da Altimus vazio ou fora do ar' };

    const { count } = await supabase.from('estoque_snapshot').select('id_externo', { count: 'exact', head: true });
    const primeiraVez = (count ?? 0) === 0;
    const agoraIso = agora.toISOString();
    const linhas = feed.map(v => ({
        id_externo: String(v.id_externo), descricao: carroParaIa(v).carro.slice(0, 120), ultimo_visto_em: agoraIso,
        ...(primeiraVez ? { primeiro_visto_em: '1970-01-01T00:00:00Z' } : {}),
    }));
    const { error: eSnap } = await supabase.from('estoque_snapshot').upsert(linhas, { onConflict: 'id_externo' });
    if (eSnap) return { ...r, ok: false, motivo: `snapshot: ${eSnap.message}` };
    if (primeiraVez) return { ...r, motivo: 'primeira execução: estoque atual registrado, ninguém avisado' };

    // 2. carros novos
    const desde = new Date(agora.getTime() - JANELA_CARRO_NOVO_H * 3_600_000).toISOString();
    const { data: recentes } = await supabase.from('estoque_snapshot').select('id_externo, primeiro_visto_em')
        .gte('primeiro_visto_em', desde).order('primeiro_visto_em', { ascending: false });
    const ordem = new Map((recentes || []).map((x, i) => [String(x.id_externo), i]));
    const novos = feed.filter(v => ordem.has(String(v.id_externo)))
        .sort((a, b) => ordem.get(String(a.id_externo))! - ordem.get(String(b.id_externo))!);
    r.carrosNovos = novos.length;

    // pedidos vencidos saem da lista
    await supabase.from('carro_espera').update({ status: 'expirado', atualizado_em: agoraIso }).eq('status', 'aguardando').lt('expira_em', agoraIso);
    if (!novos.length) return { ...r, motivo: 'nenhum carro novo' };

    const cfg = await lerConfigIa(supabase);
    r.modo = cfg.modo;
    if (cfg.modo === 'desligada') return { ...r, motivo: cfg.motivo || 'Laura desligada' };
    const horario = await horarioLoja(supabase);
    if (cfg.modo === 'envia' && !isOpenNow(agora, horario.horas, horario.feriados)) return { ...r, motivo: 'fora do horário da loja' };

    const { data: pedidos } = await supabase.from('carro_espera')
        .select('id, telefone_key, lead_uid, conversa_id, consultor_id, nome_cliente, texto_original, ano_min, preco_max, cambio')
        .eq('status', 'aguardando').order('criado_em', { ascending: true }).limit(300);
    r.pedidos = pedidos?.length ?? 0;

    const dia = inicioDoDiaSP(agora).toISOString();
    let enviouNaRodada = 0;
    for (const p of (pedidos || []) as PedidoDoBanco[]) {
        const carro = novos.find(v => pedidoCombina(p, v));
        if (!carro) continue;
        try {
            // 1 aviso por cliente por dia
            const { data: hoje } = await supabase.from('carro_espera').select('id')
                .eq('telefone_key', p.telefone_key).eq('status', 'avisado').gte('avisado_em', dia).limit(1);
            if (hoje?.length) { pular('cliente já avisado hoje'); continue; }
            if (await leadFechado(supabase, p.lead_uid)) {
                if (cfg.modo === 'envia') await supabase.from('carro_espera').update({ status: 'atendido', atualizado_em: agoraIso }).eq('id', p.id);
                pular('lead já fechado'); continue;
            }
            const { data: conv } = await supabase.from('wa_conversas')
                .select('id, remote_jid, status, assigned_consultant_id').eq('telefone_key', p.telefone_key).maybeSingle();
            const consultor = p.consultor_id || (conv?.assigned_consultant_id as string | null) || null;
            const laura = conv?.status === 'ia';
            if (!laura && !consultor) { pular('sem conversa com a Laura e sem consultor'); continue; }
            if (cfg.modo !== 'envia') { r.ensaio++; continue; }

            if (laura) {
                if (enviouNaRodada >= MAX_AVISOS_POR_RODADA) { pular('teto da rodada'); continue; }
                if (enviouNaRodada > 0) await esperar(ESPERA_ENTRE_ENVIOS_MS);
                const env = await enviarPeloCrm(
                    supabase, providerLoja(),
                    { id: conv!.id as string, telefone_key: p.telefone_key, remote_jid: (conv!.remote_jid as string | null) ?? null },
                    { tipo: 'texto', texto: mensagemDeAviso(p, carro) }, { autor: 'laura' },
                );
                if (!env.ok) { r.erros++; break; }   // disjuntor: para no primeiro erro de envio
                enviouNaRodada++; r.avisados++;
            } else r.soConsultor++;

            await supabase.from('carro_espera').update({
                status: 'avisado', avisado_em: agoraIso, veiculo_id_avisado: String(carro.id_externo), atualizado_em: agoraIso,
            }).eq('id', p.id);
            if (consultor) {
                await enviarPushParaConsultor(consultor, {
                    titulo: 'Entrou o carro que o cliente procurava',
                    corpo: `${p.nome_cliente || 'Cliente'} esperava: ${p.texto_original.slice(0, 60)}. Chegou: ${carroParaIa(carro).carro}`.slice(0, 140),
                    url: conv ? `/conversas?c=${conv.id}` : '/leads',
                    tag: `espera-${p.id}`,
                }).catch(() => null);
            }
        } catch (e) {
            r.erros++;
            console.error('[wa-espera]', msgErro(e));
        }
    }
    return r;
}
