'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Sparkles, Trophy, Loader2, Gift } from 'lucide-react';

/**
 * Roleta de Prêmios — modal de gamificação pós-venda.
 *
 * Abre quando o consultor marca um veículo como "Vendido". Cada venda dá UM giro
 * (trava por veiculo_id no servidor) que soma um prêmio (R$ 50–500) à comissão.
 *
 * O prêmio é decidido no servidor (/api/roleta/spin) — aqui só animamos a roleta
 * até o índice devolvido. O webhook do n8n também dispara no servidor.
 */

// Deve espelhar PRIZES do /api/roleta/spin.
const PRIZES = [50, 100, 150, 200, 300, 500] as const;
const SLICE_DEG = 360 / PRIZES.length;

// Paleta premium (charcoal + dourado alternados).
const SLICE_COLORS = ['#12121c', '#c8a24a', '#171727', '#b8912f', '#12121c', '#d4af37'];

interface Consultor { nome: string; email: string; celular: string; }
interface Props {
    open: boolean;
    onClose: () => void;
    veiculoId: string;
    veiculoModelo?: string | null;
}

export default function PrizeWheelModal({ open, onClose, veiculoId, veiculoModelo }: Props) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rotationRef = useRef(0);
    const rafRef = useRef<number | null>(null);

    const [consultor, setConsultor] = useState<Consultor>({ nome: '', email: '', celular: '' });
    const [loading, setLoading] = useState(true);
    const [spinning, setSpinning] = useState(false);
    const [result, setResult] = useState<number | null>(null);
    const [alreadySpun, setAlreadySpun] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ── Desenho da roleta ────────────────────────────────────────────────────
    const drawWheel = useCallback((rotationDeg: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const size = canvas.width;
        const cx = size / 2;
        const cy = size / 2;
        const r = size / 2 - 8;

        ctx.clearRect(0, 0, size, size);

        // Fatias
        for (let i = 0; i < PRIZES.length; i++) {
            const start = ((i * SLICE_DEG + rotationDeg) * Math.PI) / 180;
            const end = (((i + 1) * SLICE_DEG + rotationDeg) * Math.PI) / 180;

            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, r, start, end);
            ctx.closePath();
            ctx.fillStyle = SLICE_COLORS[i % SLICE_COLORS.length];
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.10)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Rótulo do prêmio
            const mid = (start + end) / 2;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(mid);
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            const light = i % 2 === 1; // fatias douradas → texto escuro
            ctx.fillStyle = light ? '#0b0b12' : '#f4e7c3';
            ctx.font = '700 16px system-ui, sans-serif';
            ctx.fillText(`R$ ${PRIZES[i]}`, r - 16, 0);
            ctx.restore();
        }

        // Aro externo
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = '#c8a24a';
        ctx.lineWidth = 4;
        ctx.stroke();

        // Hub central
        ctx.beginPath();
        ctx.arc(cx, cy, 24, 0, Math.PI * 2);
        ctx.fillStyle = '#0b0b12';
        ctx.fill();
        ctx.strokeStyle = '#c8a24a';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#c8a24a';
        ctx.fill();
    }, []);

    // ── Carga inicial: prefill + trava ────────────────────────────────────────
    useEffect(() => {
        if (!open) return;
        let alive = true;
        setLoading(true);
        setError(null);
        setResult(null);
        setAlreadySpun(false);
        rotationRef.current = 0;

        (async () => {
            try {
                const res = await fetch(`/api/roleta/spin?veiculo_id=${encodeURIComponent(veiculoId)}`);
                const data = await res.json();
                if (!alive) return;
                if (!res.ok) {
                    setError(data?.error || 'Falha ao carregar a roleta.');
                } else {
                    if (data.consultor) setConsultor(data.consultor);
                    if (data.alreadySpun && typeof data.premio === 'number') {
                        // Já girou pra esse veículo → mostra o prêmio, sem novo giro.
                        setAlreadySpun(true);
                        setResult(data.premio);
                    }
                }
            } catch {
                if (alive) setError('Erro de conexão ao carregar a roleta.');
            } finally {
                if (alive) setLoading(false);
            }
        })();

        return () => { alive = false; };
    }, [open, veiculoId]);

    // Redesenha quando o canvas aparece / muda o estado.
    useEffect(() => {
        if (open && !loading && result === null) drawWheel(rotationRef.current);
    }, [open, loading, result, drawWheel]);

    // Limpa animação ao desmontar.
    useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

    // ── Animação até o índice sorteado ────────────────────────────────────────
    const animateTo = useCallback((index: number, onDone: () => void) => {
        const center = index * SLICE_DEG + SLICE_DEG / 2;
        const jitter = (Math.random() - 0.5) * SLICE_DEG * 0.55; // encosta perto do centro, não cravado
        // Ponteiro fica no topo (270° no canvas, y pra baixo). Traz o centro da fatia pro topo.
        const base = ((270 - center) % 360 + 360) % 360;
        const spins = 6;
        const from = rotationRef.current;
        const target = spins * 360 + base - jitter;
        const delta = target - from;
        const duration = 4200;
        const startTs = performance.now();

        const tick = (now: number) => {
            const t = Math.min(1, (now - startTs) / duration);
            const eased = 1 - Math.pow(1 - t, 4); // easeOutQuart → desacelera realista
            rotationRef.current = from + delta * eased;
            drawWheel(rotationRef.current);
            if (t < 1) {
                rafRef.current = requestAnimationFrame(tick);
            } else {
                onDone();
            }
        };
        rafRef.current = requestAnimationFrame(tick);
    }, [drawWheel]);

    // ── Girar ─────────────────────────────────────────────────────────────────
    const spin = useCallback(async () => {
        if (spinning || alreadySpun || result !== null) return;
        setSpinning(true);
        setError(null);
        try {
            const res = await fetch('/api/roleta/spin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ veiculo_id: veiculoId, veiculo_modelo: veiculoModelo }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data?.error || 'Não foi possível girar.');
                setSpinning(false);
                return;
            }
            const idx = typeof data.index === 'number' && data.index >= 0
                ? data.index
                : PRIZES.indexOf(data.premio);

            if (data.alreadySpun) {
                // Corrida perdida — mostra direto o prêmio existente.
                setAlreadySpun(true);
                setResult(data.premio);
                setSpinning(false);
                return;
            }

            animateTo(idx, () => {
                setResult(data.premio);
                setSpinning(false);
            });
        } catch {
            setError('Erro de conexão ao girar.');
            setSpinning(false);
        }
    }, [spinning, alreadySpun, result, veiculoId, veiculoModelo, animateTo]);

    if (!open) return null;

    const showSuccess = result !== null;

    return (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] backdrop-blur-2xl shadow-2xl overflow-hidden">
                {/* brilho decorativo */}
                <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-amber-500/20 blur-3xl" />

                {/* fechar (só quando não está girando) */}
                {!spinning && (
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-white/5 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition"
                        aria-label="Fechar"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}

                <div className="relative p-6">
                    {loading ? (
                        <div className="py-20 flex flex-col items-center gap-3 text-zinc-400">
                            <Loader2 className="w-7 h-7 animate-spin text-amber-400" />
                            <span className="text-sm">Preparando sua roleta…</span>
                        </div>
                    ) : showSuccess ? (
                        <SuccessScreen
                            premio={result!}
                            nome={consultor.nome}
                            alreadySpun={alreadySpun}
                            onClose={onClose}
                        />
                    ) : (
                        <>
                            {/* Cabeçalho */}
                            <div className="text-center mb-5">
                                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-bold uppercase tracking-widest mb-3">
                                    <Sparkles className="w-3.5 h-3.5" /> Venda fechada
                                </div>
                                <h2 className="text-2xl font-black text-white">Roleta de Prêmios</h2>
                                <p className="text-sm text-zinc-400 mt-1">
                                    Gire e ganhe um bônus em dinheiro na sua comissão 🤑
                                </p>
                            </div>

                            {/* Dados do consultor (pré-preenchidos) */}
                            <div className="grid grid-cols-1 gap-2 mb-5">
                                <PrefilledField label="Consultor" value={consultor.nome} />
                                <div className="grid grid-cols-2 gap-2">
                                    <PrefilledField label="E-mail" value={consultor.email} />
                                    <PrefilledField label="Celular" value={consultor.celular || '—'} />
                                </div>
                                {veiculoModelo && (
                                    <PrefilledField label="Veículo vendido" value={veiculoModelo} />
                                )}
                            </div>

                            {/* Roleta */}
                            <div className="relative mx-auto w-[300px] max-w-full aspect-square mb-5">
                                {/* ponteiro */}
                                <div className="absolute left-1/2 -top-1 -translate-x-1/2 z-10 pointer-events-none"
                                    style={{
                                        width: 0, height: 0,
                                        borderLeft: '13px solid transparent',
                                        borderRight: '13px solid transparent',
                                        borderTop: '22px solid #f4e7c3',
                                        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))',
                                    }}
                                />
                                <canvas
                                    ref={canvasRef}
                                    width={300}
                                    height={300}
                                    className="w-full h-full rounded-full shadow-[0_0_40px_rgba(200,162,74,0.25)]"
                                />
                            </div>

                            {error && (
                                <p className="text-center text-sm text-red-400 mb-3">{error}</p>
                            )}

                            {/* Botão girar */}
                            <button
                                onClick={spin}
                                disabled={spinning}
                                className="w-full min-h-[56px] rounded-2xl font-black text-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98] bg-gradient-to-r from-amber-400 to-amber-600 text-black shadow-lg shadow-amber-900/30 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {spinning ? (
                                    <><Loader2 className="w-5 h-5 animate-spin" /> Girando…</>
                                ) : (
                                    <><Gift className="w-5 h-5" /> GIRAR ROLETA</>
                                )}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function PrefilledField({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-xl bg-black/30 border border-white/10 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">{label}</div>
            <div className="text-sm text-zinc-100 font-semibold truncate">{value || '—'}</div>
        </div>
    );
}

