// src/lib/whatsapp/ia/ferramentas.ts — ferramentas da Laura no CRM
//
// As ferramentas devolvem a MESMA resposta no ensaio e no envio, para a Laura
// se comportar igual nos dois modos. A diferença fica do lado de cá:
//   ensaio → só anota o que faria (fotos, agenda, passagem ao consultor);
//   envia  → executa (bloqueado até a etapa C, ver config.ts).
// Exceção combinada com o Alexandre (06/11): nome e cidade que o cliente disse
// são gravados no lead já no ensaio, com as travas de podeGravarNomeNoLead.

import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AltimusVehicle } from '@/lib/services/altimusInventory';
import type { HorarioConfig } from '@/lib/services/slaEngine';
import { businessSecondsBetween, isOpenNow } from '@/lib/services/slaEngine';
import { horariosDeVisitaDetalhados } from '@/lib/laura/playbook';
import type { PedidoEspera } from './espera';
import { acharCarro, buscarNoEstoque, carroParaIa } from './estoque';
import {
    ROTULO_CAMPO, faltandoNaFicha, limparNome, mesclarFicha, nomeDitoPeloCliente,
    type FichaLaura, type FichaTroca, type FormaPagamento,
} from './regras';
import { msgErro } from '../erro';
import { SEM_ENTRADA, SEM_TROCA, entradaEmReais, normalizarPrazo, type QualificacaoCampos } from '@/lib/qualificacao';
import { buscarQualificacao, salvarQualificacao, tabelaSuportaQualificacao } from '@/lib/services/qualificacaoService';
import { atualizarNomeLead, registrarInteresse } from '@/lib/identificacao/gravar';
import { gravarInteresseGenerico } from '@/lib/identificacao/interesseGenerico';
import { identificacaoLigada } from '@/lib/identificacao/chave';
import { carrosCitados, descricaoDoFeed, type CarroInteresse } from '@/lib/identificacao/veiculo';

// ---------------------------------------------------------------------------
// Definições (o que o Claude vê)
// ---------------------------------------------------------------------------

