// src/lib/whatsapp/conversasView.ts — regras da tela Conversas (Fase 3, leitura)
//
// Funções PURAS: rodam no navegador, no servidor e nos testes
// (npm run test:conversas). Nada de banco, rede ou React aqui.

import type { Selo } from '@/lib/qualificacao';
import { telefoneKey } from './evolutionParser';

export type Autor = 'cliente' | 'laura' | 'vendedor' | 'sistema';
export type TipoMensagem =
    | 'texto' | 'imagem' | 'audio' | 'video' | 'documento'
    | 'figurinha' | 'localizacao' | 'contato' | 'reacao';
export type StatusConversa = 'ia' | 'humano' | 'encerrada';
export type FiltroConversa = 'todas' | 'nao_lidas' | 'aguardando' | 'ia' | 'quentes' | 'arquivadas';

export const FILTROS: { id: FiltroConversa; label: string }[] = [
    { id: 'todas', label: 'Todas' },
    { id: 'nao_lidas', label: 'Não lidas' },
    { id: 'aguardando', label: 'Aguardando eu' },
    { id: 'ia', label: 'IA atendendo' },
    { id: 'quentes', label: 'Quentes' },
    { id: 'arquivadas', label: 'Arquivadas' },
];

export interface UltimaMensagem {
    autor: Autor;
    tipo: TipoMensagem;
    resumo: string;
    em: string;
}

export interface ConversaItem {
    id: string;
    nome: string | null;
    telefoneKey: string;
    leadUid: string | null;
    vendedorId: string | null;
    vendedorNome: string | null;
    status: StatusConversa;
    naoLidas: number;
    ultimaEm: string | null;
    ultima: UltimaMensagem | null;
    selo: Selo | null;
    carro: string | null;
}

export interface MensagemView {
    id: string;
    providerId: string;
    direcao: 'in' | 'out';
    autor: Autor;
    tipo: TipoMensagem;
    texto: string | null;
    legenda: string | null;
    temMidia: boolean;
    midiaMime: string | null;
    midiaBytes: number | null;
    midiaNome: string | null;
    midiaExpirada: boolean;
    midiaErro: string | null;
    duracaoS: number | null;
    transcricao: string | null;
    citadaId: string | null;
    statusEntrega: 'enviada' | 'entregue' | 'lida' | 'falhou' | null;
    editadaEm: string | null;
    apagadaEm: string | null;
    criadaEm: string;
    localizacao: { lat: number | null; lng: number | null; nome: string | null; endereco: string | null } | null;
    contatos: { nome: string | null; telefones: string[] }[] | null;
    analiseAudio: { sentimento: string | null; objecao: string | null; resumo: string | null } | null;
}

export interface ConversaDetalhe {
    conversa: ConversaItem;
    mensagens: MensagemView[];
    /** Mensagens citadas que não estão na página carregada (id do WhatsApp → resumo). */
    citadas: Record<string, { autor: Autor; resumo: string }>;
    /** Há mensagens mais antigas para carregar. */
    temMais: boolean;
}

// ---------------------------------------------------------------------------
// Formatos
// ---------------------------------------------------------------------------

const FUSO = 'America/Sao_Paulo';

/** Número completo para o vendedor (decisão 3: sem máscara). */
export function telefoneExibicao(key: string | null | undefined): string {
    const d = (key || '').replace(/\D/g, '');
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return d ? `+${d}` : '';
}

/** Telefone cru (com DDI, de vCard) → chave de 10/11 dígitos; se não der, devolve os dígitos. */
export function telefoneKeyDe(bruto: string | null | undefined): string {
    return telefoneKey(bruto) || (bruto || '').replace(/D/g, '');
}

/** Link do WhatsApp/telefone: só dígitos com DDI. */
export function telefoneLink(key: string | null | undefined): string {
    const d = (key || '').replace(/\D/g, '');
    return d.length === 10 || d.length === 11 ? `55${d}` : d;
}

