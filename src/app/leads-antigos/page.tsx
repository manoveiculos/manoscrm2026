'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useIsMobile } from '../leads/hooks/useIsMobile';
import {
    Search,
    History,
    MessageSquare,
    Copy,
    Info,
    Clock,
    User,
    MapPin,
    Car,
    RefreshCw,
    Sparkles,
    Flame,
    Thermometer,
    Snowflake,
    Clock as ClockIcon,
    ShieldAlert,
    Zap,
    BadgeCheck,
    Phone,
    X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { dataService } from '@/lib/dataService';
import { DistributedLead } from '@/lib/types';
import { formatDistanceToNow, subDays, startOfDay, isAfter, isBefore, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { Filter, Calendar, ChevronDown, ListFilter, SortDesc } from 'lucide-react';

type Category = 'all' | 'hot' | 'warm' | 'cold';

export function OldLeadsContent() {
    const [searchTerm, setSearchTerm] = useState('');
    const [leads, setLeads] = useState<DistributedLead[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState<Category>('all');
    const isMobile = useIsMobile();
    const [isClassifying, setIsClassifying] = useState(false);
    const [isDistributing, setIsDistributing] = useState(false);
    const [role, setRole] = useState<string | null>(null);
    const [userName, setUserName] = useState<string | null>(null);

    // AI Matching State
    const [isMatching, setIsMatching] = useState<string | null>(null);
    const [matchResults, setMatchResults] = useState<Record<string, any>>({});
    const [selectedMatch, setSelectedMatch] = useState<DistributedLead | null>(null);
    const [allConsultants, setAllConsultants] = useState<any[]>([]);
    const [isReassigning, setIsReassigning] = useState<string | null>(null);

    // Advanced Filtering State
    const [sortBy, setSortBy] = useState('recent');
    const [period, setPeriod] = useState('all');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Pagination State
    const [visibleCount, setVisibleCount] = useState(50);
    const observerTarget = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        async function initialize() {
            setLoading(true);
            try {
                // Get Role and User Name
                const { data: { session } } = await supabase.auth.getSession();
                let currentRole: string | null = null;
                let consultantFilter = undefined;

                if (session?.user) {
                    const { data: consultant } = await supabase
                        .from('consultants_manos_crm')
                        .select('role, name')
                        .eq('auth_id', session.user.id)
                        .maybeSingle();

                    if (consultant) {
                        currentRole = consultant.role;
                        setRole(consultant.role);
                        setUserName(consultant.name?.split(' ')[0] || '');
                    } else if (session.user.email === 'alexandre_gorges@hotmail.com') {
                        currentRole = 'admin';
                        setRole('admin');
                    }

                    const isUserAdmin = currentRole === 'admin' || session.user.email === 'alexandre_gorges@hotmail.com';
                    consultantFilter = isUserAdmin ? undefined : session.user.id;
                }

                // Load Leads
                const data = await dataService.getDistributedLeads(consultantFilter) as unknown as DistributedLead[];
                setLeads(data || []);

                // Load all consultants for admin reassignment
                if (currentRole === 'admin' || currentRole === 'manager') {
                    const consultantsList = await dataService.getConsultants();
                    setAllConsultants(consultantsList || []);
                }
            } catch (err) {
                console.error("Error initializing page:", err);
            } finally {
                setLoading(false);
            }
        }
        initialize();
    }, []);

    const handleMatchInventory = async (lead: DistributedLead) => {
        if (isMatching) return;
        setIsMatching(String(lead.id));
        try {
            const response = await fetch('/api/match-inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lead })
            });
            const data = await response.json();
            setMatchResults(prev => ({ ...prev, [lead.id]: data }));
            // Ao terminar a análise, abre o modal automaticamente se foi o usuário que pediu
            setSelectedMatch(lead);
        } catch (err) {
            console.error("Match Error:", err);
        } finally {
            setIsMatching(null);
        }
    };

    const filteredLeads = React.useMemo(() => {
        return leads
            .filter(lead => {
                const matchesSearch =
                    lead.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    lead.interesse?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    lead.vendedor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    lead.telefone?.toLowerCase().includes(searchTerm.toLowerCase());

                if (!matchesSearch) return false;

                // Category Filter
                if (activeCategory !== 'all' && lead.ai_classification !== activeCategory) return false;

                // Period Filter
                if (period !== 'all') {
                    const leadDate = parseISO(lead.criado_em);
                    const today = startOfDay(new Date());

                    if (period === 'today') {
                        if (!isAfter(leadDate, today)) return false;
                    } else if (period === '7d') {
                        if (!isAfter(leadDate, subDays(today, 7))) return false;
                    } else if (period === '15d') {
                        if (!isAfter(leadDate, subDays(today, 15))) return false;
                    } else if (period === '30d') {
                        if (!isAfter(leadDate, subDays(today, 30))) return false;
                    } else if (period === '90d') {
                        if (!isAfter(leadDate, subDays(today, 90))) return false;
                    } else if (period === 'custom' && startDate && endDate) {
                        const start = startOfDay(parseISO(startDate));
                        const end = parseISO(endDate); // End of day would be better, but let's keep it simple
                        if (isBefore(leadDate, start) || isAfter(leadDate, end)) return false;
                    }
                }

                return true;
            })
            .sort((a, b) => {
                if (sortBy === 'recent') return new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();
                if (sortBy === 'oldest') return new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime();
                if (sortBy === 'probability') return (b.ai_score || 0) - (a.ai_score || 0);

                if (sortBy === 'hot') {
                    if (a.ai_classification === 'hot' && b.ai_classification !== 'hot') return -1;
                    if (a.ai_classification !== 'hot' && b.ai_classification === 'hot') return 1;
                    return new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();
                }
                if (sortBy === 'warm') {
                    if (a.ai_classification === 'warm' && b.ai_classification !== 'warm') return -1;
                    if (a.ai_classification !== 'warm' && b.ai_classification === 'warm') return 1;
                    return new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();
                }
                if (sortBy === 'cold') {
                    if (a.ai_classification === 'cold' && b.ai_classification !== 'cold') return -1;
                    if (a.ai_classification !== 'cold' && b.ai_classification === 'cold') return 1;
                    return new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime();
                }

                if (sortBy === 'updated_recent') {
                    const da = a.atualizado_em || a.criado_em;
                    const db = b.atualizado_em || b.criado_em;
                    return new Date(db).getTime() - new Date(da).getTime();
                }
                if (sortBy === 'updated_oldest') {
                    const da = a.atualizado_em || a.criado_em;
                    const db = b.atualizado_em || b.criado_em;
                    return new Date(da).getTime() - new Date(db).getTime();
                }

                return 0;
            });
    }, [leads, searchTerm, activeCategory, period, sortBy, startDate, endDate]);

    // Reset pagination when search or filters change
    useEffect(() => {
        setVisibleCount(50);
    }, [filteredLeads]);

    // Intersection Observer for Infinite Scroll Pagination
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisibleCount((prev) => Math.min(prev + 50, filteredLeads.length));
                }
            },
            { threshold: 0.1 }
        );

        if (observerTarget.current) {
            observer.observe(observerTarget.current);
        }

        return () => {
            if (observerTarget.current) {
                observer.unobserve(observerTarget.current);
            }
        };
    }, [filteredLeads.length]);

    const visibleLeads = filteredLeads.slice(0, visibleCount);

    const counts = {
        all: leads.length,
        hot: leads.filter(l => l.ai_classification === 'hot').length,
        warm: leads.filter(l => l.ai_classification === 'warm').length,
        cold: leads.filter(l => l.ai_classification === 'cold').length,
    };

    const handleWhatsApp = (phone: string) => {
        const cleanPhone = phone.replace(/\D/g, '');
        // Garantir que a mensagem enviada seja limpa (sem emojis/hifens) se houver template padrão
        // Mas como aqui abre o link direto, o usuário decide. 
        // No entanto, para o contato direto do card, vamos apenas abrir.
        window.open(`https://wa.me/${cleanPhone}`, '_blank');
    };

    const runBulkClassification = async () => {
        if (leads.length === 0 || isClassifying) return;

        const unclassifiedLeads = leads.filter(l => !l.ai_classification || l.ai_classification === null);
        if (unclassifiedLeads.length === 0) {
            alert("Todos os leads visíveis já foram qualificados.");
            return;
        }

        const confirmResult = confirm(`Deseja analisar ${unclassifiedLeads.length} leads pendentes via IA para classificação?`);
        if (!confirmResult) return;

        setIsClassifying(true);
        try {
            const batchSize = 20;
            const newLeads = [...leads];

            for (let i = 0; i < unclassifiedLeads.length; i += batchSize) {
                const batch = unclassifiedLeads.slice(i, i + batchSize);
                const response = await fetch('/api/classify-leads', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ leads: batch })
                });

                if (!response.ok) throw new Error('Falha na resposta da IA');
                const { results } = await response.json();

                for (let j = 0; j < batch.length; j++) {
                    const virtualLeadId = batch[j].id;
                    const realLeadId = batch[j].real_id;
                    const sourceTable = batch[j].source_table;
                    const result = results[j];

                    if (!result) continue;

                    const index = newLeads.findIndex(l => l.id === virtualLeadId);
                    if (index !== -1) {
                        newLeads[index] = {
                            ...newLeads[index],
                            ai_classification: result.classification,
                            ai_reason: result.reasoning,
                            nivel_interesse: result.nivel_interesse,
                            momento_compra: result.momento_compra,
                            resumo_consultor: result.resumo_consultor,
                            proxima_acao: result.proxima_acao
                        };
                    }
                    try {
                        await dataService.updateDistributedLeadAI(realLeadId, {
                            ai_classification: result.classification,
                            ai_reason: result.reasoning,
                            nivel_interesse: result.nivel_interesse,
                            momento_compra: result.momento_compra,
                            resumo_consultor: result.resumo_consultor,
                            proxima_acao: result.proxima_acao
                        }, sourceTable);
                    } catch (e) {
                        console.error("Error updating lead AI", realLeadId, e);
                    }
                }
                setLeads([...newLeads]);
            }
            alert("Qualificação concluída!");
        } catch (err: any) {
            console.error(err);
            alert(`Erro: ${err.message}`);
        } finally {
            setIsClassifying(false);
        }
    };

    const handleDistribute = async () => {
        if (isDistributing) return;

        // Leads available for distribution: Qualified leads in the current view
        const toDistribute = filteredLeads.filter(l => l.ai_classification);
        if (toDistribute.length === 0) {
            alert("Não há leads qualificados na visão atual para distribuir.");
            return;
        }

        const confirmResult = confirm(`Deseja distribuir ${toDistribute.length} leads entre os consultores ativos?`);
        if (!confirmResult) return;

        setIsDistributing(true);
        try {
            const consultants = await dataService.getConsultants();
            // Restringir apenas para Wilson, Sergio e Victor conforme solicitado
            const allowedNames = ['Wilson', 'Sergio', 'Victor'];
            const activeConsultants = consultants
                .filter(c => c.is_active && allowedNames.some(name => c.name.toLowerCase().includes(name.toLowerCase())))
                .map(c => c.name);

            if (activeConsultants.length === 0) {
                throw new Error("Não há consultores autorizados (Wilson, Sergio, Victor) ativos para receber os leads.");
            }

            const leadsToDistribute = toDistribute.map(l => ({
                id: l.id,
                currentConsultant: l.vendedor, // Nome para fallback
                currentConsultantId: l.assigned_consultant_id // UUID para precisão
            }));
            await dataService.distributeOldLeads(leadsToDistribute, activeConsultants);

            // Refresh leads
            const updated = await dataService.getDistributedLeads();
            setLeads(updated || []);
            alert("Distribuição concluída com sucesso!");
        } catch (err: any) {
            console.error(err);
            alert(`Erro na distribuição: ${err.message}`);
        } finally {
            setIsDistributing(false);
        }
    };

    const handleReassign = async (leadId: string | number, newVendedor: string) => {
        if (!newVendedor || isReassigning) return;
        
        const confirmResult = confirm(`Deseja alterar o vendedor para ${newVendedor}?`);
        if (!confirmResult) return;

        setIsReassigning(String(leadId));
        try {
            await dataService.reassignDistributedLead(leadId, newVendedor);
            
            // Update local state
            setLeads(prev => prev.map(l => l.id === leadId ? { ...l, vendedor: newVendedor } : l));
            
            alert("Vendedor alterado com sucesso!");
        } catch (err: any) {
            console.error(err);
            alert(`Erro ao reatribuir: ${err.message}`);
        } finally {
            setIsReassigning(null);
        }
    };

    if (loading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <div className="h-12 w-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    // Não bloquear mais a tela inicial para consultores sem leads, apenas deixaremos 
    // a tabela vazia dizendo "Nenhum lead...". O usuário enxerga as abas limpas.

    return (
        <div className="space-y-10 pb-20 px-4">
            <header className="flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                        <h1 className="text-3xl md:text-5xl font-black tracking-tighter text-white font-outfit leading-none">
                            Reativação de <span className="text-red-600">Leads</span>
                        </h1>
                        <div className="bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-full w-fit">
                            <span className="text-[9px] md:text-[10px] font-black text-red-500 uppercase tracking-widest leading-none">Arquivo</span>
                        </div>
                    </div>
                    <p className="text-sm md:text-base text-white/40 font-medium italic">Base de dados histórica do sistema de distribuição.</p>
                </div>

                <div className="flex items-center gap-4">
                    {loading ? (
                        <div className="flex items-center gap-3 bg-white/5 px-6 py-3.5 rounded-2xl border border-white/10 animate-pulse">
                            <div className="h-4 w-4 bg-white/20 rounded-full" />
                            <div className="h-2 w-24 bg-white/20 rounded" />
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            {(role === 'admin' || role === 'manager') && (
                                <>
                                    {/* Qualificação por IA: Mostra se houver leads sem classificação na visão atual */}
                                    {filteredLeads.some(l => !l.ai_classification) && (
                                        <button
                                            onClick={runBulkClassification}
                                            disabled={isClassifying}
                                            className={`px-6 py-3.5 rounded-2xl border transition-all flex items-center gap-2 font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl ${isClassifying
                                                ? 'bg-white/5 border-white/5 text-white/20 cursor-wait'
                                                : 'bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white hover:border-red-500 shadow-red-500/10 active:scale-95'
                                                }`}
                                        >
                                            {isClassifying ? (
                                                <div className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                            ) : (
                                                <Sparkles size={16} />
                                            )}
                                            {isClassifying ? 'ANALISANDO...' : 'QUALIFICAR POR IA'}
                                        </button>
                                    )}

                                    {/* Distribuição: Mostra se houver leads qualificados na visão atual */}
                                    {filteredLeads.some(l => l.ai_classification) && (
                                        <button
                                            onClick={handleDistribute}
                                            disabled={isDistributing}
                                            className={`px-6 py-3.5 rounded-2xl border transition-all flex items-center gap-2 font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl ${isDistributing
                                                ? 'bg-white/5 border-white/5 text-white/20 cursor-wait'
                                                : 'bg-blue-500/10 border-blue-500/20 text-blue-500 hover:bg-blue-500 hover:text-white hover:border-blue-500 shadow-blue-500/10 active:scale-95'
                                                }`}
                                        >
                                            {isDistributing ? (
                                                <div className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                            ) : (
                                                <Copy size={16} />
                                            )}
                                            {isDistributing ? 'DISTRIBUINDO...' : 'DISTRIBUIR FILTRADOS'}
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-red-500 transition-colors" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar por nome ou telefone..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-6 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:bg-white/10 transition-all w-full md:w-80 font-medium"
                        />
                    </div>
                </div>
            </header>

            {/* Advanced Filters Bar */}
            <div className="flex flex-wrap items-center gap-4 bg-white/[0.02] p-4 rounded-3xl border border-white/5">
                <div className="flex items-center gap-3">
                    <SortDesc size={18} className="text-red-500" />
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-wider text-white focus:outline-none focus:ring-1 focus:ring-red-500/50 appearance-none"
                    >
                        <option value="recent" className="bg-[#0f0f0f]">Mais recentes primeiro</option>
                        <option value="oldest" className="bg-[#0f0f0f]">Mais antigos primeiro</option>
                        <option value="probability" className="bg-[#0f0f0f]">Maior probabilidade de fechamento</option>
                        <option value="hot" className="bg-[#0f0f0f]">Leads quentes primeiro</option>
                        <option value="warm" className="bg-[#0f0f0f]">Leads mornos</option>
                        <option value="cold" className="bg-[#0f0f0f]">Leads frios</option>
                        <option value="updated_recent" className="bg-[#0f0f0f]">Última interação mais recente</option>
                        <option value="updated_oldest" className="bg-[#0f0f0f]">Última interação mais antiga</option>
                    </select>
                </div>

                <div className="h-4 w-px bg-white/10 hidden md:block" />

                <div className="flex items-center gap-3">
                    <Calendar size={18} className="text-red-500" />
                    <select
                        value={period}
                        onChange={(e) => setPeriod(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-[11px] font-black uppercase tracking-wider text-white focus:outline-none focus:ring-1 focus:ring-red-500/50 appearance-none"
                    >
                        <option value="all" className="bg-[#0f0f0f]">Todo o período</option>
                        <option value="today" className="bg-[#0f0f0f]">Hoje</option>
                        <option value="7d" className="bg-[#0f0f0f]">Últimos 7 dias</option>
                        <option value="15d" className="bg-[#0f0f0f]">Últimos 15 dias</option>
                        <option value="30d" className="bg-[#0f0f0f]">Últimos 30 dias</option>
                        <option value="90d" className="bg-[#0f0f0f]">Últimos 90 dias</option>
                        <option value="custom" className="bg-[#0f0f0f]">Personalizado</option>
                    </select>

                    {period === 'custom' && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-red-500/50"
                            />
                            <span className="text-white/20 text-xs">até</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-[10px] text-white focus:outline-none focus:ring-1 focus:ring-red-500/50"
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Classification Menu */}
            <div className="flex flex-wrap items-center gap-2 bg-white/5 p-1.5 rounded-[2rem] border border-white/10 w-fit">
                {[
                    { id: 'all', label: 'Todos', count: counts.all, icon: History, color: 'text-white/40' },
                    { id: 'hot', label: 'Quentes', count: counts.hot, icon: Flame, color: 'text-red-500' },
                    { id: 'warm', label: 'Mornos', count: counts.warm, icon: Thermometer, color: 'text-amber-500' },
                    { id: 'cold', label: 'Frios', count: counts.cold, icon: Snowflake, color: 'text-blue-400' },
                ].map((cat) => (
                    <button
                        key={cat.id}
                        onClick={() => setActiveCategory(cat.id as Category)}
                        className={`flex items-center gap-3 px-6 py-3 rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] transition-all relative overflow-hidden group ${activeCategory === cat.id
                            ? 'bg-white/10 text-white shadow-[0_10px_30px_rgba(0,0,0,0.5)]'
                            : 'text-white/30 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <cat.icon size={16} className={cat.color} />
                        {cat.label}
                        <span className={`bg-white/5 px-2 py-0.5 rounded-lg text-[9px] font-black ${activeCategory === cat.id ? 'text-red-500' : 'text-white/20'}`}>
                            {cat.count}
                        </span>
                        {activeCategory === cat.id && (
                            <motion.div
                                layoutId={isMobile ? undefined : "active-tab"}
                                className="absolute inset-0 bg-white/5 border-b-2 border-red-500"
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            />
                        )}
                    </button>
                ))}
            </div>

            <div className="flex flex-col gap-3">
                <AnimatePresence mode="popLayout">
                    {visibleLeads.map((lead) => (
                        <motion.div
                            key={lead.id}
                            layout={isMobile ? false : true}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className={`glass-card rounded-2xl md:rounded-3xl border border-white/5 overflow-hidden hover:border-red-500/40 transition-all group relative bg-[#050608]/60 ${isMobile ? 'backdrop-blur-md' : 'backdrop-blur-xl'} hover:shadow-[0_0_30px_rgba(239,68,68,0.05)]`}
                        >
                            <div className="flex flex-col md:flex-row items-stretch">
                                {/* Status Strip (Left Border) */}
                                <div className={`w-1.5 shrink-0 ${lead.ai_classification === 'hot' ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]' :
                                    lead.ai_classification === 'warm' ? 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)]' :
                                        'bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]'
                                    }`} />

                                {/* Main Content Row */}
                                <div className="flex-1 flex flex-col lg:flex-row p-4 md:p-6 gap-6 items-center">

                                    {/* Identity Section (Narrowest) */}
                                    <div className="w-full lg:w-[220px] flex items-center gap-4 border-b lg:border-b-0 lg:border-r border-white/5 pb-4 lg:pb-0">
                                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600/20 to-red-900/20 border border-red-500/20 flex items-center justify-center text-red-500 font-black text-sm shrink-0">
                                            {lead.nome?.[0] || 'U'}
                                        </div>
                                        <div className="overflow-hidden">
                                            <h3 className="font-black text-white tracking-tight truncate group-hover:text-red-500 transition-colors">
                                                {lead.nome}
                                            </h3>
                                            <div className="flex items-center gap-1.5 text-white/30">
                                                <Phone size={10} className="text-red-500/50" />
                                                <span className="text-[10px] font-bold">{lead.telefone}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Core Details (Dense) */}
                                    <div className="flex-1 flex items-center w-full">
                                        <div className="space-y-1">
                                            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest block">Registro</span>
                                            <p className="text-[10px] font-bold text-white/40">
                                                {formatDistanceToNow(new Date(lead.criado_em), { locale: ptBR, addSuffix: true })}
                                            </p>
                                        </div>
                                    </div>

                                    {/* AI Insight Block (Condensed) */}
                                    <div className="w-full lg:w-[400px] bg-white/[0.02] border border-white/5 rounded-2xl p-3 flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5">
                                                <Sparkles size={10} className="text-red-500" />
                                                <span className="text-[8px] font-black text-red-500/60 uppercase tracking-widest italic">Análise IA</span>
                                            </div>
                                            {lead.ai_classification && (
                                                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md border ${lead.ai_classification === 'hot' ? 'bg-red-500/10 border-red-500/20 text-red-500' :
                                                    lead.ai_classification === 'warm' ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' :
                                                        'bg-blue-500/10 border-blue-500/20 text-blue-400'
                                                    }`}>
                                                    {lead.ai_classification === 'hot' ? 'Quente' : lead.ai_classification === 'warm' ? 'Morno' : 'Frio'}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[10px] font-medium text-white/60 line-clamp-2 leading-relaxed italic">
                                            "{lead.resumo_consultor || lead.resumo || 'Nenhuma observação automática.'}"
                                        </p>
                                    </div>

                                    {/* Action Area (Right) */}
                                    <div className="flex flex-col gap-2 shrink-0 min-w-[160px]">
                                        <button
                                            onClick={() => {
                                                const targetId = lead.real_id ? `${lead.source_table === 'leads_manos_crm' ? 'main_' : lead.source_table === 'leads_distribuicao_crm_26' ? 'crm26_' : 'dist_'}${lead.real_id}` : lead.id;
                                                window.location.href = `/leads?id=${targetId}`;
                                            }}
                                            className="h-10 px-4 rounded-xl bg-red-600 border border-red-600 text-white shadow-lg shadow-red-600/20 hover:bg-red-500 transition-all flex items-center justify-center gap-2 font-black text-[9px] uppercase tracking-widest active:scale-95 disabled:opacity-50"
                                        >
                                            <Sparkles size={14} fill="white" />
                                            ACESSAR O LEAD
                                        </button>

                                        <button
                                            onClick={() => {
                                                if (matchResults[lead.id]) {
                                                    setSelectedMatch(lead);
                                                } else {
                                                    handleMatchInventory(lead);
                                                }
                                            }}
                                            disabled={isMatching === String(lead.id)}
                                            className={`h-8 px-4 rounded-xl border transition-all flex items-center justify-center gap-2 font-black text-[8px] uppercase tracking-widest ${isMatching === String(lead.id)
                                                ? 'bg-white/5 border-white/5 text-white/20'
                                                : matchResults[lead.id]
                                                    ? 'bg-white/10 border-white/20 text-white shadow-lg'
                                                    : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white hover:border-white/20 shadow-red-500/10 active:scale-95'
                                                }`}
                                        >
                                            {isMatching === String(lead.id) ? (
                                                <div className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                            ) : <Zap size={10} />}
                                            {isMatching === String(lead.id) ? 'BUSCANDO...' : matchResults[lead.id] ? 'VER OPORTUNIDADE' : 'ANALISAR ESTOQUE'}
                                        </button>

                                        <button
                                            onClick={() => handleWhatsApp(lead.telefone)}
                                            className="h-8 px-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/40 hover:text-white flex items-center justify-center gap-2 transition-all font-black text-[8px] uppercase tracking-widest active:scale-95"
                                        >
                                            CONTATO DIRETO
                                        </button>
                                    </div>
                                </div>


                                {/* Desktop Sidebar Info (Vendedor) */}
                                <div className="hidden xl:flex w-[180px] p-6 bg-white/[0.02] border-l border-white/5 flex-col justify-center items-center text-center gap-1">
                                    <div className="space-y-4 w-full">
                                        <div>
                                            <div className="text-[8px] font-black text-white/10 uppercase tracking-widest mb-1">Vendedor</div>
                                            {(role === 'admin' || role === 'manager') ? (
                                                <div className="relative">
                                                    <select
                                                        value={lead.vendedor || ''}
                                                        disabled={isReassigning === String(lead.id)}
                                                        onChange={(e) => handleReassign(lead.id, e.target.value)}
                                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] font-black text-white/60 focus:outline-none focus:ring-1 focus:ring-red-500/50 appearance-none cursor-pointer hover:bg-white/10 transition-all"
                                                    >
                                                        <option value="" disabled className="bg-[#0f0f0f]">Selecionar...</option>
                                                        {allConsultants
                                                            .filter(c => c.is_active || c.name === lead.vendedor)
                                                            .map(c => (
                                                                <option key={c.id} value={c.name} className="bg-[#0f0f0f]">{c.name}</option>
                                                            ))
                                                        }
                                                    </select>
                                                    {isReassigning === String(lead.id) && (
                                                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                                                            <div className="h-3 w-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="text-xs font-black text-white/40 truncate w-full">{lead.vendedor?.split(' ')[0] || 'Padrão'}</p>
                                            )}
                                        </div>
                                        {lead.vendedor_anterior && (
                                            <div className="pt-4 border-t border-white/5">
                                                <div className="text-[8px] font-black text-blue-500/40 uppercase tracking-widest mb-1">Vendedor Anterior</div>
                                                <p className="text-[10px] font-black text-blue-400 truncate w-full uppercase">{lead.vendedor_anterior?.split(' ')[0] || 'Não encontrado'}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {visibleCount < filteredLeads.length && (
                    <div ref={observerTarget} className="flex justify-center py-8">
                        <div className="animate-pulse flex items-center gap-2 text-white/40 text-[10px] font-black uppercase tracking-widest">
                            <div className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            Carregando mais...
                        </div>
                    </div>
                )}

                {filteredLeads.length === 0 && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="py-32 text-center glass-card rounded-[3rem] border border-white/5"
                    >
                        <History size={64} className="mx-auto text-white/5 mb-8" />
                        <h3 className="text-2xl font-black text-white uppercase tracking-[0.3em]">
                            Nenhum lead em '{activeCategory === 'all' ? 'Todos' : activeCategory === 'hot' ? 'Quentes' : activeCategory === 'warm' ? 'Mornos' : 'Frios'}'
                        </h3>
                        <p className="text-white/20 font-medium italic mt-3">
                            {activeCategory === 'all'
                                ? 'Os dados da tabela "leads_distribuicao" aparecerão aqui.'
                                : `Clique em 'QUALIFICAR POR IA' para analisar os resumos e categorizar os leads.`}
                        </p>
                    </motion.div>
                )}
            </div>

            {/* AI Match Modal Overlay */}
            <AnimatePresence>
                {selectedMatch && matchResults[selectedMatch.id] && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedMatch(null)}
                            className="absolute inset-0 bg-black/80 backdrop-blur-xl"
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-2xl bg-[#0a0c10] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl"
                        >
                            <div className="p-8 md:p-12 space-y-8">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-red-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.2)]">
                                            <Sparkles className="text-red-500" size={24} />
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-black text-white uppercase tracking-tight">Oportunidade Inteligente</h2>
                                            <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em]">{selectedMatch.nome}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setSelectedMatch(null)}
                                        className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {matchResults[selectedMatch.id].matches?.map((m: any, idx: number) => (
                                        <div key={idx} className="bg-white/[0.03] border border-white/5 p-6 rounded-3xl space-y-3 group hover:border-red-500/30 transition-all">
                                            <div className="flex justify-between items-start">
                                                <div className="space-y-0.5">
                                                    <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Opção #{idx + 1}</span>
                                                    <h4 className="text-lg font-black text-white">{m.veiculo}</h4>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-xs font-black text-red-500">{m.preco}</span>
                                                </div>
                                            </div>
                                            <p className="text-[11px] font-medium text-white/40 leading-relaxed italic border-l-2 border-red-500/20 pl-3">
                                                {m.motivo}
                                            </p>
                                        </div>
                                    ))}
                                </div>

                                <div className="bg-red-500/5 border border-red-500/10 rounded-3xl p-6 space-y-4 shadow-inner">
                                    <div className="flex items-center gap-2 text-red-500">
                                        <MessageSquare size={16} />
                                        <span className="text-[10px] font-black uppercase tracking-widest leading-none">Abordagem Recomendada</span>
                                    </div>
                                    <p className="text-sm font-medium text-white/70 leading-relaxed italic">
                                        "{matchResults[selectedMatch.id].sugestao_mensagem.replace('[Consultor]', userName || 'Consultor')}"
                                    </p>
                                </div>

                                <div className="flex gap-4">
                                    <button
                                        onClick={() => {
                                            let msg = matchResults[selectedMatch.id].sugestao_mensagem.replace('[Consultor]', userName || 'Consultor');
                                            // Sanitização: Remover emojis e hifens conforme solicitado
                                            msg = msg.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|\u200d|[\u2700-\u27bf]|[\u2b50]|[\u2600-\u26ff]/g, '');
                                            msg = msg.replace(/-/g, ' ');
                                            msg = msg.replace(/\s+/g, ' ').trim();
                                            window.open(`https://wa.me/55${selectedMatch.telefone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
                                        }}
                                        className="flex-1 h-16 bg-red-600 hover:bg-red-500 text-white rounded-2xl flex items-center justify-center gap-3 transition-all font-black text-xs uppercase tracking-widest shadow-xl shadow-red-600/20 active:scale-[0.98]"
                                    >
                                        <MessageSquare size={20} fill="white" />
                                        Reativar Via WhatsApp
                                    </button>
                                    <button
                                        onClick={() => {
                                            window.location.href = `/leads?id=${selectedMatch.id}&tab=flow-up`;
                                        }}
                                        className="px-8 h-16 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-2xl transition-all font-black text-[10px] uppercase tracking-widest border border-white/5 active:scale-[0.98] flex items-center justify-center gap-2"
                                    >
                                        <Sparkles size={16} />
                                        Ver no CRM
                                    </button>
                                    <button
                                        onClick={() => setSelectedMatch(null)}
                                        className="px-6 h-16 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-2xl transition-all font-black text-[10px] uppercase tracking-widest border border-white/5 active:scale-[0.98]"
                                    >
                                        Fechar
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default function OldLeadsPage() {
    return (
        <Suspense key="old-leads-page-suspense" fallback={
            <div className="flex h-[60vh] items-center justify-center">
                <div className="h-12 w-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <OldLeadsContent />
        </Suspense>
    );
}