function SuccessScreen({ premio, nome, alreadySpun, onClose }: {
    premio: number; nome: string; alreadySpun: boolean; onClose: () => void;
}) {
    const primeiroNome = (nome || 'Vendedor').split(' ')[0];
    return (
        <div className="relative py-6 text-center">
            {!alreadySpun && <Confetti />}

            <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-500/15 border border-amber-500/40 mb-4">
                <Trophy className="w-10 h-10 text-amber-400" />
            </div>

            <p className="text-sm text-zinc-400">
                {alreadySpun ? `Este veículo já foi girado, ${primeiroNome}.` : `Parabéns, ${primeiroNome}! 🎉`}
            </p>
            <p className="text-zinc-300 mt-1">
                {alreadySpun ? 'Prêmio garantido:' : 'Você ganhou:'}
            </p>

            <div className="my-4">
                <span className="text-6xl font-black bg-gradient-to-r from-amber-300 via-amber-400 to-amber-600 bg-clip-text text-transparent drop-shadow">
                    R$ {premio.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                </span>
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm font-semibold mb-6">
                <Sparkles className="w-4 h-4" /> Somado à sua comissão desta venda
            </div>

            <button
                onClick={onClose}
                className="w-full min-h-[52px] rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-bold transition active:scale-[0.98]"
            >
                Fechar
            </button>
        </div>
    );
}

/** Confete leve em CSS (sem dependências). */
function Confetti() {
    const pieces = Array.from({ length: 42 });
    const colors = ['#c8a24a', '#f4e7c3', '#34d399', '#60a5fa', '#f472b6', '#fbbf24'];
    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {pieces.map((_, i) => {
                const left = Math.random() * 100;
                const delay = Math.random() * 0.6;
                const dur = 1.6 + Math.random() * 1.4;
                const color = colors[i % colors.length];
                const size = 6 + Math.random() * 6;
                return (
                    <span
                        key={i}
                        style={{
                            position: 'absolute',
                            top: '-16px',
                            left: `${left}%`,
                            width: `${size}px`,
                            height: `${size * 0.5}px`,
                            background: color,
                            borderRadius: '1px',
                            animation: `roleta-confetti-fall ${dur}s ${delay}s ease-in forwards`,
                        }}
                    />
                );
            })}
            {/* global p/ o nome do keyframe não ser reescrito pelo styled-jsx (senão o inline não casa) */}
            <style jsx global>{`
                @keyframes roleta-confetti-fall {
                    0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
                    100% { transform: translateY(380px) rotate(540deg); opacity: 0; }
                }
            `}</style>
        </div>
    );
}
