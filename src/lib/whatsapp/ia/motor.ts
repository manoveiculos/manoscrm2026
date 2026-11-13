// src/lib/whatsapp/ia/motor.ts — a Laura rodando DENTRO do CRM (etapa B: ensaio)
//
// Quem chama: POST /api/wa/ingest, depois de responder ao n8n (after), para
// cada mensagem nova de cliente.
//
// Uma rodada:
//   1. modo (config.ts): desligada → não faz nada;
//   2. espera ~8 s para juntar mensagens seguidas; se chegou outra do cliente
//      depois desta, quem responde é a rodada da mais nova;
//   3. espera a transcrição de áudio (até 45 s);
//   4. conversa com humano/encerrada ou limite do dia → não roda;
//   5. trava por conversa (índice único parcial em wa_ia_execucoes);
//   6. Claude Sonnet 5.5 com as ferramentas (ferramentas.ts);
//   7. filtro de regras (guardrails.ts) no texto final;
//   8. grava o rascunho, ferramentas, tokens, custo e tempo em wa_ia_execucoes.
//
// ENSAIO: NADA vai para o cliente. O envio (etapa C) só existe com
// WA_IA_ENVIO_LIBERADO=true no servidor E o botão em "envia".

import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/admin';
import { agenteLigado } from '@/lib/agentes/config';
import { getInventory } from '@/lib/services/altimusInventory';
import { precosAnunciadosDoEstoque } from '@/lib/estoque';
import { horarioLoja, isOpenNow } from '@/lib/services/slaEngine';
import { revisarResposta } from '@/lib/laura/guardrails';
import { entradaEmReais, parseValorBR } from '@/lib/qualificacao';
import { enviarPushParaConsultor } from '@/lib/push/enviarPush';
import { providerLoja } from '../evolutionProvider';
import { enviarPeloCrm } from '../envio';
import { notifyConsultant } from '@/lib/services/consultantNotifier';
import { msgErro } from '../erro';
import { lerConfigIa } from './config';
import { FERRAMENTAS, executarFerramenta, type ContextoRodada, type ConversaIa } from './ferramentas';
import { LAURA_CRM_PROMPT, contextoDaRodada } from './prompt';
import { descartarNaoCliente, liberarDaTriagem } from './triagemRodada';
import {
    custoUsd, iaPodeResponder, inicioDoDiaSP, limiteDiario, montarHistorico, somarUso, textoParaIa,
    comentaAtendimentoAnterior, respostaLonga, repeteMensagemAnterior, valoresCitados, type FichaLaura, type MensagemParaIa, type UsoTokens,
} from './regras';

export const MODELO_PADRAO = 'claude-sonnet-5-5';
const MAX_ITERACOES = 6;
/** Silêncio do cliente antes de a Laura responder (pedido do Alexandre, 13/11/2026: pelo menos 20 s). */
export const ESPERA_PADRAO_MS = 20_000;
const TRAVA_VENCIDA_MS = 3 * 60_000;

export interface GatilhoIa {
    conversaId: string;
    mensagemId: string;
    criadaEm: string;
}

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms));

let clienteClaude: Anthropic | null = null;
export function claude(): Anthropic | null {
    if (clienteClaude) return clienteClaude;
    const apiKey = (process.env.API_CLAUDE || process.env.ANTHROPIC_API_KEY || '').trim();
    if (!apiKey) return null;
    clienteClaude = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });
    return clienteClaude;
}

/** Chamado pela ingestão: uma rodada por conversa (a da mensagem mais nova). */
export async function rodarLauraDepoisDaIngestao(gatilhos: GatilhoIa[]): Promise<void> {
    if (!gatilhos.length) return;
    const porConversa = new Map<string, GatilhoIa>();
    for (const g of gatilhos) {
        const atual = porConversa.get(g.conversaId);
        if (!atual || g.criadaEm > atual.criadaEm) porConversa.set(g.conversaId, g);
    }
    await Promise.all([...porConversa.values()].map(g => rodarLaura(g).catch(e => {
        console.error('[laura-crm] rodada falhou:', msgErro(e));
    })));
}

async function ultimaDoCliente(supabase: SupabaseClient, conversaId: string): Promise<{ id: string; criada_em: string } | null> {
    const { data } = await supabase.from('wa_mensagens')
        .select('id, criada_em')
        .eq('conversa_id', conversaId).eq('autor', 'cliente').neq('tipo', 'reacao')
        .order('criada_em', { ascending: false }).limit(1).maybeSingle();
    return data ?? null;
}