export const FERRAMENTAS: Anthropic.Tool[] = [
    {
        name: 'buscar_estoque',
        description: 'Busca carros no estoque atual da loja (feed da Altimus). Use antes de falar de qualquer carro, preço ou km. Devolve até 5 carros com id, preço e km exatos; se nada bater, devolve opções parecidas.',
        input_schema: {
            type: 'object',
            properties: {
                consulta: { type: 'string', description: 'Marca, modelo ou tipo que o cliente pediu. Ex.: "onix", "hilux", "sedan automático", "suv", "picape", "hatch".' },
                preco_max: { type: 'number', description: 'Valor máximo em reais, se o cliente disse. Ex.: 60000.' },
                ano_min: { type: 'integer', description: 'Ano mínimo, se o cliente disse.' },
                cambio: { type: 'string', description: '"automático" ou "manual", se o cliente disse.' },
            },
        },
    },
    {
        name: 'registrar_espera',
        description: 'Coloca o cliente na lista de espera de um carro que a loja NÃO tem agora, para ser avisado quando entrar. Só use depois de buscar_estoque não achar o carro (o CRM já anota sozinho; use esta para completar marca, modelo, tipo ou faixa de preço). Nunca prometa prazo de chegada.',
        input_schema: {
            type: 'object',
            properties: {
                consulta: { type: 'string', description: 'O carro como o cliente pediu. Ex.: "Civic automático", "SUV até 80 mil".' },
                marca: { type: 'string' },
                modelo: { type: 'string' },
                tipo: { type: 'string', description: 'Tipo, se pediu pelo tipo: suv, sedã, hatch, picape.' },
                ano_min: { type: 'integer' },
                preco_max: { type: 'number', description: 'Só se o cliente disse.' },
                cambio: { type: 'string', description: '"automático" ou "manual", se o cliente disse.' },
            },
            required: ['consulta'],
        },
    },
    {
        name: 'enviar_fotos',
        description: 'Envia ao cliente as fotos reais do anúncio de um carro do estoque. Use o id que buscar_estoque devolveu.',
        input_schema: {
            type: 'object',
            properties: {
                veiculo_id: { type: 'string', description: 'id do carro devolvido por buscar_estoque.' },
                quantidade: { type: 'integer', minimum: 1, maximum: 6, description: 'Quantas fotos (padrão 4).' },
            },
            required: ['veiculo_id'],
        },
    },
    {
        name: 'salvar_ficha',
        description: 'Anota na ficha do cliente o que ele acabou de informar (só o que ele disse, nada inventado). Chame a cada resposta com dado novo, inclusive o nome. Devolve o que ainda falta perguntar.',
        input_schema: {
            type: 'object',
            properties: {
                nome: { type: 'string', description: 'Nome que o cliente disse. Nunca o nome do perfil do WhatsApp.' },
                cidade: { type: 'string' },
                carro_interesse: { type: 'string', description: 'Carro que ele quer, como ele disse.' },
                veiculo_id: { type: 'string', description: 'id do estoque, se o carro foi confirmado com buscar_estoque.' },
                forma_pagamento: { type: 'string', enum: ['a_vista', 'financiado', 'troca', 'nao_sabe'] },
                entrada: { type: 'string', description: 'Entrada em R$, como o cliente disse. Ex.: "20 mil", "sem entrada".' },
                tem_troca: { type: 'boolean', description: 'true se tem carro para dar na troca; false se disse que não tem.' },
                troca: {
                    type: 'object',
                    description: 'Carro do cliente para a troca. Só anote: nunca avalie.',
                    properties: {
                        marca: { type: 'string' }, modelo: { type: 'string' }, ano: { type: 'string' },
                        km: { type: 'string' }, cor: { type: 'string' }, estado: { type: 'string' },
                    },
                },
                prazo: { type: 'string', description: 'Quando pretende comprar: esta semana, este mês, 1 a 3 meses, só pesquisando.' },
            },
        },
    },
    {
        name: 'agendar_visita',
        description: 'Sem "horario": devolve sugestões de horário (manhã e tarde, próximos dias; ofereça 2). Com "horario": confirma a visita nesse horário. QUALQUER horário com a loja aberta vale, não só os sugeridos: se o cliente pedir um dia ou período ("sábado de manhã", "fim da tarde"), chame com esse horário.',
        input_schema: {
            type: 'object',
            properties: {
                horario: { type: 'string', description: 'Data e hora escolhidas, em ISO 8601 com fuso -03:00. Ex.: 2026-11-07T10:00:00-03:00.' },
            },
        },
    },
    {
        name: 'encerrar_contato',
        description: 'Use quando o contato NÃO é cliente de carro: empresa oferecendo serviço ou divulgação, vendedor de outra coisa, spam, engano, assunto jurídico ou de cobrança, brincadeira. Não chame passar_para_consultor nesses casos: o consultor não deve ser incomodado.',
        input_schema: {
            type: 'object',
            properties: {
                tipo: { type: 'string', enum: ['oferta_de_servico', 'spam', 'engano', 'assunto_juridico_ou_cobranca', 'brincadeira', 'outro'] },
                resumo: { type: 'string', description: 'Uma frase: quem é e o que queria.' },
            },
            required: ['tipo', 'resumo'],
        },
    },
    {
        name: 'passar_para_consultor',
        description: 'Passa a conversa para um consultor da loja. Use quando a visita for confirmada, quando o cliente pedir para falar com uma pessoa ou quando pedir algo que você não pode fazer (avaliação, parcela, desconto, reserva).',
        input_schema: {
            type: 'object',
            properties: {
                motivo: { type: 'string', enum: ['visita_confirmada', 'pediu_pessoa', 'fora_do_que_posso', 'outro'] },
                resumo: { type: 'string', description: 'Uma ou duas frases para o consultor: quem é o cliente e o que ele quer.' },
            },
            required: ['motivo', 'resumo'],
        },
    },
];

// ---------------------------------------------------------------------------
// Estado da rodada
// ---------------------------------------------------------------------------

