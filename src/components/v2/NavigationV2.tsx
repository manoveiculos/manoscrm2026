'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
    Activity, // Pulse/Cockpit
    Users, // Central de Leads
    KanbanSquare, // Pipeline
    CarFront, // Estoque
    BarChart3, // Analytics
    LogOut,
    Menu,
    X,
    Target, // Icone para Campanhas
    Shield, // Icone para Gestão de Equipe
    Bot, // Icone para Cowork IA
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { UserProfileModal } from '@/components/UserProfileModal'; // using existing profile modal

interface NavItem {
    label: string;
    icon: any;
    href: string;
    adminOnly?: boolean;
    blocked?: boolean;
}

const NAV_ITEMS: NavItem[] = [
    { label: 'Painel de Ações', icon: Activity, href: '/v2/pulse' },
    { label: 'Central de Leads', icon: Users, href: '/v2/leads' },
    { label: 'Pipeline de Vendas', icon: KanbanSquare, href: '/v2/pipeline' },
    { label: 'Estoque Inteligente', icon: CarFront, href: '/v2/inventory' },
    { label: 'Análise Inteligente', icon: BarChart3, href: '/v2/analytics' },
    { label: 'Campanhas Meta/Google', icon: Target, href: '/v2/marketing', adminOnly: true },
    { label: 'Gerenciar Equipe', icon: Shield, href: '/v2/admin/equipe', adminOnly: true },
    { label: 'Cowork IA', icon: Bot, href: '/v2/admin/cowork', adminOnly: true },
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
        router.push('/v2/pulse');
    };

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
            {/* Toggle Button for Desktop */}
            <button 
                onClick={toggleCollapse}
                className="hidden md:flex absolute -right-3 top-20 h-6 w-6 rounded-full bg-[#1A1A20] border border-white/10 items-center justify-center text-white/40 hover:text-white hover:border-white/20 transition-all z-[60] shadow-xl"
            >
                <motion.div animate={{ rotate: isCollapsed ? 180 : 0 }}>
                    <Menu size={12} />
                </motion.div>
            </button>

            {/* Logo compacto */}
            <div
                className={`mb-8 flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-5'} cursor-pointer group transition-all`}
                onClick={handleLogoClick}
            >
                <div className="h-8 w-8 rounded-xl bg-red-600/15 border border-red-500/20 flex items-center justify-center shrink-0">
                    <CarFront size={16} className="text-red-500" />
                </div>
                {!isCollapsed && (
                    <motion.div 
                        initial={{ opacity: 0, x: -10 }} 
                        animate={{ opacity: 1, x: 0 }}
                        className="min-w-0 flex flex-col"
                    >
                        <img 
                            src="https://manosveiculos.com.br/wp-content/uploads/2024/02/LogoManos.png" 
                            alt="Manos" 
                            className="h-8 w-auto object-contain mb-3 opacity-100 group-hover:scale-[1.02] transition-all"
                        />
                        <p className="text-sm font-black text-white leading-none truncate">Manos Veículos</p>
                        <p className="text-[9px] text-white/30 font-bold uppercase tracking-[0.2em] mt-0.5">CRM v2</p>
                    </motion.div>
                )}
            </div>

            <div className={`flex-1 w-full ${isCollapsed ? 'px-2' : 'px-3'} space-y-1 overflow-y-auto custom-scrollbar transition-all`}>
                {!isCollapsed && (
                    <div className="px-3 mb-3">
                        <p className="text-[9px] font-bold text-white/25 uppercase tracking-[0.25em]">Navegação</p>
                    </div>
                )}
                {NAV_ITEMS.filter(item => !item.adminOnly || role === 'admin').map((item) => {
                    const isActive = pathname.startsWith(item.href);
                    return (
                        <Link
                            key={item.label}
                            href={item.blocked ? '#' : item.href}
                            title={isCollapsed ? item.label : undefined}
                            onClick={(e) => item.blocked && e.preventDefault()}
                            className={`relative flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-3 rounded-xl transition-all group overflow-hidden ${
                                isActive
                                    ? 'bg-[#1A1A20] text-white border-l-2 border-red-500'
                                    : item.blocked
                                    ? 'opacity-35 cursor-not-allowed'
                                    : 'text-white/45 hover:text-white/80 hover:bg-white/[0.04] border-l-2 border-transparent'
                            }`}
                        >
                            <item.icon
                                size={18}
                                className={isActive ? 'text-red-500 shrink-0' : 'shrink-0 transition-colors group-hover:text-white/60'}
                            />
                            {!isCollapsed && (
                                <motion.div 
                                    initial={{ opacity: 0, x: -10 }} 
                                    animate={{ opacity: 1, x: 0 }}
                                    className="flex flex-col min-w-0"
                                >
                                    <span className={`font-semibold text-[13px] tracking-tight whitespace-nowrap ${isActive ? 'text-white' : ''}`}>
                                        {item.label}
                                    </span>
                                    {item.blocked && (
                                        <span className="text-[8px] font-bold uppercase tracking-widest text-white/25 leading-none mt-0.5">Em breve</span>
                                    )}
                                </motion.div>
                            )}
                        </Link>
                    );
                })}

                {!isCollapsed && (
                    <div className="px-3 mt-6 mb-3">
                        <p className="text-[9px] font-bold text-white/25 uppercase tracking-[0.25em]">Sistema Legado</p>
                    </div>
                )}
                <Link
                    href="/"
                    title={isCollapsed ? 'Voltar para V1' : undefined}
                    className={`flex items-center ${isCollapsed ? 'justify-center px-0' : 'gap-3 px-3'} py-2.5 rounded-xl transition-all text-white/30 hover:text-white/55 hover:bg-white/[0.03] border-l-2 border-transparent`}
                >
                    <LogOut size={16} className="rotate-180 shrink-0" />
                    {!isCollapsed && <span className="font-medium text-[13px] tracking-tight whitespace-nowrap">Voltar para V1</span>}
                </Link>
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
