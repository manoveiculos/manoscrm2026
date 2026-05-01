'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
    Activity, // Pulse/Cockpit
    Users, // Pipeline de leads
    KanbanSquare, // Pipeline
    CarFront, // Estoque
    BarChart3, // Analytics
    LogOut,
    Menu,
    X,
    Target, // Icone para Campanhas
    Shield, // Icone para Gestão de Equipe
    Bot, // Icone para Cowork IA
    Trophy, // Icone para Ranking
    ClipboardCheck, // Icone para Gestão de Vendas
    LayoutDashboard,
    Database, // Icone para Nutrição/Banco de Dados
    SlidersHorizontal, // Calibração da IA
    DollarSign,
    Radar, // Radar de Tráfego
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { UserProfileModal } from '@/components/UserProfileModal'; // using existing profile modal
import { useAIAlerts } from '@/hooks/useAIAlerts';
import { NotificationBell } from '@/components/v2/NotificationBell';

interface NavItem {
    label: string;
    icon: any;
    href: string;
    adminOnly?: boolean;
    blocked?: boolean;
}

const NAV_ITEMS: NavItem[] = [
    { label: 'Inbox', icon: Bot, href: '/inbox' },
    { label: 'Pipeline', icon: KanbanSquare, href: '/pipeline' },
    { label: 'Leads', icon: LayoutDashboard, href: '/leads' },
    { label: 'Dashboard', icon: BarChart3, href: '/' },
    { label: 'Conversão', icon: BarChart3, href: '/admin/conversion', adminOnly: true },
    { label: 'Resgate', icon: Bot, href: '/admin/rescue', adminOnly: true },
    { label: 'Consultores', icon: Shield, href: '/admin/users', adminOnly: true },
    { label: 'Saúde', icon: Activity, href: '/admin/health', adminOnly: true },
    { label: 'SDR Bench', icon: Bot, href: '/admin/sdr-bench', adminOnly: true },
    { label: 'Configurações', icon: SlidersHorizontal, href: '/admin/config', adminOnly: true },
];

interface NavUser {
    id?: string;
    email?: string;
    user_metadata: {
        full_name?: string;
    };
}