export interface ConversaIa {
    id: string;
    lead_uid: string | null;
    nome_contato: string | null;
    nome_cliente: string | null;
    nome_cliente_origem: 'ia' | 'manual' | 'cliente_disse' | 'formulario' | 'perfil_whatsapp' | 'generico' | null;
    nome_ia_no_lead: string | null;
    cidade: string | null;
    ficha: FichaLaura;
    assigned_consultant_id: string | null;
    telefone_key: string;
    remote_jid: string | null;
}

export interface ChamadaFerramenta {
    nome: string;
    entrada: unknown;
    saida: unknown;
    erro?: boolean;
    ms: number;
}

export interface FotoAnotada { veiculo_id: string; carro: string; urls: string[] }
export interface AgendaAnotada { iso: string; rotulo: string; gravada?: boolean; id?: string; acao?: 'criar' | 'manter' | 'mover'; erro?: string }
export interface PassagemAnotada {
    motivo: string; resumo: string; executada?: boolean;
    /** Quantos vendedores receberam o aviso urgente no WhatsApp, e quem (consultor, todos, gestor). */
    avisados?: number; destinoAviso?: string;
    /** Passagem forçada pelo CRM (o cliente pediu pessoa e a Laura não chamou a ferramenta). */
    automatica?: boolean;
}

