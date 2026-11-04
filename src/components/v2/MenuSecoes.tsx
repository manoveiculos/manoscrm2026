'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import type { NavItem, SecaoMenu } from './menuConfig';

interface Props {
    secoes: SecaoMenu[];
    ativo: string | null;
    isCollapsed: boolean;
    /** Grupos recolhíveis abertos (admin). */
    abertos: Set<string>;
    onToggleGrupo: (id: string) => void;
    onAcao: (item: NavItem) => void;
}

/** Lista do menu lateral: seções simples (vendedor/gestor) ou grupos recolhíveis (admin). */
export function MenuSecoes({ secoes, ativo, isCollapsed, abertos, onToggleGrupo, onAcao }: Props) {
    return (
        <>
            {secoes.map(secao => {
                const temAtivo = secao.itens.some(i => i.id === ativo);
                // Menu estreito (só ícones): sem cabeçalho e sem recolher.
                const aberto = isCollapsed || !secao.recolhivel || abertos.has(secao.id) || temAtivo;
                return (
                    <div key={secao.id} className="space-y-1">
                        {secao.label && !isCollapsed && (
                            secao.recolhivel ? (
                                <button
                                    type="button"
                                    onClick={() => onToggleGrupo(secao.id)}
                                    aria-expanded={aberto}
                                    className="w-full flex items-center justify-between px-3 pt-4 pb-1.5 text-[10px] font-black text-white/30 uppercase tracking-[0.3em] hover:text-white/60 transition-colors"
                                >
                                    <span>{secao.label}</span>
                                    <span className="flex items-center gap-1.5">
                                        {!aberto && <span className="text-[9px] tracking-normal font-bold text-white/25">{secao.itens.length}</span>}
                                        <ChevronDown size={12} className={`transition-transform ${aberto ? '' : '-rotate-90'}`} />
                                    </span>
                                </button>
                            ) : (
                                <p className="px-3 pt-4 pb-1.5 text-[10px] font-black text-white/25 uppercase tracking-[0.3em]">{secao.label}</p>
                            )
                        )}
                        {aberto && secao.itens.map(item => (
                            <ItemMenu key={item.id} item={item} ativo={item.id === ativo} isCollapsed={isCollapsed} onAcao={onAcao} />
                        ))}
                    </div>
                );
            })}
        </>
    );
}

function ItemMenu({ item, ativo, isCollapsed, onAcao }: { item: NavItem; ativo: boolean; isCollapsed: boolean; onAcao: (i: NavItem) => void }) {
    const classe = `relative w-full flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-4'} py-3.5 rounded-2xl transition-all group overflow-hidden text-left ${
        ativo
            ? 'bg-gradient-to-r from-white/[0.05] to-transparent text-white'
            : item.emBreve
            ? 'opacity-40 cursor-not-allowed text-white/40'
            : 'text-white/40 hover:text-white/90 hover:bg-white/[0.03]'
    }`;

    const conteudo = (
        <>
            {ativo && (
                <motion.div
                    layoutId="active-nav-indicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-red-500 rounded-r-full shadow-[0_0_12px_rgba(239,68,68,0.8)]"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
            )}
            <div className="relative shrink-0 flex items-center justify-center w-5">
                <item.icon size={19} strokeWidth={ativo ? 2.5 : 2} className={ativo ? 'text-red-500' : 'transition-colors group-hover:text-white/70'} />
            </div>
            {!isCollapsed && (
                <div className="flex flex-col min-w-0 flex-1">
                    <span className={`font-bold text-[13px] tracking-tight whitespace-nowrap ${ativo ? 'text-white' : 'group-hover:translate-x-0.5 transition-transform'}`}>
                        {item.label}
                    </span>
                    {item.emBreve && (
                        <span className="text-[8px] font-black uppercase tracking-widest text-red-500/60 leading-none mt-0.5">Em breve</span>
                    )}
                </div>
            )}
        </>
    );

    if (item.emBreve) {
        return (
            <div className={classe} title={isCollapsed ? `${item.label} (em breve)` : 'Chega na próxima fase'} aria-disabled="true">
                {conteudo}
            </div>
        );
    }
    if (item.acao) {
        return (
            <button type="button" className={classe} title={isCollapsed ? item.label : undefined} onClick={() => onAcao(item)}>
                {conteudo}
            </button>
        );
    }
    return (
        <Link href={item.href} className={classe} title={isCollapsed ? item.label : undefined}>
            {conteudo}
        </Link>
    );
}
