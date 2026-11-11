'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, Camera, Loader2, Mic, Send, Trash2, UserRound, X } from 'lucide-react';
import { ATALHOS_FIXOS, aplicarAtalho, atalhoEmDigitacao, filtrarFixos, textoDoCarro, type CarroParaTexto } from '@/lib/whatsapp/atalhos';
import { textoApresentacao } from '@/lib/loja';

interface CarroLista extends CarroParaTexto { id: string; fotos: string[] }
interface Opcao { chave: string; titulo: string; detalhe?: string; escolher: () => void }

const PADRAO_FOTOS = 4;
const MAX_FOTOS = 10;

/**
 * Responder pelo CRM, no número da loja, e Assumir / Devolver para a IA.
 * Só aparece com NEXT_PUBLIC_WA_ENVIO=true (a API também exige WA_ENVIO_PELO_CRM=true).
 * Responder já assume a conversa: a Laura para.
 *
 * Atalhos: "@palio" abre o estoque (texto do carro + fotos), "@endereco", "@horario", "@pix",
 * "@apresentacao". Microfone: grava e envia nota de voz. Se a Laura ainda atendia, o campo já
 * vem com a apresentação do consultor: é só enviar (ou editar).
 */
export function Compositor({ conversaId, status, onAtualizar, consultor, cliente }: {
    conversaId: string;
    status: 'ia' | 'humano' | 'encerrada';
    onAtualizar: () => void;
    /** Consultor responsável (primeiro nome é usado na apresentação). */
    consultor?: string | null;
    cliente?: string | null;
}) {
    const [texto, setTexto] = useState(() => (status === 'ia' ? textoApresentacao(consultor, cliente) : ''));
    const [cursor, setCursor] = useState(0);
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const campo = useRef<HTMLTextAreaElement | null>(null);
    const carroTexto = useRef('');

    // carro escolhido pelo atalho: as fotos vão junto com o texto
    const [carro, setCarro] = useState<{ id: string; descricao: string; fotos: number } | null>(null);
    const [comFotos, setComFotos] = useState(true);
    const [qtdFotos, setQtdFotos] = useState(PADRAO_FOTOS);

    // busca no estoque enquanto digita "@algo"
    const [carros, setCarros] = useState<CarroLista[]>([]);
    const [buscando, setBuscando] = useState(false);
    const [sel, setSel] = useState(0);
    const [fechado, setFechado] = useState(false);
    const atalho = fechado ? null : atalhoEmDigitacao(texto, cursor);
    const busca = atalho?.busca ?? '';
    useEffect(() => {
        if (busca.trim().length < 2) return;
        let vivo = true;
        const t = setTimeout(async () => {
            setBuscando(true);
            try {
                const r = await fetch(`/api/estoque?busca=${encodeURIComponent(busca.trim())}&limite=6`, { cache: 'no-store' });
                const j = await r.json().catch(() => ({}));
                if (vivo) setCarros(r.ok && Array.isArray(j.carros) ? j.carros : []);
            } catch { if (vivo) setCarros([]); }
            if (vivo) setBuscando(false);
        }, 250);
        return () => { vivo = false; clearTimeout(t); };
    }, [busca]);

    // gravação de áudio
    const [gravando, setGravando] = useState(false);
    const [seg, setSeg] = useState(0);
    const gravador = useRef<MediaRecorder | null>(null);
    const pedacos = useRef<Blob[]>([]);
    const descartar = useRef(false);
    useEffect(() => {
        if (!gravando) return;
        const t = setInterval(() => setSeg(s => s + 1), 1000);
        return () => clearInterval(t);
    }, [gravando]);
    useEffect(() => () => { descartar.current = true; try { gravador.current?.stop(); } catch { /* já parado */ } }, []);

    const chamar = async (url: string, corpo: unknown): Promise<boolean> => {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.success) { setErro(j.error || 'não foi possível'); return false; }
        setErro(null);
        return true;
    };

    const enviar = async () => {
        const t = texto.trim();
        if (!t || enviando) return;
        setEnviando(true);
        const fotos = carro && comFotos ? Math.min(carro.fotos, qtdFotos) : 0;
        const ok = await chamar(`/api/wa/conversas/${conversaId}/enviar`, { texto: t, ...(carro && fotos ? { carroId: carro.id, fotos } : {}) });
        setEnviando(false);
        if (ok) { setTexto(''); setCarro(null); onAtualizar(); }
    };

    // manda só as fotos do carro (sem o texto); o texto do carro sai do campo
    const enviarSoFotos = async () => {
        if (!carro || enviando) return;
        setEnviando(true);
        const ok = await chamar(`/api/wa/conversas/${conversaId}/enviar`, { carroId: carro.id, fotos: Math.min(carro.fotos, qtdFotos), soFotos: true });
        setEnviando(false);
        if (ok) { setCarro(null); setTexto(t => t.replace(carroTexto.current, '').trim()); onAtualizar(); }
    };

    const mudar = async (acao: 'assumir' | 'devolver') => {
        setEnviando(true);
        const ok = await chamar(`/api/wa/conversas/${conversaId}/atendimento`, { acao });
        setEnviando(false);
        if (ok) onAtualizar();
    };

    // ── opções do "@" ──
    const colocar = (inserir: string, depois?: () => void) => {
        if (!atalho) return;
        const r = aplicarAtalho(texto, atalho.inicio, cursor, inserir);
        setTexto(r.texto); setCursor(r.cursor); setSel(0); depois?.();
        requestAnimationFrame(() => { campo.current?.focus(); campo.current?.setSelectionRange(r.cursor, r.cursor); });
    };
    const opcoes: Opcao[] = !atalho ? [] : [
        ...filtrarFixos(busca).map((a): Opcao => ({
            chave: `f-${a.chave}`, titulo: `@${a.chave}`, detalhe: a.rotulo,
            escolher: () => colocar(a.texto({ consultor, cliente })),
        })),
        ...carros.map((c): Opcao => ({
            chave: `c-${c.id}`, titulo: c.descricao,
            detalhe: [c.km != null ? `${c.km.toLocaleString('pt-BR')} km` : null, c.preco ? `R$ ${Math.round(c.preco).toLocaleString('pt-BR')}` : null, c.fotos.length ? `${c.fotos.length} fotos` : 'sem fotos'].filter(Boolean).join(' · '),
            escolher: () => colocar(textoDoCarro(c), () => { carroTexto.current = textoDoCarro(c); setCarro({ id: c.id, descricao: c.descricao, fotos: c.fotos.length }); setComFotos(c.fotos.length > 0); setQtdFotos(Math.min(PADRAO_FOTOS, c.fotos.length) || 1); }),
        })),
    ];
    const aberto = Boolean(atalho) && (opcoes.length > 0 || buscando || busca.trim().length >= 2);

    // ── áudio ──
    const iniciarGravacao = async () => {
        setErro(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const tipos = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
            const mime = tipos.find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t));
            const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
            pedacos.current = []; descartar.current = false;
            rec.ondataavailable = (e) => { if (e.data.size) pedacos.current.push(e.data); };
            rec.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                setGravando(false);
                if (descartar.current || !pedacos.current.length) return;
                const blob = new Blob(pedacos.current, { type: rec.mimeType || 'audio/webm' });
                setEnviando(true);
                const base64 = await new Promise<string>((res) => {
                    const fr = new FileReader();
                    fr.onloadend = () => res(String(fr.result || '').split(',')[1] || '');
                    fr.readAsDataURL(blob);
                });
                const ok = await chamar(`/api/wa/conversas/${conversaId}/enviar`, { audio: { base64 } });
                setEnviando(false);
                if (ok) onAtualizar();
            };
            gravador.current = rec; rec.start();
            setSeg(0); setGravando(true);
        } catch {
            setErro('Não consegui usar o microfone. Libere o acesso no navegador (cadeado ao lado do endereço).');
        }
    };
    const pararGravacao = (enviarAudio: boolean) => {
        descartar.current = !enviarAudio;
        try { gravador.current?.stop(); } catch { setGravando(false); }
    };

    if (status === 'encerrada') return null;
    return (
        <div className="relative border-t border-white/[0.06] bg-[#0B0B0F] px-2 md:px-4 py-2 space-y-2">
            <div className="flex items-center gap-2 text-[11px] text-white/55">
                {status === 'ia'
                    ? <span className="flex items-center gap-1 text-violet-200"><Bot size={12} /> Laura atendendo</span>
                    : <span className="flex items-center gap-1 text-emerald-200"><UserRound size={12} /> Atendimento humano</span>}
                <button
                    type="button"
                    disabled={enviando || gravando}
                    onClick={() => mudar(status === 'ia' ? 'assumir' : 'devolver')}
                    className="ml-auto min-h-[36px] rounded-xl bg-white/[0.06] px-3 text-[12px] font-black text-white/80 active:scale-95 disabled:opacity-50"
                >
                    {status === 'ia' ? 'Assumir' : 'Devolver para a IA'}
                </button>
            </div>

            {carro && carro.fotos > 0 && (
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] text-white/70 space-y-2">
                    <div className="flex items-center gap-2">
                        <Camera size={14} className="shrink-0 text-emerald-300" />
                        <span className="flex-1 min-w-0 truncate font-bold text-white/85">{carro.descricao}</span>
                        <button type="button" onClick={() => setCarro(null)} aria-label="Tirar o carro" className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-white/50"><X size={14} /></button>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <label className="flex items-center gap-1.5">
                            Fotos:
                            <select value={Math.min(qtdFotos, carro.fotos)} onChange={(e) => setQtdFotos(Number(e.target.value))} aria-label="Quantas fotos enviar" className="min-h-[36px] rounded-lg bg-white/[0.08] border border-white/[0.1] px-2 text-white">
                                {Array.from({ length: Math.min(carro.fotos, MAX_FOTOS) }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                            <span className="text-white/40">de {carro.fotos}</span>
                        </label>
                        <label className="flex items-center gap-1.5">
                            <input type="checkbox" checked={comFotos} onChange={(e) => setComFotos(e.target.checked)} />
                            Mandar junto com o texto
                        </label>
                        <button type="button" onClick={() => void enviarSoFotos()} disabled={enviando} className="ml-auto min-h-[36px] rounded-lg bg-emerald-500 px-3 text-[12px] font-black text-black active:scale-95 disabled:opacity-50">
                            Enviar só as fotos
                        </button>
                    </div>
                </div>
            )}

            {aberto && (
                <ul role="listbox" aria-label="Atalhos" className="absolute left-2 right-2 md:left-4 md:right-4 bottom-full mb-1 max-h-64 overflow-y-auto rounded-2xl border border-white/[0.1] bg-[#16161C] p-1 shadow-xl z-10">
                    {opcoes.map((o, i) => (
                        <li key={o.chave} role="option" aria-selected={i === sel}>
                            <button
                                type="button"
                                onMouseDown={(e) => { e.preventDefault(); o.escolher(); }}
                                className={`w-full text-left rounded-xl px-3 py-2 min-h-[44px] ${i === sel ? 'bg-white/[0.08]' : ''}`}
                            >
                                <span className="block text-[13px] font-bold text-white truncate">{o.titulo}</span>
                                {o.detalhe && <span className="block text-[11px] text-white/50 truncate">{o.detalhe}</span>}
                            </button>
                        </li>
                    ))}
                    {buscando && <li className="px-3 py-2 text-[12px] text-white/45">Buscando no estoque…</li>}
                    {!buscando && opcoes.length === 0 && <li className="px-3 py-2 text-[12px] text-white/45">Nada encontrado. Atalhos: {ATALHOS_FIXOS.map(a => `@${a.chave}`).join(', ')}</li>}
                </ul>
            )}

            {gravando ? (
                <div className="flex items-center gap-2">
                    <button type="button" onClick={() => pararGravacao(false)} aria-label="Cancelar áudio" className="h-11 w-11 shrink-0 rounded-xl bg-white/[0.06] text-white/70 flex items-center justify-center active:scale-95"><Trash2 size={18} /></button>
                    <div className="flex-1 flex items-center gap-2 min-h-[44px] rounded-xl bg-red-500/10 border border-red-500/30 px-3 text-[14px] text-red-100">
                        <span className="h-2.5 w-2.5 rounded-full bg-red-400 animate-pulse" aria-hidden />
                        Gravando… {Math.floor(seg / 60)}:{String(seg % 60).padStart(2, '0')}
                    </div>
                    <button type="button" onClick={() => pararGravacao(true)} aria-label="Enviar áudio" className="h-11 w-11 shrink-0 rounded-xl bg-emerald-500 text-black flex items-center justify-center active:scale-95"><Send size={18} /></button>
                </div>
            ) : (
                <div className="flex items-end gap-2">
                    <textarea
                        ref={campo}
                        value={texto}
                        onChange={(e) => { setTexto(e.target.value); setCursor(e.target.selectionStart); setFechado(false); setSel(0); }}
                        onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
                        onKeyDown={(e) => {
                            if (aberto && opcoes.length) {
                                if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => (s + 1) % opcoes.length); return; }
                                if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => (s - 1 + opcoes.length) % opcoes.length); return; }
                                if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); opcoes[Math.min(sel, opcoes.length - 1)].escolher(); return; }
                            }
                            if (aberto && e.key === 'Escape') { e.preventDefault(); setFechado(true); return; }
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(); }
                        }}
                        rows={texto.includes('\n') ? Math.min(6, texto.split('\n').length) : 1}
                        maxLength={4000}
                        placeholder="Responder pelo número da loja… (@ para atalhos)"
                        aria-label="Mensagem"
                        className="flex-1 min-h-[44px] max-h-40 resize-none rounded-xl bg-white/[0.05] border border-white/[0.08] px-3 py-2.5 text-[14px] text-white placeholder:text-white/35 outline-none"
                    />
                    {texto.trim() ? (
                        <button
                            type="button"
                            onClick={() => void enviar()}
                            disabled={enviando}
                            aria-label="Enviar"
                            className="h-11 w-11 shrink-0 rounded-xl bg-emerald-500 text-black flex items-center justify-center active:scale-95 disabled:opacity-40"
                        >
                            {enviando ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => void iniciarGravacao()}
                            disabled={enviando}
                            aria-label="Gravar áudio"
                            title="Gravar áudio"
                            className="h-11 w-11 shrink-0 rounded-xl bg-white/[0.08] text-white flex items-center justify-center active:scale-95 disabled:opacity-40"
                        >
                            {enviando ? <Loader2 size={18} className="animate-spin" /> : <Mic size={18} />}
                        </button>
                    )}
                </div>
            )}
            {erro && <p className="text-[11px] text-red-200">{erro}</p>}
        </div>
    );
}
