'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Car, Wallet, Store, ShoppingCart, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const TABS = [
    { href: '/repasse', label: 'Início', icon: Home },
    { href: '/repasse/carros', label: 'Carros', icon: Car },
    { href: '/repasse/caixa', label: 'Caixa', icon: Wallet },
    { href: '/repasse/lojas', label: 'Lojas', icon: Store },
    { href: '/compras', label: 'Compras', icon: ShoppingCart },
];

export default function RepasseLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname() || '';
    const [allowed, setAllowed] = useState<boolean | null>(null);

    useEffect(() => {
        (async () => {
            const { data: { session } } = await supabase.auth.getSession();
            // Repasse é por usuário: qualquer um logado tem o SEU (isolado por email).
            const email = session?.user?.email?.toLowerCase();
            setAllowed(!!email);
        })();
    }, []);

    if (allowed === null) return <div className="p-10 text-center text-white/50">Carregando…</div>;
    if (!allowed) return (
        <div className="p-10 text-center">
            <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h1 className="text-lg font-bold text-white">Faça login</h1>
            <p className="text-white/50 text-sm mt-1">Entre com sua conta para acessar o seu Repasse.</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#0C0C0F] text-white flex flex-col max-w-md mx-auto relative">
            <main className="flex-1 pb-24">{children}</main>
            <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-[#131318]/95 backdrop-blur-xl border-t border-white/10 grid grid-cols-5 z-50">
                {TABS.map((t) => {
                    const active = t.href === '/repasse' ? pathname === '/repasse' : pathname.startsWith(t.href);
                    return (
                        <Link key={t.href} href={t.href} className={`flex flex-col items-center gap-1 py-3 transition-colors ${active ? 'text-red-500' : 'text-white/45'}`}>
                            <t.icon size={22} strokeWidth={active ? 2.5 : 2} />
                            <span className="text-[10px] font-bold">{t.label}</span>
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
