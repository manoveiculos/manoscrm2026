'use client';

import type { EstadoAgente } from '@/lib/agentes/estado';

const PESSOAS: Record<string, { pele: string; cabelo: string; camisa: string }> = {
    consultor_wilson: { pele: '#e0b08a', cabelo: '#1c1410', camisa: '#2563eb' },
    consultor_victor: { pele: '#c98f68', cabelo: '#2b1d14', camisa: '#0d9488' },
    consultor_sergio: { pele: '#f0c8a0', cabelo: '#6b4a2a', camisa: '#7c3aed' },
};

const COR: Record<EstadoAgente, string> = {
    trabalhando: '#34d399',
    erro: '#f87171',
    aguardando: '#f87171',
    desligado: '#52525b',
    ocioso: '#e5e7eb',
};

/** Robô (agentes de IA) ou pessoa (consultores). Tudo em SVG, animado por CSS (classes em EscritorioView). */
export function Avatar({ id, estado, ensaio }: { id: string; estado: EstadoAgente; ensaio: boolean }) {
    const cor = ensaio && estado === 'ocioso' ? '#fbbf24' : COR[estado];
    const pessoa = PESSOAS[id];
    const apagado = estado === 'desligado';

    return (
        <svg viewBox="0 0 64 64" width={72} height={72} className={`av av-${estado}`} aria-hidden>
            {pessoa ? (
                <g className="sv respira">
                    <path d="M8 64 Q8 44 32 44 Q56 44 56 64Z" fill={apagado ? '#3f3f46' : pessoa.camisa} />
                    <rect x="27" y="36" width="10" height="9" rx="3" fill={pessoa.pele} />
                    <circle cx="32" cy="26" r="13" fill={apagado ? '#71717a' : pessoa.pele} />
                    <path d="M19 25 Q19 11 32 11 Q45 11 45 25 Q40 17 32 17 Q24 17 19 25Z" fill={pessoa.cabelo} />
                    <g className="sv pisca"><g className={`sv ${estado === 'ocioso' ? 'olha' : ''}`}><circle cx="27" cy="27" r="1.7" fill="#111" /><circle cx="37" cy="27" r="1.7" fill="#111" /></g></g>
                    <path d="M28 33 Q32 36 36 33" stroke="#111" strokeWidth="1.4" fill="none" strokeLinecap="round" />
                    {estado === 'trabalhando' && <circle cx="50" cy="50" r="3" fill={cor} className="pulso" />}
                </g>
            ) : (
                <g className={`sv respira ${estado === 'ocioso' ? 'balanceia' : ''}`}>
                    <line x1="32" y1="6" x2="32" y2="14" stroke={cor} strokeWidth="2" opacity=".7" />
                    <circle cx="32" cy="5" r="3" fill={cor} className={estado === 'trabalhando' || estado === 'aguardando' ? 'pulso' : ''} />
                    <path d="M8 64 Q8 46 32 46 Q56 46 56 64Z" fill="#1d1d28" stroke={cor} strokeOpacity=".35" />
                    <rect x="13" y="14" width="38" height="29" rx="10" fill="#15151c" stroke={cor} strokeOpacity=".7" strokeWidth="1.6" />
                    <g className="sv pisca"><g className={`sv ${estado === 'ocioso' ? 'olha' : ''}`}>
                        <rect x="21" y="24" width="7" height="9" rx="3.5" fill={cor} />
                        <rect x="36" y="24" width="7" height="9" rx="3.5" fill={cor} />
                    </g></g>
                    <rect x="26" y="37" width="12" height="2.4" rx="1.2" fill={cor} opacity={estado === 'trabalhando' ? 1 : 0.35} className={estado === 'trabalhando' ? 'fala' : ''} />
                </g>
            )}
            {estado === 'ocioso' && (
                <g aria-hidden>
                    <circle cx="54" cy="12" r="1.6" fill={cor} className="ponto-pensa" />
                    <circle cx="58" cy="7" r="2.2" fill={cor} className="ponto-pensa" style={{ animationDelay: '.3s' }} />
                    <circle cx="61" cy="2.5" r="2.8" fill={cor} className="ponto-pensa" style={{ animationDelay: '.6s' }} />
                </g>
            )}
            {estado === 'aguardando' && (
                <g className="sv acena" style={{ transformOrigin: '52px 50px' }}>
                    <line x1="52" y1="50" x2="59" y2="28" stroke={pessoa ? pessoa.pele : '#f87171'} strokeWidth="5" strokeLinecap="round" />
                    <circle cx="59" cy="26" r="4" fill={pessoa ? pessoa.pele : '#f87171'} />
                </g>
            )}
        </svg>
    );
}
