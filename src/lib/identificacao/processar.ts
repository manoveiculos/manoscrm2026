// src/lib/identificacao/processar.ts — roda em TODA mensagem nova do cliente (SÓ SERVIDOR)
//
// Chamado pela /api/wa/ingest depois de responder ao n8n (after). Funciona com a
// Laura do CRM desligada, em ensaio ou enviando, e também quando o pedido de nome
// veio do n8n (as mensagens do n8n entram como autor = laura).
//
// Chave geral: WA_IDENTIFICACAO=off desliga (padrão: ligado).

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/admin';
import { getInventory } from '@/lib/services/altimusInventory';
import { msgErro } from '@/lib/whatsapp/erro';
import { extrairNome, nomeDoPerfilAceito } from './nome';
import { carroDoAnuncio, carroDoLinkDoSite, carrosCitados, type CarroInteresse } from './veiculo';
import { atualizarNomeLead, registrarInteresse } from './gravar';

export interface MensagemParaIdentificar {
    conversaId: string;
    mensagemId: string;
}

/** Desligada por padrão: só liga com WA_IDENTIFICACAO=on, depois da migration 20261107_nome_interesse_auto. */
export function identificacaoLigada(): boolean {
    return (process.env.WA_IDENTIFICACAO || '').trim().toLowerCase() === 'on';
}

const POR = 'crm:ingestao';

/** Texto da mensagem do cliente para o reconhecimento (áudio usa a transcrição). */
function textoDe(m: { tipo: string; texto: string | null; legenda: string | null; transcricao: string | null }): string {
    if (m.tipo === 'audio') return m.transcricao || '';
    if (m.tipo === 'texto') return m.texto || '';
    return m.legenda || '';
}

async function identificarUma(admin: SupabaseClient, alvo: MensagemParaIdentificar): Promise<void> {
    const { data: m } = await admin.from('wa_mensagens')
        .select('id, conversa_id, autor, tipo, texto, legenda, transcricao, criada_em')
        .eq('id', alvo.mensagemId).maybeSingle();
    if (!m || m.autor !== 'cliente') return;
    const { data: conv } = await admin.from('wa_conversas')
        .select('id, telefone_key, nome_contato, lead_uid')
        .eq('id', alvo.conversaId).maybeSingle();
    if (!conv) return;
    const telefone = conv.telefone_key as string;
    const texto = textoDe(m);

    // Última mensagem da loja antes desta (Laura do n8n, Laura do CRM ou vendedor)
    const { data: anterior } = await admin.from('wa_mensagens')
        .select('texto, legenda, tipo')
        .eq('conversa_id', alvo.conversaId).in('autor', ['laura', 'vendedor'])
        .lt('criada_em', m.criada_em)
        .order('criada_em', { ascending: false }).limit(1).maybeSingle();
    const ultimaDaLoja = anterior ? (anterior.texto || anterior.legenda || '') : null;

    // NOME: o que o cliente disse; senão, o perfil do WhatsApp como provisório
    const achado = texto ? extrairNome(texto, ultimaDaLoja) : null;
    if (achado) {
        await atualizarNomeLead(admin, { telefone, nome: achado.nome, origem: 'cliente_disse', por: POR, trecho: achado.trecho });
    } else {
        const perfil = nomeDoPerfilAceito(conv.nome_contato);
        if (perfil) await atualizarNomeLead(admin, { telefone, nome: perfil, origem: 'perfil_whatsapp', por: POR, trecho: 'nome do perfil do WhatsApp' });
    }

    // CARRO: link do site > anúncio (só na 1ª mensagem) > modelo e ano citados
    const estoque = await getInventory();
    const carros: CarroInteresse[] = [];
    const doLink = texto ? carroDoLinkDoSite(texto, estoque) : null;
    if (doLink) carros.push(doLink);
    const { count: falasDoCliente } = await admin.from('wa_mensagens')
        .select('id', { count: 'exact', head: true })
        .eq('conversa_id', alvo.conversaId).eq('autor', 'cliente');
    if ((falasDoCliente || 0) <= 1 && conv.lead_uid) {
        const utm = await utmDoLead(admin, conv.lead_uid as string);
        const doAnuncio = carroDoAnuncio(utm, estoque);
        if (doAnuncio) carros.push(doAnuncio);
    }
    if (!doLink && texto) carros.push(...carrosCitados(texto, estoque));
    // o mais confiável por último: vira o mais recente (primeiro na tela)
    for (const c of carros.reverse()) await registrarInteresse(admin, telefone, c, POR);
}

async function utmDoLead(admin: SupabaseClient, leadUid: string): Promise<Record<string, unknown> | null> {
    const i = leadUid.indexOf(':');
    const tabela = leadUid.slice(0, i), id = leadUid.slice(i + 1);
    if (tabela !== 'leads_distribuicao_crm_26' && tabela !== 'leads_master') return null;
    const { data } = await admin.from(tabela).select('utm_params').eq('id', tabela === 'leads_distribuicao_crm_26' ? Number(id) : id).maybeSingle();
    const utm = (data as { utm_params?: unknown } | null)?.utm_params;
    return utm && typeof utm === 'object' ? utm as Record<string, unknown> : null;
}

/** Nome e carro de cada mensagem nova do cliente. Não lança: erro vai para webhook_errors. */
export async function identificarNomeECarro(alvos: MensagemParaIdentificar[]): Promise<void> {
    if (!alvos.length || !identificacaoLigada()) return;
    const admin = createClient();
    for (const alvo of alvos) {
        try {
            await identificarUma(admin, alvo);
        } catch (e) {
            try {
                await admin.from('webhook_errors').insert({
                    source: 'wa_identificacao',
                    error_message: `nome/carro: ${msgErro(e)}`.slice(0, 1000),
                    payload: { mensagem_id: alvo.mensagemId, conversa_id: alvo.conversaId },
                });
            } catch { /* sem onde registrar */ }
        }
    }
}