/** Áudio do cliente ainda sem transcrição (nem tentativa, nem erro de mídia): espera até 45 s. */
async function esperarTranscricoes(supabase: SupabaseClient, conversaId: string): Promise<void> {
    const desde = new Date(Date.now() - 10 * 60_000).toISOString();
    for (let i = 0; i < 15; i++) {
        const { count } = await supabase.from('wa_mensagens')
            .select('id', { count: 'exact', head: true })
            .eq('conversa_id', conversaId).eq('autor', 'cliente').eq('tipo', 'audio')
            .is('transcricao', null).eq('transcricao_tentativas', 0).is('midia_erro', null)
            .gte('criada_em', desde);
        if (!count) return;
        await esperar(3000);
    }
}

async function travar(supabase: SupabaseClient, g: GatilhoIa, modo: 'ensaio' | 'envia', modelo: string): Promise<string | null> {
    await supabase.from('wa_ia_execucoes')
        .update({ status: 'abandonada', motivo: 'travada há mais de 3 min', terminada_em: new Date().toISOString() })
        .eq('conversa_id', g.conversaId).eq('status', 'rodando')
        .lt('iniciada_em', new Date(Date.now() - TRAVA_VENCIDA_MS).toISOString());

    for (let tentativa = 0; tentativa < 4; tentativa++) {
        const { data, error } = await supabase.from('wa_ia_execucoes')
            .insert({ conversa_id: g.conversaId, gatilho_mensagem_id: g.mensagemId, modo, modelo, status: 'rodando' })
            .select('id').single();
        if (!error && data) return data.id as string;
        if (error && error.code !== '23505') throw new Error(`trava: ${error.message}`);
        // outra rodada desta conversa em andamento: espera e confere se ainda somos a mais nova
        await esperar(8000);
        const u = await ultimaDoCliente(supabase, g.conversaId);
        if (u?.id !== g.mensagemId) return null;
    }
    return null;
}

async function registrarPulada(supabase: SupabaseClient, g: GatilhoIa, modo: 'ensaio' | 'envia', motivo: string): Promise<void> {
    await supabase.from('wa_ia_execucoes').insert({
        conversa_id: g.conversaId, gatilho_mensagem_id: g.mensagemId, modo, status: 'pulada', motivo,
        terminada_em: new Date().toISOString(),
    });
}

// Preços anunciados: feed da Altimus (a tabela `estoque` está obsoleta).
async function precosDoEstoque(): Promise<number[]> {
    return precosAnunciadosDoEstoque();
}

const COLUNAS_CONVERSA =
    'id, lead_uid, nome_contato, nome_cliente, nome_cliente_origem, nome_ia_no_lead, cidade, ficha, assigned_consultant_id, telefone_key, remote_jid, status, ia_silenciada_ate';