export interface ContextoRodada {
    supabase: SupabaseClient;
    modo: 'ensaio' | 'envia';
    agora: Date;
    conversa: ConversaIa;
    textosDoCliente: string[];
    estoque: AltimusVehicle[];
    horario: { horas: HorarioConfig; feriados: Set<string> };
    // saída da rodada
    ficha: FichaLaura;
    fotos: FotoAnotada[];
    agendamento: AgendaAnotada | null;
    passagem: PassagemAnotada | null;
    /** Pedido de carro que a loja não tem: gravado em carro_espera no envio (motor.ts). */
    espera?: (PedidoEspera & { executada?: boolean; erro?: string }) | null;
    /** Contato que não é cliente de carro (a Laura chamou encerrar_contato): não vai a consultor nem gera cobrança. */
    naoCliente?: { tipo: string; resumo: string; executada?: boolean } | null;
    chamadas: ChamadaFerramenta[];
    /** O que a rodada gravou fora de wa_ia_execucoes (ex.: "nome no lead"). */
    gravacoes: string[];
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

type Saida = Record<string, unknown>;
const str = (v: unknown, max = 200): string | null =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

export async function executarFerramenta(nome: string, entrada: unknown, ctx: ContextoRodada): Promise<{ saida: Saida; erro: boolean }> {
    const inicio = Date.now();
    const e = (entrada && typeof entrada === 'object' ? entrada : {}) as Record<string, unknown>;
    let saida: Saida;
    let erro = false;
    try {
        switch (nome) {
            case 'buscar_estoque': saida = buscarEstoque(e, ctx); break;
            case 'registrar_espera': saida = registrarEspera(e, ctx); break;
            case 'enviar_fotos': saida = enviarFotos(e, ctx); break;
            case 'salvar_ficha': saida = await salvarFicha(e, ctx); break;
            case 'agendar_visita': saida = agendarVisita(e, ctx); break;
            case 'passar_para_consultor': saida = passarParaConsultor(e, ctx); break;
            case 'encerrar_contato': saida = encerrarContato(e, ctx); break;
            default: saida = { erro: `ferramenta desconhecida: ${nome}` }; erro = true;
        }
        if (saida.erro) erro = true;
    } catch (err) {
        saida = { erro: `falha interna: ${msgErro(err).slice(0, 200)}` };
        erro = true;
    }
    ctx.chamadas.push({ nome, entrada: e, saida, erro, ms: Date.now() - inicio });
    return { saida, erro };
}

function buscarEstoque(e: Record<string, unknown>, ctx: ContextoRodada): Saida {
    if (!ctx.estoque.length) {
        return { erro: 'estoque indisponível agora. Diga que o consultor confirma a disponibilidade e siga com a ficha.' };
    }
    const r = buscarNoEstoque(ctx.estoque, {
        consulta: str(e.consulta),
        precoMax: typeof e.preco_max === 'number' && e.preco_max > 0 ? e.preco_max : null,
        anoMin: typeof e.ano_min === 'number' && e.ano_min > 1950 ? e.ano_min : null,
        cambio: str(e.cambio, 20),
    });
    if (r.encontrados.length) return { encontrados: r.encontrados, ...(r.tiposPedidos?.length ? { observacao: 'Todos os carros abaixo são do tipo pedido pelo cliente.' } : {}) };
    // Carro que a loja não tem: o pedido é guardado SEMPRE (demanda real + aviso quando entrar),
    // sem depender de o cliente aceitar nem de a Laura lembrar de chamar registrar_espera.
    const consulta = str(e.consulta, 200);
    if (consulta && !ctx.espera) {
        ctx.espera = {
            texto: consulta, marca: null, modelo: null, carroceria: null,
            anoMin: typeof e.ano_min === 'number' && e.ano_min > 1950 ? e.ano_min : null,
            precoMax: typeof e.preco_max === 'number' && e.preco_max > 0 ? e.preco_max : null,
            cambio: str(e.cambio, 20),
        };
    }
    const aviso = ' O pedido do cliente já ficou anotado: se couber, diga que vai avisá-lo quando entrar um assim (sem prometer prazo).';
    if (r.foraDoFiltro?.length) {
        // O modelo existe no pátio, só difere em câmbio, ano ou preço: NUNCA dizer "não temos esse modelo".
        return {
            encontrados: [],
            mesmo_modelo_com_diferenca: r.foraDoFiltro,
            observacao: 'A loja TEM este modelo, mas diferente do que o cliente pediu (veja "diferenca" em cada carro). Não diga que não tem: ofereça este carro com preço e km exatos e diga com naturalidade a diferença (ex.: "tenho um Civic 2012 automático por R$ 65.900, um pouco acima do valor que você falou").',
        };
    }
    if (r.semNoTipo) {
        return {
            encontrados: [],
            parecidos: r.parecidos,
            observacao: `A loja não tem ${(r.tiposPedidos || []).join(' nem ')} no estoque agora. Diga isso de forma simples e, se fizer sentido, ofereça um dos parecidos (sem chamar de ${(r.tiposPedidos || []).join(' nem ')}).${aviso}`,
        };
    }
    return {
        encontrados: [],
        parecidos: r.parecidos,
        observacao: `Nada exato no estoque. Diga que vai confirmar com o consultor e, se fizer sentido, ofereça um dos parecidos.${aviso}`,
    };
}

function registrarEspera(e: Record<string, unknown>, ctx: ContextoRodada): Saida {
    const texto = str(e.consulta, 200);
    if (!texto) return { erro: 'diga qual carro o cliente quer em "consulta".' };
    const precoMax = typeof e.preco_max === 'number' && e.preco_max > 0 ? e.preco_max : null;
    const anoMin = typeof e.ano_min === 'number' && e.ano_min > 1950 ? e.ano_min : null;
    const cambio = str(e.cambio, 20);
    // Trava: carro que a loja tem não entra na espera.
    if (ctx.estoque.length) {
        const r = buscarNoEstoque(ctx.estoque, { consulta: texto, precoMax, anoMin, cambio });
        if (r.encontrados.length) return { erro: 'esse carro está no estoque agora: ofereça os que buscar_estoque devolveu em vez de registrar espera.' };
    }
    ctx.espera = { texto, marca: str(e.marca, 40), modelo: str(e.modelo, 60), carroceria: str(e.tipo, 30), anoMin, precoMax, cambio };
    return { ok: true, observacao: 'Pedido anotado. Diga que vai avisar quando entrar um carro assim, sem prometer prazo, e siga a conversa.' };
}

function enviarFotos(e: Record<string, unknown>, ctx: ContextoRodada): Saida {
    const id = str(e.veiculo_id, 80) || '';
    const carro = acharCarro(ctx.estoque, id);
    if (!carro) return { erro: 'carro não encontrado no estoque. Use um id devolvido por buscar_estoque.' };
    const urls = (carro.fotos || []).slice(0, Math.min(6, Math.max(1, Number(e.quantidade) || 4)));
    if (!urls.length) return { erro: 'esse anúncio está sem fotos. Diga que o consultor manda as fotos.' };
    const info = carroParaIa(carro);
    if (!ctx.fotos.some(f => f.veiculo_id === info.id)) ctx.fotos.push({ veiculo_id: info.id, carro: info.carro, urls });
    // Mesma resposta nos dois modos; no envio, as fotos saem depois do texto (motor.ts).
    return { ok: true, fotos_enviadas: urls.length, carro: info.carro };
}

const FORMAS: FormaPagamento[] = ['a_vista', 'financiado', 'troca', 'nao_sabe'];

async function salvarFicha(e: Record<string, unknown>, ctx: ContextoRodada): Promise<Saida> {
    const avisos: string[] = [];
    const nova: FichaLaura = {};

    if (e.nome != null) {
        const nome = limparNome(str(e.nome, 80));
        if (!nome) avisos.push('o nome não parece nome de pessoa: não anotei.');
        else if (!nomeDitoPeloCliente(nome, ctx.textosDoCliente)) avisos.push('só anote o nome que o cliente escreveu na conversa: não anotei.');
        else nova.nome = nome;
    }
    const cidade = str(e.cidade, 60);
    if (cidade) nova.cidade = cidade;
    const carroInteresse = str(e.carro_interesse, 120);
    if (carroInteresse) nova.carro_interesse = carroInteresse;
    const veiculoId = str(e.veiculo_id, 80);
    if (veiculoId) {
        if (acharCarro(ctx.estoque, veiculoId)) nova.veiculo_id = veiculoId;
        else avisos.push('veiculo_id não está no estoque: não anotei.');
    }
    if (typeof e.forma_pagamento === 'string' && FORMAS.includes(e.forma_pagamento as FormaPagamento)) {
        nova.forma_pagamento = e.forma_pagamento as FormaPagamento;
    }
    const entrada = str(e.entrada, 60);
    if (entrada) nova.entrada = entrada;
    if (typeof e.tem_troca === 'boolean') nova.tem_troca = e.tem_troca;
    if (e.troca && typeof e.troca === 'object') {
        const t = e.troca as Record<string, unknown>;
        const troca: FichaTroca = {};
        for (const k of ['marca', 'modelo', 'ano', 'km', 'cor', 'estado'] as const) {
            const v = str(t[k], 60);
            if (v) troca[k] = v;
        }
        if (Object.keys(troca).length) nova.troca = troca;
    }
    const prazo = str(e.prazo, 60);
    if (prazo) nova.prazo = prazo;

    const antes = ctx.ficha;
    ctx.ficha = mesclarFicha(ctx.ficha, nova);
    const mudou = JSON.stringify(antes) !== JSON.stringify(ctx.ficha);

    if (mudou) await gravarFichaNaConversa(ctx, nova);

    const falta = faltandoNaFicha(ctx.ficha).map(c => ROTULO_CAMPO[c]);
    return {
        ok: true,
        anotado: Object.keys(nova),
        falta,
        ...(avisos.length ? { avisos } : {}),
    };
}

/**
 * Grava a ficha na conversa e o que vai para o lead pelo caminho único do banco
 * (atualizar_nome_lead / atualizar_cidade_lead / registrar_interesse_lead): nome
 * com a regra de prioridade, cidade só se vazia, carro sem apagar o do consultor.
 * Nada disso mexe em status (ver migration 20261107_nome_interesse_auto.sql).
 */
async function gravarFichaNaConversa(ctx: ContextoRodada, nova: FichaLaura): Promise<void> {
    const c = ctx.conversa;
    const { error } = await ctx.supabase.from('wa_conversas').update({ ficha: ctx.ficha }).eq('id', c.id);
    if (error) throw new Error(`ficha: ${error.message}`);
    ctx.gravacoes.push('ficha na conversa');

    // Entrada, troca e prazo que o cliente disse vão para a Qualificação do lead na hora
    // (antes só o carro ia; o resto ficava na ficha da conversa e a tela mostrava vazio).
    if (await gravarQualificacaoNoLead(ctx)) ctx.gravacoes.push('qualificação no lead');

    // Antes da migration 20261107 (WA_IDENTIFICACAO != on): só a conversa guarda o nome dito.
    if (!identificacaoLigada()) {
        if (nova.nome && c.nome_cliente_origem !== 'manual') {
            await ctx.supabase.from('wa_conversas').update({ nome_cliente: nova.nome, nome_cliente_origem: 'ia' }).eq('id', c.id);
            c.nome_cliente = nova.nome;
            c.nome_cliente_origem = 'ia';
        }
        return;
    }

    if (nova.nome) {
        const r = await atualizarNomeLead(ctx.supabase, {
            telefone: c.telefone_key, nome: nova.nome, origem: 'cliente_disse', por: 'laura-crm', trecho: 'salvar_ficha',
        });
        if (r.aplicados > 0) ctx.gravacoes.push('nome no lead');
        c.nome_cliente = nova.nome;
        c.nome_cliente_origem = 'cliente_disse';
    }
    if (nova.cidade) {
        const { data } = await ctx.supabase.rpc('atualizar_cidade_lead', { p_telefone: c.telefone_key, p_cidade: nova.cidade });
        if (Number(data) > 0) ctx.gravacoes.push('cidade no lead');
        if (!c.cidade) c.cidade = nova.cidade;
    }
    // Carro confirmado no estoque (fonte 3) ou citado pelo cliente; nunca o de troca.
    const confirmado = nova.veiculo_id ? acharCarro(ctx.estoque, nova.veiculo_id) : null;
    const carros: CarroInteresse[] = confirmado
        ? [carroConfirmadoNoEstoque(confirmado)]
        : nova.carro_interesse ? carrosCitados(nova.carro_interesse, ctx.estoque) : [];
    for (const carro of carros) {
        const r = await registrarInteresse(ctx.supabase, c.telefone_key, carro, 'laura-crm');
        if (r.leadsAtualizados.length) ctx.gravacoes.push('carro no lead');
    }
    // Sem carro reconhecido ("sedan ou SUV", "carro popular", "picape até 90 mil"): o que o cliente quer vai para o lead
    // mesmo assim, se o campo ainda estiver vazio ou com texto de preenchimento.
    if (!carros.length && !confirmado && nova.carro_interesse) {
        if (await gravarInteresseGenerico(ctx.supabase, c.lead_uid, nova.carro_interesse)) ctx.gravacoes.push('interesse no lead');
    }
}

/**
 * Ficha da Laura → campos de qualificação do lead (entrada, carro na troca, prazo).
 * Só preenche campo vazio; a troca também é refinada quando o novo texto completa o antigo
 * ("Song Plus" → "Song Plus 2025"). Nunca atropela o que o consultor digitou. Nunca lança.
 */
async function gravarQualificacaoNoLead(ctx: ContextoRodada): Promise<boolean> {
    try {
        const uid = ctx.conversa.lead_uid;
        const i = uid ? uid.indexOf(':') : -1;
        if (!uid || i <= 0) return false;
        const tabela = uid.slice(0, i), id = uid.slice(i + 1);
        if (!tabelaSuportaQualificacao(tabela)) return false;
        const atuais = (await buscarQualificacao(ctx.supabase, [uid])).get(uid) || {};
        const f = ctx.ficha;
        const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
        const novos: QualificacaoCampos = {};

        // troca
        const t = f.troca;
        const descTroca = t ? [t.marca, t.modelo, t.ano].filter(Boolean).join(' ').trim() : '';
        if (descTroca) {
            const antigo = (atuais.carro_troca || '').trim();
            const completa = antigo && norm(descTroca).includes(norm(antigo)) && norm(descTroca) !== norm(antigo);
            if (!antigo || completa) novos.carro_troca = descTroca;
        } else if (f.tem_troca === false && !(atuais.carro_troca || '').trim()) {
            novos.carro_troca = SEM_TROCA;
        }

        // entrada (à vista não tem entrada)
        if (f.entrada && f.forma_pagamento !== 'a_vista' && !(atuais.valor_investimento || '').trim()) {
            novos.valor_investimento = entradaEmReais(f.entrada) === 0 ? SEM_ENTRADA : f.entrada;
        }

        // prazo
        const prazo = normalizarPrazo(f.prazo);
        if (prazo && !(atuais.prazo_compra || '').trim()) novos.prazo_compra = prazo;

        if (!Object.keys(novos).length) return false;
        const r = await salvarQualificacao(ctx.supabase, tabela, id, novos);
        return r.ok;
    } catch (e) {
        console.warn('[laura-crm] qualificação no lead:', msgErro(e));
        return false;
    }
}

function carroConfirmadoNoEstoque(v: AltimusVehicle): CarroInteresse {
    return {
        descricao: descricaoDoFeed(v),
        modeloChave: (v.modelo || '').trim().split(/\s+/)[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''),
        ano: v.ano ?? null,
        codigoFeed: v.id_externo ? String(v.id_externo) : null,
        emEstoque: true,
        origem: 'laura_estoque',
        trecho: 'Laura confirmou no estoque',
    };
}

const FUSO_SP = 'America/Sao_Paulo';

function rotuloHorario(d: Date, agora: Date): string {
    const dia = (x: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_SP, year: 'numeric', month: '2-digit', day: '2-digit' }).format(x);
    const hoje = dia(agora), amanha = dia(new Date(agora.getTime() + 86400_000)), alvo = dia(d);
    const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO_SP, hour: '2-digit', minute: '2-digit', hour12: false }).format(d).replace(':00', 'h').replace(':', 'h');
    if (alvo === hoje) return `hoje às ${hora}`;
    if (alvo === amanha) return `amanhã às ${hora}`;
    const quando = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO_SP, weekday: 'short', day: '2-digit', month: '2-digit' }).format(d).replace('.', '');
    return `${quando} às ${hora}`;
}

