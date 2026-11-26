/**
 * Espelho do WhatsApp (Gestão → WhatsApp) — regras puras, sem banco e sem rede.
 *
 * O CRM só LÊ um número do WhatsApp: pega as mensagens que a Evolution já guarda
 * (POST /chat/findMessages) e grava em wa_espelho_*. Nenhum agente responde e a
 * tela não tem campo de envio.
 */

import { parseEvolutionWebhook, type EventoMensagem, type EventoWa } from '@/lib/whatsapp/evolutionParser';

export interface ConfigEspelho {
    baseUrl: string;
    instancia: string;
    token: string;
}

const limpar = (s: string | undefined) => (s || '').replace(/^"|"$/g, '').trim();

/** Envs: WA_ESPELHO_INSTANCIA, WA_ESPELHO_TOKEN e (opcional) WA_ESPELHO_EVOLUTION_URL. */
export function configEspelho(env: Record<string, string | undefined>): ConfigEspelho | { faltando: string[] } {
    const baseUrl = limpar(env.WA_ESPELHO_EVOLUTION_URL || env.EVOLUTION_BASE_URL).replace(/\/+$/, '');
    const instancia = limpar(env.WA_ESPELHO_INSTANCIA);
    const token = limpar(env.WA_ESPELHO_TOKEN);
    const faltando = [
        !baseUrl && 'WA_ESPELHO_EVOLUTION_URL',
        !instancia && 'WA_ESPELHO_INSTANCIA',
        !token && 'WA_ESPELHO_TOKEN',
    ].filter(Boolean) as string[];
    return faltando.length ? { faltando } : { baseUrl, instancia, token };
}

/** Linha que a função wa_espelho_gravar do banco recebe. */
export interface LinhaEspelho {
    id: string;
    telefone_key: string;
    remote_jid: string;
    nome: string | null;
    direcao: 'in' | 'out';
    tipo: string;
    texto: string | null;
    legenda: string | null;
    midia_mime: string | null;
    midia_bytes: number | null;
    midia_nome: string | null;
    duracao_s: number | null;
    citada: string | null;
    enviada_em: string;
    extra: Record<string, unknown> | null;
}

export function linhaDoEvento(e: EventoMensagem): LinhaEspelho {
    const extra: Record<string, unknown> = {};
    if (e.localizacao) extra.localizacao = e.localizacao;
    if (e.contatos) extra.contatos = e.contatos;
    if (e.midia?.ptt) extra.ptt = true;
    if (e.tipo === 'reacao' && e.reacaoAlvoId) extra.reacao_alvo = e.reacaoAlvoId;
    return {
        id: e.providerMessageId,
        telefone_key: e.telefoneKey,
        remote_jid: e.remoteJid,
        // o nome que vem na mensagem é de quem escreveu: só vale quando foi o contato
        nome: e.fromMe ? null : e.nomeContato,
        direcao: e.fromMe ? 'out' : 'in',
        tipo: e.tipo,
        texto: e.texto,
        legenda: e.legenda,
        midia_mime: e.midia?.mime ?? null,
        midia_bytes: e.midia?.bytes ?? null,
        midia_nome: e.midia?.nomeArquivo ?? null,
        duracao_s: e.midia?.duracaoS != null ? Math.round(e.midia.duracaoS) : null,
        citada: e.citadaMessageId,
        enviada_em: e.enviadaEm,
        extra: Object.keys(extra).length ? extra : null,
    };
}

/**
 * Registros do /chat/findMessages → eventos do parser compartilhado.
 * Cada registro tem o mesmo formato do `data` do webhook messages.upsert.
 * Grupos, status e canais são descartados pelo parser.
 */
export function eventosDosRegistros(registros: unknown[], instancia: string): EventoWa[] {
    return registros.flatMap(r => parseEvolutionWebhook({ event: 'messages.upsert', instance: instancia, data: r }));
}

export interface Separados {
    linhas: LinhaEspelho[];
    edicoes: { id: string; texto: string | null; em: string }[];
    apagadas: { id: string; em: string }[];
    ignorados: number;
}

export function separarEventos(eventos: EventoWa[]): Separados {
    const s: Separados = { linhas: [], edicoes: [], apagadas: [], ignorados: 0 };
    for (const e of eventos) {
        if (e.kind === 'mensagem') s.linhas.push(linhaDoEvento(e));
        else if (e.kind === 'edicao') s.edicoes.push({ id: e.providerMessageId, texto: e.novoTexto, em: e.editadaEm });
        else if (e.kind === 'apagada') s.apagadas.push({ id: e.providerMessageId, em: e.apagadaEm });
        else s.ignorados++;
    }
    return s;
}