export async function rodarLaura(g: GatilhoIa): Promise<void> {
    const supabase = createClient();
    const cfg = await lerConfigIa(supabase);
    if (cfg.modo === 'desligada') return;
    const modo = cfg.modo;
    const modelo = (process.env.WA_IA_MODELO || MODELO_PADRAO).trim();

    // Interruptor geral da Central dos Agentes (agentes_config.ia_geral): desligado = a Laura
    // não roda, nem em ensaio. Sem tabela ou sem linha = ligado (agenteLigado nunca lança).
    const geral = await agenteLigado('ia_geral');
    if (!geral.ligado) {
        await registrarPulada(supabase, g, modo, 'ia_geral desligada');
        return;
    }

    // 2. junta mensagens seguidas: espera ESPERA_PADRAO_MS (20 s) de silêncio. Se o cliente mandou outra
    // mensagem nesse tempo, esta rodada desiste e a da mensagem mais nova responde UMA vez por todas.
    await esperar(Number(process.env.WA_IA_ESPERA_MS) || ESPERA_PADRAO_MS);
    const ultima = await ultimaDoCliente(supabase, g.conversaId);
    if (!ultima || ultima.id !== g.mensagemId) return;

    // 3. áudio: espera a transcrição
    await esperarTranscricoes(supabase, g.conversaId);

    // 4. pode responder?
    const { data: convRow, error: convErr } = await supabase.from('wa_conversas').select(COLUNAS_CONVERSA).eq('id', g.conversaId).maybeSingle();
    if (convErr || !convRow) return;
    if (!iaPodeResponder({ status: convRow.status, iaSilenciadaAte: convRow.ia_silenciada_ate })) return;

    const { count: rodadasHoje } = await supabase.from('wa_ia_execucoes')
        .select('id', { count: 'exact', head: true })
        .gte('iniciada_em', inicioDoDiaSP().toISOString())
        .in('status', ['ok', 'erro', 'rodando']);
    if ((rodadasHoje || 0) >= limiteDiario(process.env.WA_IA_LIMITE_DIA)) {
        await registrarPulada(supabase, g, modo, 'limite_diario');
        return;
    }

    // 5. trava
    const execId = await travar(supabase, g, modo, modelo);
    if (!execId) return;

    const inicio = Date.now();
    let uso: UsoTokens = { input_tokens: 0, output_tokens: 0 };
    let iteracoes = 0;
    const conversa: ConversaIa = { ...(convRow as unknown as ConversaIa), ficha: (convRow.ficha || {}) as FichaLaura };
    const ctx: ContextoRodada = {
        supabase, modo, agora: new Date(), conversa,
        textosDoCliente: [], estoque: [], horario: { horas: { seg_sex: [8, 18], sab: [8, 12], tz: 'America/Sao_Paulo' }, feriados: new Set() },
        ficha: conversa.ficha, fotos: [], agendamento: null, passagem: null, naoCliente: null, chamadas: [], gravacoes: [],
    };

    const finalizar = async (campos: Record<string, unknown>) => {
        const { error } = await supabase.from('wa_ia_execucoes').update({
            ferramentas: ctx.chamadas,
            fotos: ctx.fotos.length ? ctx.fotos : null,
            agendamento: ctx.agendamento,
            passagem: ctx.passagem,
            ficha: ctx.ficha,
            tokens_entrada: uso.input_tokens,
            tokens_saida: uso.output_tokens,
            tokens_cache_leitura: uso.cache_read_input_tokens || 0,
            tokens_cache_escrita: uso.cache_creation_input_tokens || 0,
            custo_usd: custoUsd(uso),
            tempo_ms: Date.now() - inicio,
            iteracoes,
            terminada_em: new Date().toISOString(),
            ...campos,
        }).eq('id', execId);
        if (error) console.error('[laura-crm] não gravei a rodada:', error.message);
    };

    try {
        const cliente = claude();
        if (!cliente) { await finalizar({ status: 'erro', motivo: 'sem chave do Claude (API_CLAUDE)' }); return; }

        // histórico + contexto
        const { data: msgsDesc } = await supabase.from('wa_mensagens')
            .select('autor, tipo, texto, legenda, transcricao, midia_nome, apagada_em, criada_em')
            .eq('conversa_id', g.conversaId).order('criada_em', { ascending: false }).limit(80);
        const msgs: MensagemParaIa[] = (msgsDesc || []).map(m => ({
            autor: m.autor, tipo: m.tipo, texto: m.texto, legenda: m.legenda, transcricao: m.transcricao,
            midiaNome: m.midia_nome, apagadaEm: m.apagada_em, criadaEm: m.criada_em,
        }));
        const turnos = montarHistorico(msgs, 40);
        if (!turnos.length) { await finalizar({ status: 'pulada', motivo: 'sem mensagem do cliente para responder' }); return; }
        ctx.textosDoCliente = msgs.filter(m => m.autor === 'cliente').map(m => textoParaIa(m) || '').filter(Boolean);

        const [estoque, horario] = await Promise.all([getInventory(), horarioLoja(supabase)]);
        ctx.estoque = estoque;
        ctx.horario = horario;

        let consultor: string | null = null;
        if (conversa.assigned_consultant_id) {
            const { data: cn } = await supabase.from('consultants_manos_crm').select('name').eq('id', conversa.assigned_consultant_id).maybeSingle();
            consultor = (cn?.name as string | null) ?? null;
        }
        const bloco = contextoDaRodada({
            consultor,
            agora: ctx.agora,
            lojaAberta: isOpenNow(ctx.agora, horario.horas, horario.feriados),
            nomePerfilWhatsapp: conversa.nome_contato,
            ficha: { ...ctx.ficha, nome: ctx.ficha.nome || conversa.nome_cliente || null },
        });
        const messages: Anthropic.MessageParam[] = turnos.map(t => ({ role: t.role, content: t.content }));
        const ultimoTurno = messages[messages.length - 1];
        ultimoTurno.content = `${ultimoTurno.content as string}\n\n${bloco}`;

        // 6. laço do Claude
        let texto = '';
        let parada: string | null = null;
        // Últimas 3 mensagens da loja (Laura ou vendedor): a resposta não pode repetir nenhuma
        const anteriores = msgs.filter(m => m.autor === 'laura' || m.autor === 'vendedor')
            .slice(0, 3).map(m => textoParaIa(m) || '');
        let repeticaoTratada = false;
        let comentarioTratado = false;
        let longaTratada = false;
        while (iteracoes < MAX_ITERACOES) {
            iteracoes++;
            // Sonnet 5.5: pensamento adaptativo (padrão) em esforço baixo. O pensamento
            // conta no max_tokens; 4096 é teto de segurança (paga-se só o que usar).
            // Blocos de pensamento voltam intactos no laço (resp.content inteiro).
            const resp = await cliente.messages.create({
                model: modelo,
                max_tokens: 4096,
                system: [{ type: 'text', text: LAURA_CRM_PROMPT, cache_control: { type: 'ephemeral' } }],
                tools: FERRAMENTAS,
                messages,
                output_config: { effort: 'low' },
            });
            uso = somarUso(uso, resp.usage);
            parada = resp.stop_reason;
            if (resp.stop_reason === 'tool_use') {
                messages.push({ role: 'assistant', content: resp.content });
                const resultados: Anthropic.ToolResultBlockParam[] = [];
                for (const b of resp.content) {
                    if (b.type !== 'tool_use') continue;
                    const r = await executarFerramenta(b.name, b.input, ctx);
                    resultados.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(r.saida), ...(r.erro ? { is_error: true } : {}) });
                }
                messages.push({ role: 'user', content: resultados });
                continue;
            }
            texto = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n').trim();
            if (!repeticaoTratada && texto && repeteMensagemAnterior(texto, anteriores)) {
                // repetiu: pede UMA nova tentativa, só com o que o cliente acabou de escrever
                repeticaoTratada = true;
                messages.push({ role: 'assistant', content: resp.content });
                messages.push({ role: 'user', content: '<aviso_do_crm>Essa resposta repete o que a loja já disse ou já perguntou. Reescreva respondendo só ao que o cliente acabou de escrever, sem repetir carros, preços, correções nem a pergunta anterior. Se não houver nada novo a perguntar, faça só a próxima etapa (ex.: oferecer fotos ou a visita).</aviso_do_crm>' });
                texto = '';
                continue;
            }
            if (!longaTratada && texto && respostaLonga(texto)) {
                // longa demais: pede UMA versão curta (máx. 2 frases), mantendo só o essencial
                longaTratada = true;
                messages.push({ role: 'assistant', content: resp.content });
                messages.push({ role: 'user', content: '<aviso_do_crm>Essa resposta ficou longa. Reescreva em no máximo 2 frases curtas (uns 200 caracteres), só com o essencial e uma pergunta no máximo. Sem repetir o que o cliente disse.</aviso_do_crm>' });
                texto = '';
                continue;
            }
            if (!comentarioTratado && texto && comentaAtendimentoAnterior(texto)) {
                // apontou erro de quem atendeu antes: pede UMA reescrita só com a informação certa
                comentarioTratado = true;
                messages.push({ role: 'assistant', content: resp.content });
                messages.push({ role: 'user', content: '<aviso_do_crm>Essa resposta comenta ou corrige o atendimento anterior. Reescreva dando só a informação certa, sem dizer que algo estava errado, sem "corrigindo", sem parênteses explicando. Mantenha o resto da resposta.</aviso_do_crm>' });
                texto = '';
                continue;
            }
            break;
        }

        if (parada === 'refusal') { await finalizar({ status: 'erro', motivo: 'o modelo recusou responder' }); return; }
        if (parada === 'tool_use') { await finalizar({ status: 'erro', motivo: `passou de ${MAX_ITERACOES} chamadas de ferramenta` }); return; }
        texto = texto.replace(/<\/?contexto_do_crm>/g, '').trim();
        if (!texto) { await finalizar({ status: 'erro', motivo: parada === 'max_tokens' ? 'resposta cortada (max_tokens)' : 'resposta vazia' }); return; }

        // 7. filtro de regras
        const precos = await precosDoEstoque();
        const valoresCliente = valoresCitados(ctx.textosDoCliente);
        const entrada = entradaEmReais(ctx.ficha.entrada);
        if (entrada) valoresCliente.push(entrada);
        const rev = revisarResposta(texto, precos, valoresCliente, { fraseDeCredito: false });

        // 8. grava (e, só na etapa C, envia)
        let envio: Record<string, unknown> = {};
        if (modo === 'envia') envio = await executarEnvio(supabase, ctx, g, rev.texto_seguro);

        await finalizar({
            status: 'ok',
            motivo: parada === 'max_tokens' ? 'resposta cortada (max_tokens)' : null,
            texto_original: texto,
            texto_final: rev.texto_seguro,
            violacoes: rev.violacoes,
            ...envio,
        });
    } catch (e) {
        await finalizar({ status: 'erro', motivo: msgErro(e).slice(0, 300) });
        if (modo === 'envia') await falhaDaIa(supabase, conversa, g.conversaId);
    }
}

