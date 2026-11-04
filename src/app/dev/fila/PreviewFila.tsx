'use client';

import { useMemo, useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import type { Perfil } from '@/lib/perfil';
import { montarFila } from '@/lib/fila/montarFila';
import { dicaDaSemana } from '@/lib/fila/dicas';
import { secoesDoMenu, itensBarraInferior, itemAtivo } from '@/components/v2/menuConfig';
import { MenuSecoes } from '@/components/v2/MenuSecoes';
import { BarraInferior } from '@/components/v2/BarraInferior';
import { FilaView } from '@/app/fila/_components/FilaView';
import type { FilaApi } from '@/app/fila/_components/tipos';
import { AGORA_EXEMPLO, entradaExemplo } from './exemplo';

const espera = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Mesmas ações da tela real, sem gravar nada. */
const apiFicticia: FilaApi = {
    registrarLigacao: async () => ({ ok: true }),
    marcarRetorno: async () => { await espera(300); return { ok: true }; },
    marcarVisita: async () => { await espera(300); return { ok: true }; },
    registrarResultado: async () => { await espera(300); return { ok: true }; },
};

const EMAIL_FICTICIO: Record<Perfil, string> = {
    vendedor: 'vendedor@exemplo.test',
    gestor: 'gestor@exemplo.test',
    admin: 'admin@exemplo.test',
};

export function PreviewFila({ vista, perfil }: { vista: 'fila' | 'menu'; perfil: Perfil }) {
    const fila = useMemo(() => montarFila(entradaExemplo()), []);
    const ctx = { perfil, email: EMAIL_FICTICIO[perfil] };
    const secoes = secoesDoMenu(ctx);
    const barra = itensBarraInferior(ctx);
    const ativo = itemAtivo('/fila', secoes.flatMap(s => s.itens));
    const [abertos, setAbertos] = useState<Set<string>>(new Set(['vendas']));
    const [menuAberto, setMenuAberto] = useState(vista === 'menu');

    return (
        <div className="min-h-screen bg-[#03060b] text-white">
            {/* Barra de topo do celular (igual à do CRM) */}
            <div className="fixed top-0 left-0 right-0 h-14 bg-[#0C0C0F]/95 backdrop-blur-xl border-b border-white/[0.06] z-[90] flex items-center justify-between px-4">
                <button onClick={() => setMenuAberto(true)} aria-label="Abrir menu" className="h-10 w-10 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/50">
                    <Menu size={18} />
                </button>
                <div className="flex flex-col items-center">
                    <span className="text-[11px] font-black text-white leading-none">Manos CRM</span>
                    <span className="text-[8px] font-bold text-amber-400 uppercase tracking-widest mt-0.5">prévia · dados fictícios</span>
                </div>
                <div className="w-10" />
            </div>

            <main className="px-4 pt-[72px] pb-28">
                <FilaView
                    fila={fila}
                    dica={dicaDaSemana(AGORA_EXEMPLO)}
                    nome="Vendedor Exemplo"
                    carregando={false}
                    atualizadoEm={AGORA_EXEMPLO}
                    api={apiFicticia}
                    onAtualizar={() => { /* prévia */ }}
                    agoraFixo={AGORA_EXEMPLO}
                />
            </main>

            {/* Menu lateral (gaveta do celular) */}
            {menuAberto && (
                <>
                    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[95]" onClick={() => setMenuAberto(false)} />
                    <nav className="fixed left-0 top-0 h-screen w-72 max-w-[85vw] bg-[#0C0C0F] border-r border-white/[0.06] py-6 flex flex-col z-[100]">
                        <button onClick={() => setMenuAberto(false)} aria-label="Fechar menu" className="absolute top-4 right-4 h-9 w-9 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/40">
                            <X size={16} />
                        </button>
                        <div className="mb-6 px-5 flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-red-600/20 border border-red-500/30 flex items-center justify-center text-[11px] font-black text-red-300">M</div>
                            <div>
                                <p className="text-sm font-black">Manos Veículos</p>
                                <p className="text-[9px] text-white/30 font-bold uppercase tracking-[0.2em]">Perfil: {perfil}</p>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto px-3 space-y-1">
                            <MenuSecoes
                                secoes={secoes}
                                ativo={ativo}
                                isCollapsed={false}
                                abertos={abertos}
                                onToggleGrupo={id => setAbertos(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; })}
                                onAcao={() => { /* prévia */ }}
                            />
                        </div>
                        <div className="px-3 pt-4 border-t border-white/[0.06] flex items-center justify-between">
                            <span className="text-[12px] font-bold text-white/70 px-2">Vendedor Exemplo</span>
                            <span className="h-8 w-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-white/35"><LogOut size={14} /></span>
                        </div>
                    </nav>
                </>
            )}

            <div className="fixed bottom-0 left-0 right-0 z-[90]">
                <BarraInferior itens={barra} ativo={ativo} onAcao={() => { /* prévia */ }} estatica />
            </div>
        </div>
    );
}
