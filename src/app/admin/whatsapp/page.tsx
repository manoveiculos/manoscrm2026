'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Eye, Loader2, MessagesSquare, RefreshCw, Search, ShieldAlert, UserRound } from 'lucide-react';
import {
    agruparPorDia, mesclarMensagens, quandoNaLista, resumoMensagem, separarReacoes, telefoneExibicao,
    type MensagemView, type TipoMensagem,
} from '@/lib/whatsapp/conversasView';
import { BolhaEspelho } from './_components/BolhaEspelho';

/**
 * GESTÃO → WHATSAPP — espelho SÓ LEITURA de um número do WhatsApp (instância
 * da Evolution em WA_ESPELHO_INSTANCIA). Só admin.
 *
 * Não existe campo de envio nem agente: a tela só mostra o que já aconteceu no
 * WhatsApp, para análise. As mensagens ficam salvas no banco (wa_espelho_*); o
 * cron wa-espelho lê a Evolution a cada minuto e o botão Atualizar busca na hora.
 */

interface Conversa {
    id: string;
    telefone: string;
    nome: string | null;
    ultimaEm: string | null;
    ultimaDirecao: 'in' | 'out' | null;
    ultimaTipo: string | null;
    ultimaTexto: string | null;
    total: number;
}

interface Sync {
    ultima_sync_em: string | null;
    importacao_concluida: boolean;
    importacao_pagina: number;
    total_evolution: number | null;
    ultimo_erro: string | null;
    ultimo_erro_em: string | null;
}

interface Detalhe {
    conversa: Conversa;
    mensagens: MensagemView[];
    citadas: Record<string, { direcao: 'in' | 'out'; resumo: string }>;
    temMais: boolean;
}

const INTERVALO_LISTA_MS = 20_000;
const INTERVALO_CONVERSA_MS = 10_000;

async function getJson<T>(url: string): Promise<{ ok: true; d: T } | { ok: false; status: number; erro: string }> {
    try {
        const res = await fetch(url, { cache: 'no-store' });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || d?.success === false) return { ok: false, status: res.status, erro: d?.error || `erro ${res.status}` };
        return { ok: true, d };
    } catch (e) {
        return { ok: false, status: 0, erro: e instanceof Error ? e.message : 'sem conexão' };
    }
}

const nomeDe = (c: Pick<Conversa, 'nome' | 'telefone'>) => c.nome || telefoneExibicao(c.telefone);

function resumoUltima(c: Conversa): string {
    if (!c.ultimaTipo) return '';
    return resumoMensagem({
        tipo: c.ultimaTipo as TipoMensagem, texto: c.ultimaTexto, legenda: c.ultimaTexto,
        duracaoS: null, midiaNome: null, apagadaEm: null, transcricao: null,
    }, 70);
}

function textoSync(s: Sync | null, agora: Date): string {
    if (!s?.ultima_sync_em) return 'Aguardando a primeira leitura da Evolution';
    const min = Math.max(0, Math.round((agora.getTime() - new Date(s.ultima_sync_em).getTime()) / 60_000));
    const quando = min === 0 ? 'agora' : min === 1 ? 'há 1 min' : min < 60 ? `há ${min} min` : `há ${Math.round(min / 60)} h`;
    const imp = s.importacao_concluida
        ? 'histórico completo'
        : `importando histórico${s.total_evolution ? ` (${Math.min(100, Math.round(((s.importacao_pagina - 1) * 200 / s.total_evolution) * 100))}%)` : ''}`;
    return `Atualizado ${quando} · ${imp}`;
}