/**
 * A IA falhou com o cliente esperando (só no modo "envia"): manda UMA mensagem de espera
 * (no máximo 1 a cada 30 min por conversa) e avisa o consultor para assumir.
 */
async function falhaDaIa(supabase: SupabaseClient, conversa: ConversaIa, conversaId: string): Promise<void> {
    try {
        // a IA falhou: lead preso na triagem nunca fica parado, vai para a roleta
        if (conversa.lead_uid) await liberarDaTriagem(supabase, conversa.lead_uid, 'laura_indisponivel', { contatado: true, respondeu: true }).catch(() => false);
        if ((process.env.WA_IA_ENVIO_LIBERADO || '').trim() !== 'true') return;
        const desde = new Date(Date.now() - 30 * 60_000).toISOString();
        const { count } = await supabase.from('wa_mensagens').select('id', { count: 'exact', head: true })
            .eq('conversa_id', conversaId).eq('autor', 'laura').ilike('texto', '%Já te respondo%').gte('criada_em', desde);
        if (!count) {
            await enviarPeloCrm(supabase, providerLoja(), { id: conversaId, telefone_key: conversa.telefone_key, remote_jid: conversa.remote_jid }, { tipo: 'texto', texto: 'Já te respondo 😉' }, { autor: 'laura' });
        }
        if (conversa.assigned_consultant_id) {
            await notifyConsultant({
                consultantId: conversa.assigned_consultant_id, level: 2,
                title: 'A Laura não conseguiu responder um cliente',
                message: 'A IA falhou numa conversa do WhatsApp. Assuma o atendimento na tela Conversas.',
                type: 'laura_falhou',
            });
        }
    } catch (e) {
        console.error('[laura-crm] falha ao tratar erro da IA:', msgErro(e));
    }
}