function agendarVisita(e: Record<string, unknown>, ctx: ContextoRodada): Saida {
    const { horas, feriados } = ctx.horario;
    const pedido = str(e.horario, 40);
    if (!pedido) {
        const livres = horariosDeVisitaDetalhados(horas, feriados, ctx.agora, 5);
        if (!livres.length) return { erro: 'sem horário livre nos próximos dias. Diga que o consultor combina o horário.' };
        return { horarios: livres.map(h => ({ rotulo: h.rotulo, horario: h.iso })) };
    }
    const d = new Date(pedido);
    if (Number.isNaN(d.getTime())) return { erro: 'horário inválido. Use ISO 8601 com -03:00 ou um dos horários devolvidos.' };
    if (d.getTime() < ctx.agora.getTime() + 2 * 3600_000) return { erro: 'precisa ser pelo menos 2 horas a partir de agora. Ofereça outro horário.' };
    if (d.getTime() > ctx.agora.getTime() + 14 * 86400_000) return { erro: 'só dá para agendar nos próximos 14 dias.' };
    if (!isOpenNow(d, horas, feriados) || businessSecondsBetween(d, new Date(d.getTime() + 3600_000), horas, feriados) < 3600) {
        const livres = horariosDeVisitaDetalhados(horas, feriados, ctx.agora, 3);
        return { erro: 'a loja está fechada nesse horário.', horarios: livres.map(h => ({ rotulo: h.rotulo, horario: h.iso })) };
    }
    const rotulo = rotuloHorario(d, ctx.agora);
    ctx.agendamento = { iso: d.toISOString(), rotulo };
    return { ok: true, visita: rotulo, observacao: 'Confirme com o cliente e chame passar_para_consultor com motivo visita_confirmada.' };
}

function passarParaConsultor(e: Record<string, unknown>, ctx: ContextoRodada): Saida {
    const motivo = str(e.motivo, 40) || 'outro';
    const resumo = str(e.resumo, 500) || '';
    ctx.passagem = { motivo, resumo };
    return { ok: true, observacao: 'Consultor avisado. Avise o cliente, em uma frase, que o consultor continua o atendimento por aqui.' };
}

function encerrarContato(e: Record<string, unknown>, ctx: ContextoRodada): Saida {
    const tipo = str(e.tipo, 40) || 'outro';
    ctx.naoCliente = { tipo, resumo: str(e.resumo, 300) || '' };
    return { ok: true, observacao: 'Contato encerrado, sem incomodar o consultor. Responda em UMA frase curta e educada (ou agradeça) e não faça mais perguntas.' };
}