export default function WhatsAppEspelhoPage() {
    const [conversas, setConversas] = useState<Conversa[] | null>(null);
    const [temMaisConversas, setTemMaisConversas] = useState(false);
    const [sync, setSync] = useState<Sync | null>(null);
    const [configurado, setConfigurado] = useState(true);
    const [instancia, setInstancia] = useState<string | null>(null);
    const [negado, setNegado] = useState(false);
    const [erroLista, setErroLista] = useState<string | null>(null);
    const [carregandoLista, setCarregandoLista] = useState(false);
    const [atualizando, setAtualizando] = useState(false);
    const [busca, setBusca] = useState('');
    const [buscaAplicada, setBuscaAplicada] = useState('');
    const [selecionada, setSelecionada] = useState<string | null>(null);
    const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
    const [carregandoConversa, setCarregandoConversa] = useState(false);
    const [carregandoAntigas, setCarregandoAntigas] = useState(false);
    const [erroConversa, setErroConversa] = useState<string | null>(null);
    const [agora, setAgora] = useState(() => new Date());

    useEffect(() => { const t = setInterval(() => setAgora(new Date()), 30_000); return () => clearInterval(t); }, []);

    // busca com atraso curto (não consulta a cada tecla)
    useEffect(() => { const t = setTimeout(() => setBuscaAplicada(busca.trim()), 400); return () => clearTimeout(t); }, [busca]);

    const carregarLista = useCallback(async () => {
        setCarregandoLista(true);
        const r = await getJson<{ configurado: boolean; instancia?: string; conversas: Conversa[]; temMais: boolean; sync: Sync | null }>(
            `/api/espelho-wa/conversas${buscaAplicada ? `?busca=${encodeURIComponent(buscaAplicada)}` : ''}`,
        );
        setCarregandoLista(false);
        if (!r.ok) {
            if (r.status === 403) setNegado(true);
            setErroLista(r.erro);
            return;
        }
        setErroLista(null);
        setConfigurado(r.d.configurado);
        setInstancia(r.d.instancia ?? null);
        setConversas(r.d.conversas);
        setTemMaisConversas(r.d.temMais);
        setSync(r.d.sync);
    }, [buscaAplicada]);

    const carregarMaisConversas = useCallback(async () => {
        const ultima = conversas?.[conversas.length - 1]?.ultimaEm;
        if (!ultima) return;
        const qs = new URLSearchParams({ antes: ultima, ...(buscaAplicada ? { busca: buscaAplicada } : {}) });
        const r = await getJson<{ conversas: Conversa[]; temMais: boolean }>(`/api/espelho-wa/conversas?${qs}`);
        if (!r.ok) return;
        setConversas(atual => {
            const ids = new Set((atual || []).map(c => c.id));
            return [...(atual || []), ...r.d.conversas.filter(c => !ids.has(c.id))];
        });
        setTemMaisConversas(r.d.temMais);
    }, [conversas, buscaAplicada]);

    useEffect(() => {
        const primeira = setTimeout(carregarLista, 0);
        const t = setInterval(carregarLista, INTERVALO_LISTA_MS);
        return () => { clearTimeout(primeira); clearInterval(t); };
    }, [carregarLista]);

    const carregarConversa = useCallback(async (id: string, silencioso = false) => {
        if (!silencioso) { setCarregandoConversa(true); setErroConversa(null); }
        const r = await getJson<Detalhe>(`/api/espelho-wa/conversas/${id}`);
        if (!silencioso) setCarregandoConversa(false);
        if (!r.ok) { if (!silencioso) setErroConversa(r.erro); return; }
        setDetalhe(atual => (atual && atual.conversa.id === id && silencioso)
            ? { ...r.d, mensagens: mesclarMensagens(atual.mensagens, r.d.mensagens), temMais: atual.temMais, citadas: { ...atual.citadas, ...r.d.citadas } }
            : r.d);
    }, []);

    // trocar de conversa limpa a anterior na hora (no clique), e o efeito só busca
    const selecionar = useCallback((id: string | null) => { setDetalhe(null); setErroConversa(null); setSelecionada(id); }, []);

    useEffect(() => {
        if (!selecionada) return;
        const primeira = setTimeout(() => carregarConversa(selecionada), 0);
        const t = setInterval(() => carregarConversa(selecionada, true), INTERVALO_CONVERSA_MS);
        return () => { clearTimeout(primeira); clearInterval(t); };
    }, [selecionada, carregarConversa]);

    const carregarAntigas = useCallback(async () => {
        if (!detalhe || carregandoAntigas) return;
        const maisAntiga = detalhe.mensagens[0]?.criadaEm;
        if (!maisAntiga) return;
        setCarregandoAntigas(true);
        const r = await getJson<Detalhe>(`/api/espelho-wa/conversas/${detalhe.conversa.id}?antes=${encodeURIComponent(maisAntiga)}`);
        setCarregandoAntigas(false);
        if (!r.ok) return;
        setDetalhe(atual => atual && atual.conversa.id === r.d.conversa.id
            ? { ...atual, mensagens: mesclarMensagens(r.d.mensagens, atual.mensagens), temMais: r.d.temMais, citadas: { ...r.d.citadas, ...atual.citadas } }
            : atual);
    }, [detalhe, carregandoAntigas]);

    const atualizarAgora = useCallback(async () => {
        setAtualizando(true);
        try { await fetch('/api/espelho-wa/sincronizar', { method: 'POST' }); } catch { /* a lista mostra o erro da sync */ }
        setAtualizando(false);
        await carregarLista();
        if (selecionada) await carregarConversa(selecionada, true);
    }, [carregarLista, carregarConversa, selecionada]);

    if (negado) {
        return (
            <div className="w-full max-w-md mx-auto mt-16 rounded-2xl border border-white/10 bg-[#0F0F14] p-6 text-center">
                <ShieldAlert className="mx-auto text-red-400 mb-3" />
                <p className="text-white font-black">Só o admin vê o WhatsApp espelhado.</p>
            </div>
        );
    }

    return (
        <div className="w-full md:h-[calc(100vh-2rem)] flex flex-col">
            <div className="flex flex-wrap items-end justify-between gap-3 pb-3">
                <div className="min-w-0">
                    <h1 className="text-2xl font-black text-white tracking-tight">WhatsApp</h1>
                    <p className="text-[12px] text-white/45 mt-0.5 flex items-center gap-1.5">
                        <Eye size={13} className="text-emerald-400" />
                        Espelho só leitura{instancia ? ` · ${instancia}` : ''} · {textoSync(sync, agora)}
                    </p>
                    {sync?.ultimo_erro && sync.ultimo_erro_em && sync.ultima_sync_em && sync.ultimo_erro_em >= sync.ultima_sync_em && (
                        <p className="text-[12px] text-amber-300 mt-1">Última leitura da Evolution falhou. Tentando de novo a cada minuto.</p>
                    )}
                </div>
                <button
                    type="button"
                    onClick={atualizarAgora}
                    disabled={atualizando || !configurado}
                    className="h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] px-3 flex items-center gap-2 text-[13px] font-bold text-white/70 disabled:opacity-40"
                >
                    {atualizando ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} Atualizar
                </button>
            </div>

            {!configurado && (
                <div className="rounded-2xl border border-amber-500/40 bg-amber-600/10 px-4 py-3 text-sm text-amber-100 mb-3">
                    Falta configurar a instância da Evolution: envs <code>WA_ESPELHO_INSTANCIA</code> e <code>WA_ESPELHO_TOKEN</code>.
                </div>
            )}

            <div className="flex-1 min-h-0 grid md:grid-cols-[360px_1fr] rounded-3xl border border-white/[0.08] bg-[#0B0B10] overflow-hidden">
                {/* Lista */}
                <div className={`flex flex-col min-h-0 md:border-r md:border-white/[0.06] ${selecionada ? 'hidden md:flex' : 'flex'}`}>
                    <div className="p-3 border-b border-white/[0.06]">
                        <label className="flex items-center gap-2 rounded-xl bg-white/[0.04] border border-white/[0.08] px-3 h-10">
                            <Search size={15} className="text-white/40 shrink-0" />
                            <input
                                value={busca}
                                onChange={(e) => setBusca(e.target.value)}
                                placeholder="Buscar nome, telefone ou palavra"
                                className="flex-1 min-w-0 bg-transparent text-[13px] text-white placeholder:text-white/35 outline-none"
                                aria-label="Buscar conversa"
                            />
                            {carregandoLista && <Loader2 size={14} className="animate-spin text-white/40" />}
                        </label>
                    </div>

                    {erroLista && <div className="m-3 rounded-xl border border-red-500/40 bg-red-600/10 px-3 py-2 text-[13px] text-red-200">Não consegui carregar: {erroLista}</div>}

                    <div className="flex-1 overflow-y-auto">
                        {!conversas && !erroLista && (
                            <div className="space-y-2 p-3">{[0, 1, 2, 3, 4].map(i => <div key={i} className="h-16 rounded-2xl bg-white/[0.03] animate-pulse" />)}</div>
                        )}
                        {conversas && conversas.length === 0 && (
                            <div className="m-3 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-6 py-10 text-center">
                                <MessagesSquare size={26} className="mx-auto text-white/40 mb-3" />
                                <p className="text-white font-black">{buscaAplicada ? 'Nada encontrado.' : 'Nenhuma conversa ainda.'}</p>
                                <p className="text-[12px] text-white/50 mt-1">{buscaAplicada ? 'Tente outro nome, número ou palavra.' : 'As conversas aparecem aqui assim que a primeira leitura da Evolution terminar.'}</p>
                            </div>
                        )}
                        <ul className="divide-y divide-white/[0.05]">
                            {(conversas || []).map(c => (
                                <li key={c.id}>
                                    <button
                                        type="button"
                                        onClick={() => selecionar(c.id)}
                                        className={`w-full text-left px-3 py-3 flex gap-3 transition ${c.id === selecionada ? 'bg-white/[0.07]' : 'hover:bg-white/[0.03]'}`}
                                    >
                                        <div className="h-10 w-10 shrink-0 rounded-full bg-white/[0.06] flex items-center justify-center text-white/60"><UserRound size={18} /></div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-baseline justify-between gap-2">
                                                <p className="text-[14px] font-bold text-white truncate">{nomeDe(c)}</p>
                                                <span className="text-[11px] text-white/40 shrink-0 tabular-nums">{quandoNaLista(c.ultimaEm, agora)}</span>
                                            </div>
                                            <p className="text-[12px] text-white/50 truncate">
                                                {c.ultimaDirecao === 'out' && <span className="text-emerald-400/80">{instancia || 'Enviada'}: </span>}
                                                {resumoUltima(c)}
                                            </p>
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                        {temMaisConversas && (
                            <button type="button" onClick={carregarMaisConversas} className="w-full py-3 text-[12px] font-bold text-white/60 hover:text-white">
                                Carregar mais conversas
                            </button>
                        )}
                    </div>
                </div>

                {/* Conversa */}
                <div className={`flex flex-col min-h-[70vh] md:min-h-0 ${selecionada ? 'flex' : 'hidden md:flex'}`}>
                    {!selecionada ? (
                        <div className="flex-1 flex items-center justify-center text-white/40 text-sm">
                            <div className="text-center"><MessagesSquare size={40} className="mx-auto mb-3 opacity-40" />Escolha uma conversa para ler</div>
                        </div>
                    ) : (
                        <PainelEspelho
                            detalhe={detalhe}
                            carregando={carregandoConversa}
                            carregandoAntigas={carregandoAntigas}
                            erro={erroConversa}
                            agora={agora}
                            nomeNumero={instancia || 'Enviada'}
                            onVoltar={() => selecionar(null)}
                            onCarregarAntigas={carregarAntigas}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

function PainelEspelho({ detalhe, carregando, carregandoAntigas, erro, agora, nomeNumero, onVoltar, onCarregarAntigas }: {
    detalhe: Detalhe | null;
    /** Nome mostrado nas mensagens enviadas pelo número espelhado (nome da instância). */
    nomeNumero: string;
    carregando: boolean;
    carregandoAntigas: boolean;
    erro: string | null;
    agora: Date;
    onVoltar: () => void;
    onCarregarAntigas: () => void;
}) {
    const rolagem = useRef<HTMLDivElement | null>(null);
    const ultimoId = useRef<string | null>(null);
    const conversaId = detalhe?.conversa.id ?? null;

    const { grupos, reacoes, porProvider } = useMemo(() => {
        const msgs = detalhe?.mensagens || [];
        const { visiveis, reacoes } = separarReacoes(msgs);
        const porProvider: Record<string, MensagemView> = {};
        for (const m of msgs) porProvider[m.providerId] = m;
        return { grupos: agruparPorDia(visiveis, agora), reacoes, porProvider };
    }, [detalhe?.mensagens, agora]);

    // desce para o fim ao abrir e quando chega mensagem nova (não quando carrega antigas)
    useLayoutEffect(() => {
        const el = rolagem.current;
        const ultima = detalhe?.mensagens[detalhe.mensagens.length - 1]?.id ?? null;
        if (el && ultima && ultima !== ultimoId.current) el.scrollTop = el.scrollHeight;
        ultimoId.current = ultima;
    }, [detalhe?.mensagens, conversaId]);

    if (!detalhe) {
        return (
            <div className="flex-1 flex items-center justify-center text-white/50">
                {erro ? <p className="text-red-300 text-sm">Não consegui abrir: {erro}</p> : carregando ? <Loader2 className="animate-spin" /> : null}
            </div>
        );
    }

    const c = detalhe.conversa;
    const nomeContato = nomeDe(c);
    const citadaDe = (id: string | null) => {
        if (!id) return null;
        const m = porProvider[id];
        if (m) return { direcao: m.direcao, resumo: resumoMensagem(m, 140) };
        return detalhe.citadas[id] ?? null;
    };

    return (
        <>
            <div className="px-3 md:px-4 py-3 border-b border-white/[0.06] flex items-center gap-3">
                <button type="button" onClick={onVoltar} className="md:hidden h-9 w-9 rounded-xl bg-white/[0.05] flex items-center justify-center text-white/70" aria-label="Voltar">
                    <ArrowLeft size={18} />
                </button>
                <div className="h-10 w-10 shrink-0 rounded-full bg-white/[0.06] flex items-center justify-center text-white/60"><UserRound size={18} /></div>
                <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-black text-white truncate">{nomeContato}</p>
                    <p className="text-[11px] text-white/45 tabular-nums">{telefoneExibicao(c.telefone)} · {c.total} mensagens salvas</p>
                </div>
            </div>

            <div ref={rolagem} className="flex-1 overflow-y-auto px-3 md:px-5 py-4 space-y-3 bg-black/20">
                {detalhe.temMais && (
                    <div className="flex justify-center">
                        <button type="button" onClick={onCarregarAntigas} disabled={carregandoAntigas} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[12px] font-bold text-white/60">
                            {carregandoAntigas ? 'Carregando…' : 'Carregar mensagens anteriores'}
                        </button>
                    </div>
                )}
                {grupos.map(g => (
                    <div key={g.dia} className="space-y-2.5">
                        <div className="flex justify-center"><span className="rounded-full bg-white/[0.06] px-3 py-1 text-[11px] font-bold text-white/50">{g.dia}</span></div>
                        {g.mensagens.map(m => (
                            <BolhaEspelho
                                key={m.id}
                                m={m}
                                nomeContato={nomeContato}
                                nomeNumero={nomeNumero}
                                reacoes={reacoes[m.providerId]}
                                citada={m.citadaId ? citadaDe(m.citadaId) : undefined}
                            />
                        ))}
                    </div>
                ))}
            </div>

            {/* Sem campo de envio: o espelho é só para leitura. */}
            <div className="px-4 py-2.5 border-t border-white/[0.06] text-center text-[11px] text-white/40 flex items-center justify-center gap-1.5">
                <Eye size={12} /> Somente leitura · nada é enviado por esta tela
            </div>
        </>
    );
}