// ---------------------------------------------------------------------------
// Etapa C (BLOQUEADA): só roda com WA_IA_ENVIO_LIBERADO=true e o botão em "envia"
// ---------------------------------------------------------------------------

async function executarEnvio(supabase: SupabaseClient, ctx: ContextoRodada, g: GatilhoIa, texto: string): Promise<Record<string, unknown>> {
    if ((process.env.WA_IA_ENVIO_LIBERADO || '').trim() !== 'true') return { motivo: 'envio bloqueado' };
    // Releitura: o vendedor pode ter assumido ou o cliente mandado outra mensagem enquanto a Laura pensava.
    const { data: c } = await supabase.from('wa_conversas').select('status, ia_silenciada_ate').eq('id', ctx.conversa.id).maybeSingle();
    if (!c || !iaPodeResponder({ status: c.status, iaSilenciadaAte: c.ia_silenciada_ate })) return { motivo: 'não enviada: conversa com humano' };
    const u = await ultimaDoCliente(supabase, g.conversaId);
    if (u?.id !== g.mensagemId) return { motivo: 'não enviada: cliente mandou outra mensagem' };

    const provider = providerLoja();
    const para = ctx.conversa.remote_jid || ctx.conversa.telefone_key;
    const conv = { id: ctx.conversa.id, telefone_key: ctx.conversa.telefone_key, remote_jid: ctx.conversa.remote_jid };
    // Pausa de digitação natural: ~35 ms por caractere, entre 1,5 s e 7 s.
    await esperar(Math.min(7000, Math.max(1500, texto.length * 35)));
    const r = await enviarPeloCrm(supabase, provider, conv, { tipo: 'texto', texto }, { autor: 'laura' });
    if (!r.ok) return { motivo: `envio falhou: ${r.erro || 'sem detalhe'}` };

    for (const f of ctx.fotos) {
        for (const url of f.urls) {
            await esperar(1500);
            const foto = await provider.enviarMidia(para, { tipo: 'imagem', url, mime: 'image/jpeg' }).catch(() => null);
            if (foto?.ok && foto.providerMessageId) {
                // registra como da Laura (senão o eco do webhook entraria como "celular da loja")
                await supabase.rpc('wa_registrar_mensagem', { p: {
                    telefone: conv.telefone_key, remote_jid: conv.remote_jid, provider_message_id: foto.providerMessageId,
                    autor: 'laura', tipo: 'imagem', midia_mime: 'image/jpeg', status_entrega: 'enviada', origem: 'crm', criada_em: new Date().toISOString(),
                } });
                await supabase.from('wa_mensagens').update({ autor: 'laura', origem: 'crm' }).eq('provider_message_id', foto.providerMessageId);
            }
        }
    }
    if (ctx.agendamento && !ctx.agendamento.gravada) {
        let vendedorAuth: string | null = null;
        if (ctx.conversa.assigned_consultant_id) {
            const { data: v } = await supabase.from('consultants_manos_crm').select('auth_id').eq('id', ctx.conversa.assigned_consultant_id).maybeSingle();
            vendedorAuth = (v?.auth_id as string | null) ?? null;
        }
        const { error } = await supabase.from('agendamentos').insert({
            lead_uid: ctx.conversa.lead_uid,
            cliente_nome: ctx.ficha.nome || ctx.conversa.nome_cliente || ctx.conversa.nome_contato,
            veiculo_interesse: ctx.ficha.carro_interesse || null,
            data_hora: ctx.agendamento.iso,
            observacoes: 'Agendado pela Laura (CRM)',
            status: 'agendado',
            vendedor_id: vendedorAuth,
        });
        ctx.agendamento.gravada = !error;
    }
    // Contato que não é cliente de carro: arquiva o lead e encerra a conversa, sem avisar nem cobrar consultor
    if (ctx.naoCliente && !ctx.passagem) {
        if (ctx.conversa.lead_uid) await descartarNaoCliente(supabase, ctx.conversa.lead_uid, ctx.conversa.id, { tipo: ctx.naoCliente.tipo, resumo: ctx.naoCliente.resumo }).catch(() => false);
        else await supabase.from('wa_conversas').update({ status: 'encerrada' }).eq('id', ctx.conversa.id);
        ctx.naoCliente.executada = true;
    }
    if (ctx.passagem) {
        await supabase.from('wa_conversas').update({ status: 'humano' }).eq('id', ctx.conversa.id);
        await enviarPushParaConsultor(ctx.conversa.assigned_consultant_id, {
            titulo: 'Laura passou um cliente para você',
            corpo: ctx.passagem.resumo.slice(0, 140),
            url: `/conversas?c=${ctx.conversa.id}`,
            tag: `wa-${ctx.conversa.id}`,
        }).catch(() => null);
        ctx.passagem.executada = true;
        // Lead de anúncio preso na triagem da Laura: qualificado → solta para a roleta, com o resumo.
        if (ctx.conversa.lead_uid) {
            const f = ctx.ficha as Record<string, unknown>;
            await liberarDaTriagem(supabase, ctx.conversa.lead_uid, ctx.passagem.motivo === 'pediu_humano' ? 'pediu_humano' : 'qualificado', {
                resumoDaLaura: ctx.passagem.resumo, nome: (ctx.ficha.nome as string | null) || ctx.conversa.nome_cliente || ctx.conversa.nome_contato,
                interesse: typeof f.carro_interesse === 'string' ? f.carro_interesse : null, contatado: true, respondeu: true,
            }).catch(() => false);
        }
    }
    return { enviada: true, provider_message_id: r.providerMessageId };
}
