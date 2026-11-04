'use client';

import Link from 'next/link';
import type { NavItem } from './menuConfig';

interface Props {
    itens: NavItem[];
    ativo: string | null;
    onAcao: (item: NavItem) => void;
    /** Preview: posição estática em vez de fixa no rodapé. */
    estatica?: boolean;
}

/**
 * Barra fixa do celular com os 5 itens do vendedor (Fila, Conversas, Agenda,
 * Leads, Perfil). Cada alvo tem pelo menos 56 px de altura.
 */
export function BarraInferior({ itens, ativo, onAcao, estatica = false }: Props) {
    if (itens.length === 0) return null;
    return (
        <nav
            aria-label="Navegação do vendedor"
            className={`${estatica ? 'relative' : 'md:hidden fixed bottom-0 left-0 right-0'} z-[90] bg-[#0C0C0F]/95 backdrop-blur-xl border-t border-white/[0.08] pb-[env(safe-area-inset-bottom)]`}
        >
            <ul className="grid" style={{ gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))` }}>
                {itens.map(item => {
                    const isAtivo = item.id === ativo;
                    const classe = `relative flex flex-col items-center justify-center gap-1 min-h-[60px] w-full px-1 text-[11px] font-bold transition-colors ${
                        isAtivo ? 'text-white' : item.emBreve ? 'text-white/25' : 'text-white/50 active:text-white'
                    }`;
                    const conteudo = (
                        <>
                            {isAtivo && <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-b-full bg-red-500" />}
                            <item.icon size={22} strokeWidth={isAtivo ? 2.5 : 2} className={isAtivo ? 'text-red-500' : ''} />
                            <span className="leading-none truncate max-w-full">{item.curto || item.label}</span>
                            {item.emBreve && <span className="text-[8px] uppercase tracking-wider text-red-500/60 leading-none">em breve</span>}
                        </>
                    );
                    return (
                        <li key={item.id}>
                            {item.emBreve ? (
                                <div className={classe} aria-disabled="true" title="Chega na próxima fase">{conteudo}</div>
                            ) : item.acao ? (
                                <button type="button" className={classe} onClick={() => onAcao(item)}>{conteudo}</button>
                            ) : (
                                <Link href={item.href} className={classe} aria-current={isAtivo ? 'page' : undefined}>{conteudo}</Link>
                            )}
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
