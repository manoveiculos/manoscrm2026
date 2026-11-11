'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { estadoDosAgentes, type EntradaAgentes, type RegistroAgente } from '@/lib/agentes/estado';
import { EscritorioView } from '@/app/agentes/_components/escritorio/EscritorioView';
import type { EventoCena, PainelTelao } from '@/app/agentes/_components/escritorio/cena';

const min = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

/** Dados de demonstração no mesmo formato que a API real devolve. */
function entradaDemo(): EntradaAgentes {
    const r = (agenteId: string, m: number, frase: string, status: RegistroAgente['status'] = 'ok', custoUsd?: number): RegistroAgente => ({ agenteId, em: min(m), status, frase, custoUsd });
    return {
        agora: Date.now(),
        configInstalada: true,
        configs: { laura: { modo: 'ensaio' } },
        modoLaura: 'ensaio',
        registros: [
            r('laura', 62, 'respondeu Bruna no WhatsApp (n8n)', 'ok', 0.161),
            r('distribuidor', 44, 'lead → vendedor'),
            r('supervisor', 0.5, 'varredura de SLA · 0,7 s'),
            r('copiloto', 300, 'analisou uma conversa e sugeriu o próximo passo'),
            r('consultor_wilson', 600, 'pegou um lead da roleta'),
            r('vitrine', 7200, 'rejeitado por você: Pauta 06/11 (Sexta)'),
            r('diretor_arte', 7200, 'Pauta 06/11 (Sexta) — Anúncio de venda: BYD Dolphin EV'),
            r('publisher', 15840, 'item esperando aprovação', 'aguardando'),
            r('trafego', 360, 'Vigilante Meta Ads — 11/11 — Crítico (anúncio Suvs com problema)'),
            r('sentinela', 8640, 'Checagem semanal de saúde dos squads — 2026-11-05'),
            r('recepcao', 8000, 'Leads do dia — 5 fichas, 1 com entrada ou troca'),
        ],
        decisoes: [
            { id: 'ap1', tipo: 'aprovacao', titulo: 'Publicar post BYD Dolphin', em: min(15840), agenteId: 'publisher' },
            ...Array.from({ length: 30 }, (_, i) => ({ id: `sd${i}`, tipo: 'conversa_sem_dono' as const, titulo: `Conversa ${i}`, em: min(100 + i) })),
        ],
    };
}

const PAINEL: PainelTelao = {
    leads: { quente: 7, morno: 19, frio: 44, semClassificacao: 120 },
    vendasHoje: 2,
    vendasMes: 5,
    funil: [
        { rotulo: 'Novos', n: 38 }, { rotulo: 'Em atendimento', n: 21 }, { rotulo: 'Visita agendada', n: 8 },
        { rotulo: 'Proposta', n: 4 }, { rotulo: 'Vendido', n: 2 },
    ],
};

type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

const NOMES = ['Bruna', 'Marcos', 'Camila', 'Rafael', 'Thiago', 'Letícia'];
const CARROS = ['Fiat Mobi', 'BYD Dolphin', 'Jeep Compass', 'VW Polo', 'Hilux SRV', 'Onix LT'];
const CONSULTORES = ['consultor_wilson', 'consultor_victor', 'consultor_sergio'];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export function DemoEscritorio() {
    // Só monta depois do navegador carregar: os dados dependem da hora (evita divergência com o HTML do servidor).
    const [agora, setAgora] = useState<number | null>(null);
    useEffect(() => { setAgora(Date.now()); }, []);
    const dados = useMemo(() => (agora ? estadoDosAgentes(entradaDemo()) : null), [agora]);
    const [eventos, setEventos] = useState<EventoCena[]>([]);
    const [auto, setAuto] = useState(true);
    const n = useRef(0);

    const emitir = useCallback((e: DistributiveOmit<EventoCena, 'id'>) => {
        n.current += 1;
        setEventos(v => [...v.slice(-20), { ...e, id: `e${n.current}` } as EventoCena]);
    }, []);

    const sim = useMemo(() => ({
        'Lead novo': () => emitir({ tipo: 'lead_distribuido', de: 'distribuidor', para: pick(CONSULTORES), nome: pick(NOMES), carro: pick(CARROS) }),
        'Laura responde': () => emitir({ tipo: 'fala', agenteId: 'laura', texto: `respondeu ${pick(NOMES)} no WhatsApp` }),
        'Lead aquecendo': () => emitir({ tipo: 'lead_quente', nome: pick(NOMES), carro: pick(CARROS) }),
        'Venda!': () => emitir({ tipo: 'venda', agenteId: pick(CONSULTORES), nome: pick(NOMES), carro: pick(CARROS) }),
        'Aprovação': () => emitir({ tipo: 'aprovacao', agenteId: pick(['publisher', 'trafego', 'perito']), titulo: '1 item esperando a sua aprovação' }),
        'Erro': () => emitir({ tipo: 'erro', agenteId: pick(['trafego', 'sentinela', 'vitrine']), texto: 'Google Ads sem dados' }),
        'Copiloto': () => emitir({ tipo: 'fala', agenteId: 'copiloto', texto: 'sugeriu o próximo passo' }),
    }), [emitir]);

    // Auto-demo: um evento a cada ~4,5 s, sorteado.
    useEffect(() => {
        if (!auto) return;
        const roteiro = [sim['Lead novo'], sim['Laura responde'], sim['Copiloto'], sim['Lead novo'], sim['Lead aquecendo'], sim['Aprovação'], sim['Laura responde'], sim['Venda!'], sim['Erro']];
        let i = 0;
        const t = setInterval(() => { roteiro[i % roteiro.length](); i++; }, 4500);
        return () => clearInterval(t);
    }, [auto, sim]);

    return (
        <main className="min-h-screen bg-[#03060b] text-white px-4 py-3">
            {dados && agora && <EscritorioView dados={dados} painel={PAINEL} eventos={eventos} agora={agora} rotuloModo="PRÉVIA · dados de demonstração" />}
            <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 flex flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-black/70 backdrop-blur px-3 py-2">
                <span className="text-[11px] font-bold text-white/50 mr-1">Simular:</span>
                {Object.entries(sim).map(([k, f]) => (
                    <button key={k} type="button" onClick={f} className="rounded-lg bg-white/10 hover:bg-white/20 px-2.5 py-1 text-[12px] font-bold">{k}</button>
                ))}
                <button type="button" onClick={() => setAuto(v => !v)} className={`rounded-lg px-2.5 py-1 text-[12px] font-black ${auto ? 'bg-emerald-600' : 'bg-white/10'}`}>Auto-demo {auto ? 'ON' : 'OFF'}</button>
            </div>
        </main>
    );
}
