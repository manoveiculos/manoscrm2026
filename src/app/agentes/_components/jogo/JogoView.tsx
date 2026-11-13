'use client';

import { useEffect, useRef } from 'react';
import type { EventoCena } from '@/lib/agentes/eventos';
import { MotorJogo } from './motor';

/**
 * Cena isométrica ao vivo (prova de conceito). Recebe os mesmos EventoCena do escritório SVG.
 * O laço usa requestAnimationFrame e, se o navegador pausar os quadros (aba/painel oculto),
 * um temporizador de segurança continua avançando a cena.
 */
export function JogoView({ eventos, hora = null, vendasMes, leads }: {
    eventos: EventoCena[];
    hora?: number | null;
    vendasMes?: number;
    leads?: { quente: number; morno: number; frio: number };
}) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const caixa = useRef<HTMLDivElement>(null);
    const motor = useRef<MotorJogo | null>(null);
    const vistos = useRef<Set<string>>(new Set());

    if (!motor.current) motor.current = new MotorJogo();

    useEffect(() => {
        const m = motor.current!;
        m.hora = hora;
        if (typeof vendasMes === 'number') m.vendasMes = vendasMes;
        if (leads) m.leads = leads;
    }, [hora, vendasMes, leads]);

    useEffect(() => {
        const m = motor.current!;
        for (const ev of eventos) {
            if (vistos.current.has(ev.id)) continue;
            vistos.current.add(ev.id);
            m.emitir(ev);
        }
    }, [eventos]);

    useEffect(() => {
        const el = canvas.current, cx = caixa.current;
        if (!el || !cx) return;
        const ctx = el.getContext('2d');
        if (!ctx) return;
        let w = 0, h = 0, dpr = 1;
        const medir = () => {
            dpr = Math.min(2, window.devicePixelRatio || 1);
            w = cx.clientWidth; h = cx.clientHeight;
            el.width = Math.round(w * dpr); el.height = Math.round(h * dpr);
        };
        medir();
        const ro = new ResizeObserver(medir);
        ro.observe(cx);

        let ultimo = performance.now();
        let raf = 0;
        const passo = () => {
            const agora = performance.now();
            const dt = Math.min(0.1, (agora - ultimo) / 1000);
            ultimo = agora;
            motor.current!.atualizar(dt);
            motor.current!.desenhar(ctx, w, h, dpr);
        };
        const laco = () => { passo(); raf = requestAnimationFrame(laco); };
        raf = requestAnimationFrame(laco);
        const guarda = setInterval(() => { if (performance.now() - ultimo > 120) passo(); }, 60);
        return () => { cancelAnimationFrame(raf); clearInterval(guarda); ro.disconnect(); };
    }, []);

    return (
        <div ref={caixa} className="relative w-full h-full">
            <canvas ref={canvas} className="absolute inset-0 w-full h-full block" aria-label="Escritório da Manos Veículos ao vivo" />
        </div>
    );
}
