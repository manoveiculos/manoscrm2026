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
    History,
    Menu,
    Sparkles,
    Zap,
    CreditCard,
    X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { UserProfileModal } from './UserProfileModal';


interface NavItem {
    label: string;
    icon: any;
    href: string;
    adminOnly?: boolean;
    blocked?: boolean;
}

const NAV_ITEMS: NavItem[] = [
    { label: 'Visão Geral', icon: LayoutDashboard, href: '/' },
    { label: 'Análise Inteligente', icon: Sparkles, href: '/analysis' },
    { label: 'Campanhas Ativas', icon: Search, href: '/marketing', adminOnly: true },
    { label: 'Central de Leads', icon: Users, href: '/leads' },
    { label: 'Análise de Crédito', icon: CreditCard, href: '/finance' },
    { label: 'Reativação de Leads', icon: Zap, href: '/leads-antigos' },
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
    const [role, setRole] = useState<string | null>(null);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);


    const handleLogoClick = () => {
        window.location.reload();
    };

    // Close mobile menu on route change
    useEffect(() => {
        setMobileOpen(false);
    }, [pathname]);

    useEffect(() => {
        const getUserData = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                setUser(session.user);
                const { data: consultant } = await supabase
                    .from('consultants_manos_crm')
                    .select('role')
                    .eq('auth_id', session.user.id)
                    .maybeSingle();

                if (consultant) {
                    setRole(consultant.role);
                } else if (session.user.email === 'alexandre_gorges@hotmail.com') {
                    setRole('admin');
                } else {
                    setRole('consultant');
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
        window.location.href = '/login';
    };

    const sidebarContent = (
        <>
            {/* Brand */}
            <motion.div
                className="mb-10 md:mb-16 flex-col items-center gap-3 md:gap-4 group cursor-pointer w-full px-6 md:px-8"
                onClick={handleLogoClick}
                whileTap={{ scale: 0.95 }}
            >
                <div className="relative h-12 md:h-16 w-full flex items-center justify-center">
                    <img
                        src="https://manosveiculos.com.br/wp-content/uploads/2024/02/LogoManos.png"
                        alt="Manos Veículos"
                        className="h-10 md:h-14 w-auto object-contain"
                        onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            e.currentTarget.parentElement?.querySelector('.fallback-logo')?.classList.remove('hidden');
                        }}
                    />
                    <div className="fallback-logo hidden h-10 md:h-12 w-10 md:w-12 rounded-2xl bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center shadow-[0_8px_20px_rgba(227,30,36,0.4)] group-hover:rotate-[10deg] transition-all">
                        <Car className="text-white" size={22} strokeWidth={2.5} />
                    </div>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 px-4 py-1.5 rounded-full flex items-center justify-center whitespace-nowrap">
                    <p className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em] leading-none">Plataforma CRM</p>
                </div>
            </motion.div>

            <div className="flex-1 w-full px-3 md:px-4 space-y-1.5 md:space-y-2 overflow-y-auto custom-scrollbar">
                {NAV_ITEMS.filter(item => !item.adminOnly || role === 'admin').map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.label}
                            href={item.blocked ? '#' : item.href}
                            onClick={(e) => item.blocked && e.preventDefault()}
                            className={`relative flex items-center gap-3 md:gap-4 px-5 md:px-6 py-3.5 md:py-4 rounded-2xl md:rounded-3xl transition-all group overflow-hidden ${isActive ? 'bg-white/5 text-white shadow-inner' :
                                item.blocked ? 'opacity-40 cursor-not-allowed grayscale' : 'text-white/40 hover:text-white/80 hover:bg-white/[0.02]'
                                }`}
                        >
                            <div className="shrink-0 flex items-center justify-center w-6">
                                <item.icon size={20} className={isActive ? 'text-red-500' : 'group-hover:text-white/60 transition-colors'} />
                            </div>

                            <div className="flex flex-col">
                                <span className={`font-bold text-sm tracking-tight whitespace-nowrap ${item.blocked ? 'text-white/30' : ''}`}>
                                    {item.label}
                                </span>
                                {(item.blocked || item.href === '/finance') && (
                                    <span className="text-[8px] font-black uppercase tracking-widest text-red-500/60 leading-none mt-0.5">Em breve</span>
                                )}
                            </div>

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
            <div className="mt-auto w-full px-3 md:px-4 pt-4 md:pt-6 border-t border-white/5 bg-[#03060b]/80 backdrop-blur-md pb-4 md:pb-6 space-y-4">
                <div className="flex items-center justify-between px-2">
                    <div 
                        className="flex items-center gap-3 overflow-hidden cursor-pointer hover:bg-white/5 p-1 rounded-xl transition-colors group"
                        onClick={() => setIsProfileModalOpen(true)}
                        title="Configurações de Perfil"
                    >
                        <div className="relative shrink-0">
                            <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gradient-to-br from-red-600 to-red-900 border border-white/10 flex items-center justify-center shadow-lg text-white font-black uppercase text-sm group-hover:shadow-red-500/20 transition-all">
                                {user?.email ? user.email[0] : 'U'}
                                <div className="absolute -bottom-1 -right-1 w-3 h-3 md:w-3.5 md:h-3.5 rounded-full bg-emerald-500 border-2 border-[#03060b]" />
                            </div>
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-[11px] font-black text-white truncate leading-tight group-hover:text-red-500 transition-colors">
                                {(user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuário').split(' ')[0]}
                            </p>
                            <p className="text-[8px] text-white/30 font-bold uppercase tracking-widest truncate">
                                {role === 'admin' ? 'Acesso Gerencial' : role === 'consultant' ? 'Consultor Manos' : 'Processando...'}
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
        </>
    );

    return (
        <>
            {/* Mobile Top Bar */}
            <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-[#03060b]/95 backdrop-blur-xl border-b border-white/5 z-[90] flex items-center justify-between px-4">
                <button
                    onClick={() => setMobileOpen(true)}
                    className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all active:scale-95"
                >
                    <Menu size={20} />
                </button>
                <img
                    src="https://manosveiculos.com.br/wp-content/uploads/2024/02/LogoManos.png"
                    alt="Manos"
                    className="h-8 w-auto object-contain"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
                <div className="w-10" /> {/* Spacer for centering */}
            </div>

            {/* Desktop Sidebar */}
            <nav className="hidden md:flex fixed left-0 top-0 h-screen w-72 bg-[#03060b] border-r border-white/5 py-10 flex-col items-center z-50 shadow-2xl overflow-hidden">
                {sidebarContent}
            </nav>

            {/* Mobile Sidebar Overlay */}
            <AnimatePresence>
                {mobileOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setMobileOpen(false)}
                            className="md:hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-[95]"
                        />
                        <motion.nav
                            initial={{ x: '-100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '-100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
                            className="md:hidden fixed left-0 top-0 h-screen w-72 bg-[#03060b] border-r border-white/5 py-8 flex-col items-center z-[100] shadow-2xl overflow-hidden"
                        >
                            <button
                                onClick={() => setMobileOpen(false)}
                                className="absolute top-4 right-4 h-9 w-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all z-10"
                            >
                                <X size={18} />
                            </button>
                            {sidebarContent}
                        </motion.nav>
                    </>
                )}
            </AnimatePresence>

            <UserProfileModal 
                isOpen={isProfileModalOpen} 
                onClose={() => setIsProfileModalOpen(false)} 
                user={user}
                role={role}
            />
        </>
    );
};

