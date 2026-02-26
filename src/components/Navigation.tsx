'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
    LayoutDashboard,
    Users,
    BarChart3,
    Car,
    Search,
    ChevronRight,
    LogOut,
    UserCircle,
    Shield,
    History
} from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase';

const NAV_ITEMS = [
    { label: 'Visão Geral', icon: LayoutDashboard, href: '/' },
    { label: 'Campanhas Ativas', icon: Search, href: '/marketing', adminOnly: true },
    { label: 'Central de Leads', icon: Users, href: '/leads' },
    { label: 'Leads Antigos', icon: History, href: '/leads-antigos' },
    { label: 'Marketing Investimento', icon: BarChart3, href: '/roi', adminOnly: true },
    { label: 'Estoque Central', icon: Car, href: '/inventory' },
    { label: 'Gerenciar Equipe', icon: Shield, href: '/admin/equipe', adminOnly: true },
];

interface NavUser {
    id?: string;
    email?: string;
    user_metadata: {
        full_name?: string;
    };
}

export const Navigation = () => {
    const pathname = usePathname();
    const router = useRouter();
    const [user, setUser] = useState<NavUser | null>(null);
    const [role, setRole] = useState<string>('consultant');

    const handleLogoClick = () => {
        window.location.reload();
    };

    useEffect(() => {
        const getUserData = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                setUser(session.user);
                // Force admin if it's Alexandre
                if (session.user.email === 'alexandre_gorges@hotmail.com') {
                    setRole('admin');
                } else {
                    const { data: consultant } = await supabase
                        .from('consultants_manos_crm')
                        .select('role')
                        .eq('auth_id', session.user.id)
                        .maybeSingle();
                    if (consultant) setRole(consultant.role);
                }
            }
        };
        getUserData();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            const currentUser = session?.user || null;
            if (currentUser) {
                setUser(currentUser);
                if (currentUser.email === 'alexandre_gorges@hotmail.com') {
                    setRole('admin');
                } else {
                    supabase
                        .from('consultants_manos_crm')
                        .select('role')
                        .eq('auth_id', currentUser.id)
                        .maybeSingle()
                        .then(({ data }) => {
                            if (data) setRole(data.role);
                        });
                }
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    return (
        <nav className="fixed left-0 top-0 h-screen w-72 bg-[#03060b] border-r border-white/5 py-10 flex flex-col items-center z-50 shadow-2xl overflow-hidden">
            {/* Brand */}
            <motion.div
                className="mb-16 flex flex-col items-center gap-4 group cursor-pointer w-full px-8"
                onClick={handleLogoClick}
                whileTap={{ scale: 0.95 }}
            >
                <div className="relative h-16 w-full flex items-center justify-center">
                    <img
                        src="https://manosveiculos.com.br/wp-content/uploads/2024/02/LogoManos.png"
                        alt="Manos Veículos"
                        className="h-14 w-auto object-contain"
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement?.querySelector('.fallback-logo')?.classList.remove('hidden');
                        }}
                    />
                    <div className="fallback-logo hidden h-12 w-12 rounded-2xl bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center shadow-[0_8px_20px_rgba(227,30,36,0.4)] group-hover:rotate-[10deg] transition-all">
                        <Car className="text-white" size={26} strokeWidth={2.5} />
                    </div>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 px-4 py-1.5 rounded-full flex items-center justify-center whitespace-nowrap">
                    <p className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em] leading-none">Plataforma CRM</p>
                </div>
            </motion.div>

            <div className="flex-1 w-full px-4 space-y-2 overflow-y-auto custom-scrollbar">
                {NAV_ITEMS.filter(item => !item.adminOnly || role === 'admin').map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.label}
                            href={item.href}
                            className={`relative flex items-center gap-4 px-6 py-4 rounded-3xl transition-all group overflow-hidden ${isActive ? 'bg-white/5 text-white shadow-inner' : 'text-white/40 hover:text-white/80 hover:bg-white/[0.02]'
                                }`}
                        >
                            <div className="shrink-0 flex items-center justify-center w-6">
                                <item.icon size={22} className={isActive ? 'text-red-500' : 'group-hover:text-white/60 transition-colors'} />
                            </div>

                            <span className="font-bold text-sm tracking-tight whitespace-nowrap">
                                {item.label}
                            </span>

                            {isActive && (
                                <motion.div
                                    layoutId="nav-glow"
                                    className="absolute left-0 w-1.5 h-6 bg-red-500 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.8)]"
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                />
                            )}
                        </Link>
                    );
                })}
            </div>

            {/* Bottom Profile / Logout */}
            <div className="mt-auto w-full px-4 pt-6 border-t border-white/5 bg-[#03060b]/80 backdrop-blur-md pb-6 space-y-4">
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className="relative shrink-0">
                            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-red-900 border border-white/10 flex items-center justify-center shadow-lg text-white font-black uppercase text-sm">
                                {user?.email ? user.email[0] : 'U'}
                                <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-[#03060b]" />
                            </div>
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-[11px] font-black text-white truncate leading-tight">
                                {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuário'}
                            </p>
                            <p className="text-[8px] text-white/30 font-bold uppercase tracking-widest truncate">
                                {role === 'admin' ? 'Acesso Gerencial' : 'Consultor Manos'}
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={handleLogout}
                        className="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg bg-white/5 border border-white/10 text-white/40 hover:bg-red-600 hover:text-white hover:border-red-600 transition-all"
                        title="Sair do Sistema"
                    >
                        <LogOut size={14} />
                    </button>
                </div>
            </div>
        </nav>
    );
};