export const NavigationV2 = () => {
    const pathname = usePathname();
    const router = useRouter();
    const [user, setUser] = useState<NavUser | null>(null);
    const [role, setRole] = useState<string | null>(null);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const { count: aiAlertCount } = useAIAlerts();

    // Load collapse state
    useEffect(() => {
        const saved = localStorage.getItem('nav_collapsed');
        if (saved === 'true') setIsCollapsed(true);
    }, []);

    const toggleCollapse = () => {
        const newState = !isCollapsed;
        setIsCollapsed(newState);
        localStorage.setItem('nav_collapsed', String(newState));
    };

    const handleLogoClick = () => {
        router.push('/');
    };

    useEffect(() => {
        setMobileOpen(false);
    }, [pathname]);

    useEffect(() => {
        const getUserData = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUser(user as any);
                const { data: consultant } = await supabase
                    .from('consultants_manos_crm')
                    .select('role')
                    .eq('auth_id', user.id)
                    .maybeSingle();

                if (consultant) {
                    setRole(consultant.role);
                } else if (user.email === 'alexandre_gorges@hotmail.com') {
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
            {/* Toggle Button for Desktop */}
            <button 
                onClick={toggleCollapse}
                className="hidden md:flex absolute -right-3 top-20 h-6 w-6 rounded-full bg-[#1A1A20] border border-white/10 items-center justify-center text-white/40 hover:text-white hover:border-white/20 transition-all z-[60] shadow-xl"
            >
                <motion.div animate={{ rotate: isCollapsed ? 180 : 0 }}>
                    <Menu size={12} />
                </motion.div>
            </button>

            {/* Logo Interativo (Home) */}
            <Link
                href="/"
                className={`mb-10 flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-5'} cursor-pointer group transition-all relative py-2 rounded-2xl hover:bg-white/[0.02] active:scale-[0.98] focus:outline-none`}
            >
                <div className="h-9 w-9 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-center shrink-0 group-hover:border-red-500/30 group-hover:bg-red-500/5 group-hover:shadow-[0_0_15px_rgba(239,68,68,0.1)] transition-all overflow-hidden p-1.5">
                    <img 
                        src="https://manosveiculos.com.br/wp-content/uploads/2024/02/LogoManos.png" 
                        alt="Manos" 
                        className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-300"
                    />
                </div>
                {!isCollapsed && (
                    <motion.div 
                        initial={{ opacity: 0, x: -10 }} 
                        animate={{ opacity: 1, x: 0 }}
                        className="min-w-0 flex flex-col"
                    >
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-black text-white tracking-tight group-hover:text-red-500 transition-colors">Manos Veículos</span>
                        </div>
                        <p className="text-[9px] text-white/30 font-bold uppercase tracking-[0.2em] leading-none">Premium Intelligence</p>
                    </motion.div>
                )}
            </Link>

            <div className={`flex-1 w-full ${isCollapsed ? 'px-2' : 'px-3'} space-y-1 overflow-y-auto custom-scrollbar transition-all`}>
                {!isCollapsed && (
                    <div className="px-3 mb-4 mt-2">
                        <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Navegação Principal</p>
                    </div>
                )}
                {NAV_ITEMS.filter(item => {
                    const isAdmin = role === 'admin';
                    if (item.adminOnly && !isAdmin) return false;
                    return true;
                }).map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    return (
                        <Link
                            key={item.label}
                            href={item.blocked ? '#' : item.href}
                            title={isCollapsed ? item.label : undefined}
                            onClick={(e) => item.blocked && e.preventDefault()}
                            className={`relative flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-4'} py-3.5 rounded-2xl transition-all group overflow-hidden ${
                                isActive
                                    ? 'bg-gradient-to-r from-white/[0.05] to-transparent text-white'
                                    : item.blocked
                                    ? 'opacity-30 cursor-not-allowed'
                                    : 'text-white/40 hover:text-white/90 hover:bg-white/[0.03]'
                            }`}
                        >
                            {/* Indicador de borda ativa com Glow */}
                            {isActive && (
                                <motion.div 
                                    layoutId="active-nav-indicator"
                                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-red-500 rounded-r-full shadow-[0_0_12px_rgba(239,68,68,0.8)]"
                                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                />
                            )}

                            <div className="relative shrink-0 flex items-center justify-center w-5">
                                <item.icon
                                    size={19}
                                    strokeWidth={isActive ? 2.5 : 2}
                                    className={isActive ? 'text-red-500' : 'transition-colors group-hover:text-white/70'}
                                />
                            </div>
                            {!isCollapsed && (
                                <motion.div
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="flex flex-col min-w-0 flex-1"
                                >
                                    <span className={`font-bold text-[13px] tracking-tight whitespace-nowrap ${isActive ? 'text-white' : 'group-hover:translate-x-0.5 transition-transform'}`}>
                                        {item.label}
                                    </span>
                                    {item.blocked && (
                                        <span className="text-[8px] font-black uppercase tracking-widest text-red-500/40 leading-none mt-0.5">Em breve</span>
                                    )}
                                </motion.div>
                            )}
                        </Link>
                    );
                })}

            </div>

            {/* Sininho de Notificação de Novos Leads */}
            <div className={`w-full ${isCollapsed ? 'px-2' : 'px-3'} py-1`}>
                <NotificationBell isCollapsed={isCollapsed} role={role} />
            </div>

            <div className={`mt-auto w-full ${isCollapsed ? 'px-2' : 'px-3'} pt-4 border-t border-white/[0.06] pb-4`}>
                <div className={`flex items-center ${isCollapsed ? 'flex-col gap-3' : 'justify-between gap-2'}`}>
                    <div
                        className={`flex items-center ${isCollapsed ? 'justify-center px-0 h-10 w-10' : 'gap-2.5 px-2 py-2 flex-1 min-w-0'} overflow-hidden cursor-pointer hover:bg-white/[0.04] rounded-xl transition-colors group`}
                        onClick={() => setIsProfileModalOpen(true)}
                        title={isCollapsed ? user?.user_metadata?.full_name || user?.email : undefined}
                    >
                        <div className="relative shrink-0">
                            <div className="w-8 h-8 rounded-lg bg-[#1A1A20] border border-white/10 flex items-center justify-center text-white font-black uppercase text-sm">
                                {user?.email ? user.email[0].toUpperCase() : 'U'}
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#0C0C0F]" />
                        </div>
                        {!isCollapsed && (
                            <motion.div 
                                initial={{ opacity: 0, x: -10 }} 
                                animate={{ opacity: 1, x: 0 }}
                                className="min-w-0 flex-1"
                            >
                                <p className="text-[12px] font-bold text-white leading-tight truncate group-hover:text-white/80 transition-colors">
                                    {(user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuário').split(' ')[0]}
                                </p>
                                <p className="text-[9px] text-white/35 font-medium uppercase tracking-widest">
                                    {role === 'admin' ? 'Gerência' : 'Consultor'}
                                </p>
                            </motion.div>
                        )}
                    </div>

                    <button
                        onClick={handleLogout}
                        className="shrink-0 flex items-center justify-center h-8 w-8 rounded-lg bg-white/[0.04] border border-white/[0.06] text-white/35 hover:bg-red-600/15 hover:text-red-400 hover:border-red-500/20 transition-all"
                        title="Sair"
                    >
                        <LogOut size={14} />
                    </button>
                </div>
            </div>
        </>
    );

    return (
        <>
            {/* Spacer — empurra o main para a direita sem participar do scroll */}
            <div className={`hidden md:block shrink-0 transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`} aria-hidden="true" />

            {/* Mobile top bar */}
            <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-[#0C0C0F]/95 backdrop-blur-xl border-b border-white/[0.06] z-[90] flex items-center justify-between px-4">
                <button
                    onClick={() => setMobileOpen(true)}
                    className="h-9 w-9 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all active:scale-95"
                >
                    <Menu size={18} />
                </button>
                <div className="flex items-center gap-3">
                    <img 
                        src="https://manosveiculos.com.br/wp-content/uploads/2024/02/LogoManos.png" 
                        alt="Manos" 
                        className="h-7 w-auto object-contain"
                    />
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black text-white leading-none">CRM V2</span>
                        <span className="text-[7px] font-bold text-red-500 uppercase tracking-widest">Premium Intelligence</span>
                    </div>
                </div>
                <div className="w-9" />
            </div>

            {/* Desktop sidebar — fixed: nunca sobe nem desce com o scroll */}
            <nav className={`hidden md:flex fixed left-0 top-0 h-screen bg-[#0C0C0F] border-r border-white/[0.06] py-6 flex-col items-stretch z-50 overflow-visible transition-all duration-300 ${isCollapsed ? 'w-20' : 'w-64'}`}>
                {sidebarContent}
            </nav>

            <AnimatePresence>
                {mobileOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setMobileOpen(false)}
                            className="md:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-[95]"
                        />
                        <motion.nav
                            initial={{ x: '-100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '-100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
                            className="md:hidden fixed left-0 top-0 h-screen w-64 bg-[#0C0C0F] border-r border-white/[0.06] py-6 flex-col items-center z-[100] overflow-hidden"
                        >
                            <button
                                onClick={() => setMobileOpen(false)}
                                className="absolute top-4 right-4 h-8 w-8 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-white/40 hover:text-white transition-all z-10"
                            >
                                <X size={16} />
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