export function formatarDuracao(segundos: number | null | undefined): string {
    if (segundos == null || !Number.isFinite(segundos) || segundos < 0) return '';
    const s = Math.round(segundos);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatarBytes(bytes: number | null | undefined): string {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

function partesData(iso: string): { dia: string; hora: string } {
    const d = new Date(iso);
    const dia = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
    const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    return { dia, hora };
}

export function horaCurta(iso: string | null | undefined): string {
    return iso ? partesData(iso).hora : '';
}

/** "Hoje", "Ontem" ou "dd/mm/aaaa", no fuso de Rio do Sul. */
export function rotuloDia(iso: string, agora: Date = new Date()): string {
    const { dia } = partesData(iso);
    const hoje = partesData(agora.toISOString()).dia;
    const ontem = partesData(new Date(agora.getTime() - 86_400_000).toISOString()).dia;
    if (dia === hoje) return 'Hoje';
    if (dia === ontem) return 'Ontem';
    return dia;
}

/** Para a lista: hora se for hoje, "Ontem", senão dd/mm. */
export function quandoNaLista(iso: string | null | undefined, agora: Date = new Date()): string {
    if (!iso) return '';
    const r = rotuloDia(iso, agora);
    if (r === 'Hoje') return horaCurta(iso);
    if (r === 'Ontem') return 'Ontem';
    return r.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Autor e resumo
// ---------------------------------------------------------------------------

export function rotuloAutor(autor: Autor, nomeContato?: string | null): string {
    switch (autor) {
        case 'cliente': return nomeContato || 'Cliente';
        case 'laura': return 'Laura (IA)';
        case 'vendedor': return 'Vendedor';
        case 'sistema': return 'Aviso do CRM';
    }
}

type ParaResumo = Pick<MensagemView, 'tipo' | 'texto' | 'legenda' | 'duracaoS' | 'midiaNome' | 'apagadaEm' | 'transcricao'>;

export function resumoMensagem(m: ParaResumo, limite = 80): string {
    if (m.apagadaEm) return '🚫 Mensagem apagada';
    const corta = (s: string) => (s.length > limite ? `${s.slice(0, limite - 1)}…` : s);
    switch (m.tipo) {
        case 'imagem': return m.legenda ? `📷 ${corta(m.legenda)}` : '📷 Foto';
        case 'audio': {
            const dur = formatarDuracao(m.duracaoS);
            return m.transcricao ? `🎤 ${corta(m.transcricao)}` : `🎤 Áudio${dur ? ` ${dur}` : ''}`;
        }
        case 'video': return m.legenda ? `🎥 ${corta(m.legenda)}` : '🎥 Vídeo';
        case 'documento': return `📄 ${m.midiaNome || m.legenda || 'Documento'}`;
        case 'figurinha': return '💟 Figurinha';
        case 'localizacao': return `📍 ${m.texto ? corta(m.texto) : 'Localização'}`;
        case 'contato': return `👤 ${m.texto || 'Contato'}`;
        case 'reacao': return m.texto ? `Reagiu ${m.texto}` : 'Tirou a reação';
        default: return corta((m.texto || '').trim()) || '…';
    }
}

// ---------------------------------------------------------------------------
// Lista: filtros e busca
// ---------------------------------------------------------------------------

/** Cliente escreveu por último e ninguém respondeu ainda. */
export function aguardandoResposta(c: Pick<ConversaItem, 'ultima'>): boolean {
    return c.ultima?.autor === 'cliente';
}

export function filtrarConversas(lista: ConversaItem[], filtro: FiltroConversa, busca = ''): ConversaItem[] {
    const termo = busca.trim().toLowerCase();
    const digitos = termo.replace(/\D/g, '');
    return lista.filter((c) => {
        // arquivada (status 'encerrada') só aparece no filtro "Arquivadas"; nos outros fica de fora
        if (filtro === 'arquivadas') { if (c.status !== 'encerrada') return false; }
        else if (c.status === 'encerrada') return false;
        if (filtro === 'nao_lidas' && c.naoLidas <= 0) return false;
        if (filtro === 'aguardando' && !aguardandoResposta(c)) return false;
        if (filtro === 'ia' && c.status !== 'ia') return false;
        if (filtro === 'quentes' && c.selo !== 'quente') return false;
        if (!termo) return true;
        if ((c.nome || '').toLowerCase().includes(termo)) return true;
        if ((c.carro || '').toLowerCase().includes(termo)) return true;
        return digitos.length >= 3 && c.telefoneKey.includes(digitos);
    });
}

export function contarFiltros(lista: ConversaItem[]): Record<FiltroConversa, number> {
    const out = { todas: 0, nao_lidas: 0, aguardando: 0, ia: 0, quentes: 0, arquivadas: 0 } as Record<FiltroConversa, number>;
    for (const f of FILTROS) out[f.id] = filtrarConversas(lista, f.id).length;
    return out;
}

// ---------------------------------------------------------------------------
// Conversa: reações e agrupamento por dia
// ---------------------------------------------------------------------------

/**
 * Reação não vira balão: aparece como emoji embaixo da mensagem alvo.
 * Vale a última reação de cada autor (reação vazia = tirou).
 * Reação cujo alvo não está carregado vira um balão pequeno.
 */
export function separarReacoes(msgs: MensagemView[]): { visiveis: MensagemView[]; reacoes: Record<string, string[]> } {
    const alvos = new Set(msgs.filter(m => m.tipo !== 'reacao').map(m => m.providerId));
    const ultimaPorAutor = new Map<string, MensagemView>();
    const visiveis: MensagemView[] = [];
    for (const m of msgs) {
        if (m.tipo !== 'reacao') { visiveis.push(m); continue; }
        if (!m.citadaId || !alvos.has(m.citadaId)) { if (m.texto) visiveis.push(m); continue; }
        const chave = `${m.citadaId}|${m.autor}`;
        const atual = ultimaPorAutor.get(chave);
        if (!atual || atual.criadaEm <= m.criadaEm) ultimaPorAutor.set(chave, m);
    }
    const reacoes: Record<string, string[]> = {};
    for (const m of ultimaPorAutor.values()) {
        if (!m.texto) continue;
        (reacoes[m.citadaId!] ||= []).push(m.texto);
    }
    return { visiveis, reacoes };
}

export function agruparPorDia(msgs: MensagemView[], agora: Date = new Date()): { dia: string; mensagens: MensagemView[] }[] {
    const grupos: { dia: string; mensagens: MensagemView[] }[] = [];
    const ordenadas = [...msgs].sort((a, b) => (a.criadaEm < b.criadaEm ? -1 : a.criadaEm > b.criadaEm ? 1 : 0));
    for (const m of ordenadas) {
        const dia = rotuloDia(m.criadaEm, agora);
        const ultimo = grupos[grupos.length - 1];
        if (ultimo && ultimo.dia === dia) ultimo.mensagens.push(m);
        else grupos.push({ dia, mensagens: [m] });
    }
    return grupos;
}

/** Junta mensagens novas às já carregadas (id único), mantendo a ordem por horário. */
export function mesclarMensagens(atuais: MensagemView[], novas: MensagemView[]): MensagemView[] {
    const porId = new Map(atuais.map(m => [m.id, m]));
    for (const m of novas) porId.set(m.id, m);
    return [...porId.values()].sort((a, b) => (a.criadaEm < b.criadaEm ? -1 : a.criadaEm > b.criadaEm ? 1 : 0));
}

/** Lado do balão: cliente à esquerda; Laura, vendedor e aviso do CRM à direita (saem do número da loja). */
export function ladoDoBalao(m: Pick<MensagemView, 'direcao'>): 'esquerda' | 'direita' {
    return m.direcao === 'in' ? 'esquerda' : 'direita';
}

/** Ação registrada em wa_acessos_log ao abrir a mídia. */
export function acaoDeAcesso(tipo: TipoMensagem, download: boolean): 'ouviu_audio' | 'baixou_documento' | 'abriu_midia' {
    if (tipo === 'audio') return 'ouviu_audio';
    if (download || tipo === 'documento') return 'baixou_documento';
    return 'abriu_midia';
}
