'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EventoCena } from '@/lib/agentes/eventos';
import { JogoView } from '@/app/agentes/_components/jogo/JogoView';

type SemId<T> = T extends unknown ? Omit<T, 'id'> : never;

const NOMES = ['Bruna', 'Marcos', 'Camila', 'Rafael', 'Thiago', 'Letícia'];
const CARROS = ['Fiat Mobi', 'BYD Dolphin', 'Jeep Compass', 'VW Polo', 'Hilux SRV', 'Onix LT'];
const VENDEDORES = ['consultor_wilson', 'consultor_victor'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export function DemoJogo() {
    const [eventos, setEventos] = useState<EventoCena[]>([]);
    const [auto, setAuto] = useState(true);
    const [hora, setHora] = useState<number | null>(null);
    const [arte, setArte] = useState(true);
    const n = useRef(0);

    const emitir = useCallback((e: SemId<EventoCena>) => {
        n.current += 1;
        setEventos(v => [...v.slice(-20), { ...e, id: `e${n.current}` } as EventoCena]);
    }, []);

    const sim = useMemo(() => ({
        'Lead novo': () => emitir({ tipo: 'lead_distribuido', de: 'distribuidor', para: pick(VENDEDORES), nome: pick(NOMES), carro: pick(CARROS) }),
        'Laura responde': () => emitir({ tipo: 'fala', agenteId: 'laura', texto: `respondeu ${pick(NOMES)} no WhatsApp` }),
        'Lead aquecendo': () => emitir({ tipo: 'lead_quente', nome: pick(NOMES), carro: pick(CARROS) }),
        'Venda!': () => emitir({ tipo: 'venda', agenteId: pick(VENDEDORES), nome: pick(NOMES), carro: pick(CARROS) }),
        'Aprovação': () => emitir({ tipo: 'aprovacao', agenteId: 'publisher', titulo: '1 item esperando a sua aprovação' }),
        'Erro': () => emitir({ tipo: 'erro', agenteId: pick(['supervisor', 'laura']), texto: 'Google Ads sem dados' }),
    }), [emitir]);

    useEffect(() => {
        if (!auto) return;
        const roteiro = [sim['Lead novo'], sim['Laura responde'], sim['Lead aquecendo'], sim['Aprovação'], sim['Lead novo'], sim['Venda!'], sim['Erro']];
        let i = 0;
        const primeiro = setTimeout(() => roteiro[i++ % roteiro.length](), 800);
        const t = setInterval(() => roteiro[i++ % roteiro.length](), 9000);
        return () => { clearTimeout(primeiro); clearInterval(t); };
    }, [auto, sim]);

    return (
        <main className="fixed inset-0 bg-[#03050a] text-white">
            <JogoView eventos={eventos} arte={arte} hora={hora} />
            <div className="absolute top-3 left-4 flex items-center gap-3">
                <h1 className="text-[20px] font-black">Central dos Agentes</h1>
                <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-[11px] font-bold text-amber-200">PROVA DE CONCEITO · eventos simulados</span>
            </div>
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-black/70 backdrop-blur px-3 py-2">
                <span className="text-[11px] font-bold text-white/50 mr-1">Simular:</span>
                {Object.entries(sim).map(([k, f]) => (
                    <button key={k} type="button" onClick={f} className="rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1 text-[12px] font-bold">{k}</button>
                ))}
                <button type="button" onClick={() => setAuto(v => !v)} className={`rounded-lg px-2.5 py-1 text-[12px] font-black ${auto ? 'bg-emerald-600' : 'bg-white/10'}`}>Auto {auto ? 'ON' : 'OFF'}</button>
                <button type="button" onClick={() => setArte(v => !v)} className="rounded-lg bg-white/10 px-2.5 py-1 text-[12px] font-bold">{arte ? 'Arte realista' : 'Desenho simples'}</button>
                <label className="ml-2 flex items-center gap-2 text-[11px] text-white/60">
                    Hora
                    <input type="range" min={0} max={23.5} step={0.5} value={hora ?? 12} onChange={e => setHora(Number(e.target.value))} className="w-28" />
                    <button type="button" onClick={() => setHora(null)} className="rounded bg-white/10 px-1.5 py-0.5 text-[11px]">{hora == null ? 'agora' : `${Math.floor(hora)}h`}</button>
                </label>
            </div>
        </main>
    );
}
