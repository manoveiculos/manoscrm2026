'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { leadService } from '@/lib/leadService';
import { createClient } from '@/lib/supabase/client';
import { Lead, LeadStatus } from '@/lib/types';
import { normalizeStatus } from '@/constants/status';
import { KanbanBoardV2 } from './components/KanbanBoardV2';
import { LeadListV2 } from './components/LeadListV2';
import { LeadProfileModalV2 } from '../components/lead-profile/LeadProfileModalV2';
import { NewLeadModalV2 } from './components/NewLeadModalV2';
import { 
    Search, 
    MessageSquare, 
    Activity, 
    Brain, 
    Zap, 
    Target, 
    TrendingUp, 
    Filter,
    LayoutGrid,
    List as ListIcon,
    ChevronDown,
    Clock,
    User,
    Car,
    Globe,
    Calendar,
    Plus
} from 'lucide-react';
import { dataService } from '@/lib/dataService';

function PipelineContent() {
    const supabase = createClient();
    const searchParams = useSearchParams();
    const filterFromUrl = searchParams.get('filter');
    const leadIdFromUrl = searchParams.get('id');

    const [leads, setLeads] = useState<Lead[]>([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [userName, setUserName] = useState('');
    const [role, setRole] = useState('consultant');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
    const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
    const [sortBy, setSortBy] = useState<'date' | 'score'>('date');
    const [isAddingLead, setIsAddingLead] = useState(false);
    const [isManagement, setIsManagement] = useState(false);

    // Advanced Filters
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterScore, setFilterScore] = useState<string>('all');
    const [filterDate, setFilterDate] = useState<string>('all');
    const [filterConsultant, setFilterConsultant] = useState<string>('all');
    const [filterInterest, setFilterInterest] = useState<string>('all');
    const [filterOrigin, setFilterOrigin] = useState<string>('all');

    const [consultants, setConsultants] = useState<any[]>([]);
    const [inventory, setInventory] = useState<any[]>([]);
    const [origins, setOrigins] = useState<string[]>([]);

    const [consultantId, setConsultantId] = useState<string | undefined>(undefined);

    // Initial Load & Auth
    useEffect(() => {
        async function initAuthAndData() {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                
                // Load Consultants & Inventory for filters
                const [consData, invData] = await Promise.all([
                    dataService.getConsultants(),
                    dataService.getInventory()
                ]);
                setConsultants(consData || []);
                setInventory(invData || []);

                if (!session?.user) return;

                const isAdmin = session.user.email === 'alexandre_gorges@hotmail.com';

                // CRITICAL: leads_manos_crm.assigned_consultant_id references consultants_manos_crm.id
                // Must use the same table so IDs match — pipeline was using 'consultants' (V2) which has different UUIDs
                const { data: consultant } = await supabase
                    .from('consultants_manos_crm')
                    .select('id, name, role')
                    .eq('auth_id', session.user.id)
                    .maybeSingle();

                if (consultant) {
                    setUserName(consultant.name.split(' ')[0]);
                    setRole(isAdmin ? 'admin' : (consultant.role || 'consultant'));
                    if (!isAdmin && consultant.role !== 'admin') {
                        setConsultantId(consultant.id);
                        setFilterConsultant(consultant.id);
                    }
                } else if (isAdmin) {
                    setRole('admin');
                }

                // Fallback: if not in consultants_manos_crm, try new consultants table (future-proof)
                if (!consultant && !isAdmin) {
                    const { data: consultantV2 } = await supabase
                        .from('consultants_manos_crm')
                        .select('id, name, role')
                        .eq('auth_id', session.user.id)
                        .maybeSingle();
                    if (consultantV2) {
                        setUserName(consultantV2.name.split(' ')[0]);
                        setRole(consultantV2.role || 'consultant');
                        if (consultantV2.role !== 'admin') {
                            setConsultantId(consultantV2.id);
                            setFilterConsultant(consultantV2.id);
                        }
                    }
                }
            } catch (err) {
                console.error("Auth/Data init error:", err);
            }
        }
        initAuthAndData();
    }, []);

    // Extract unique origins from leads
    useEffect(() => {
        if (leads.length > 0) {
            const uniqueOrigins = Array.from(new Set(leads.map(l => l.origem || l.source).filter(Boolean)));
            setOrigins(uniqueOrigins as string[]);
        }
    }, [leads]);

    // Data Fetching Logic
    const loadLeads = async (pageNum: number, isNewSearch: boolean = false) => {
        if (pageNum > 1) setLoadingMore(true);
        else setLoading(true);

        try {
            const result = await leadService.getLeadsPaginated(supabase, {
                page: pageNum,
                limit: 200, // MASSIVE LOAD
                consultantId,
                searchTerm: searchTerm || undefined
            });

            if (isNewSearch) {
                setLeads(result.leads);
            } else {
                setLeads(prev => [...prev, ...result.leads]);
            }
            
            setHasMore(result.leads.length === 200);
        } catch (err) {
            console.error("Error loading leads:", err);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const handleStatusChange = async (leadId: string, newStatus: LeadStatus) => {
        // Optimistic Update
        const oldLeads = [...leads];
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));

        try {
            await leadService.updateLeadStatus(supabase, leadId, newStatus);
        } catch (err) {
            console.error("Error updating lead status:", err);
            setLeads(oldLeads); // Revert on error
        }
    };

    // Re-fetch on filter/search change
    useEffect(() => {
        setPage(1);
        loadLeads(1, true);
    }, [searchTerm, consultantId, filterFromUrl]);

    const filteredLeads = useMemo(() => {
        // Normalize status before filtering so V1 statuses ('perda total', 'venda realizada', etc.) are handled
        let filtered = leads.filter(l => {
            const norm = normalizeStatus(l.status);
            return norm !== 'vendido' && norm !== 'perdido';
        });
        
        // Date Filter
        if (filterDate !== 'all') {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            const yesterday = today - 86400000;
            const lastWeek = today - 7 * 86400000;
            const lastMonth = today - 30 * 86400000;

            filtered = filtered.filter(l => {
                const leadDate = new Date(l.created_at || 0).getTime();
                if (filterDate === 'today') return leadDate >= today;
                if (filterDate === 'yesterday') return leadDate >= yesterday && leadDate < today;
                if (filterDate === 'week') return leadDate >= lastWeek;
                if (filterDate === 'month') return leadDate >= lastMonth;
                return true;
            });
        }

        // Consultant Filter
        if (filterConsultant !== 'all') {
            filtered = filtered.filter(l => l.assigned_consultant_id === filterConsultant);
        }

        // Interest/Vehicle Filter
        if (filterInterest !== 'all') {
            filtered = filtered.filter(l => (l.vehicle_interest || '').toLowerCase().includes(filterInterest.toLowerCase()));
        }

        // Origin Filter
        if (filterOrigin !== 'all') {
            filtered = filtered.filter(l => (l.origem || l.source) === filterOrigin);
        }

        // Improved Search Filter
        if (searchTerm) {
            const terms = searchTerm.toLowerCase().split(/\s+/).filter(t => t.length > 0);
            filtered = filtered.filter(l => {
                const searchableText = [
                    l.name,
                    l.phone,
                    l.vehicle_interest,
                    l.source,
                    l.origem,
                    l.region
                ].join(' ').toLowerCase();
                
                return terms.every(term => searchableText.includes(term));
            });
        }

        // Status Filter
        if (filterStatus !== 'all') {
            filtered = filtered.filter(l => 
                filterStatus === 'new' ? (l.status === 'received' || l.status === 'new') : l.status === filterStatus
            );
        }

        // Score Filter
        if (filterScore !== 'all') {
            filtered = filtered.filter(l => {
                const s = l.ai_score || 0;
                if (filterScore === 'high') return s >= 70;
                if (filterScore === 'med') return s >= 40 && s < 70;
                if (filterScore === 'low') return s < 40;
                return true;
            });
        }

        // Sort Logic
        return [...filtered].sort((a, b) => {
            if (sortBy === 'score') {
                const scoreA = a.ai_score || 0;
                const scoreB = b.ai_score || 0;
                if (scoreB !== scoreA) return scoreB - scoreA;
            }
            
            // Default Sort: Date DESC
            const dateA = new Date(a.created_at || 0).getTime();
            const dateB = new Date(b.created_at || 0).getTime();
            return dateB - dateA;
        });
    }, [leads, searchTerm, filterStatus, filterScore, filterDate, filterConsultant, filterInterest, filterOrigin, sortBy]);

    // TACTICAL COUNTERS
    const counters = useMemo(() => {
        const elite = filteredLeads.filter(l => (l.ai_score || 0) >= 70 && (l.ai_score || 0) < 99).length;
        const emergency = filteredLeads.filter(l => (l.ai_score || 0) === 99).length;
        return { total: filteredLeads.length, elite, emergency };
    }, [filteredLeads]);

    if (loading && page === 1) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <div className="h-12 w-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="w-full h-screen flex flex-col pt-0 px-0 items-start justify-start leading-none bg-[#0C0C0F] overflow-hidden">
            {/* HEADER — linha 1: título + contadores + ações */}
            <header className="px-5 py-3 bg-[#0C0C0F] border-b border-white/[0.06] shrink-0 w-full z-[60]">
                <div className="flex items-center justify-between gap-4 w-full">
                    {/* Título */}
                    <div className="flex items-center gap-3 shrink-0">
                        <div>
                            <h1 className="text-base font-black text-white uppercase tracking-tight leading-none">
                                Pipeline <span className="text-red-500">de Vendas</span>
                            </h1>
                            <p className="text-[9px] text-white/25 font-medium uppercase tracking-widest mt-0.5">Central de Vendas</p>
                        </div>

                        {/* Contadores inline */}
                        <div className="hidden sm:flex items-center gap-1 ml-4">
                            <span className="text-xs font-black text-white/70 tabular-nums">{counters.total}</span>
                            <span className="text-[9px] text-white/25 uppercase">total</span>
                            <span className="w-px h-3 bg-white/10 mx-2" />
                            <span className="text-xs font-black text-amber-400 tabular-nums">{counters.elite}</span>
                            <span className="text-[9px] text-white/25 uppercase">elite</span>
                            {counters.emergency > 0 && (
                                <>
                                    <span className="w-px h-3 bg-white/10 mx-2" />
                                    <span className="text-xs font-black text-red-500 tabular-nums animate-pulse">{counters.emergency}</span>
                                    <span className="text-[9px] text-red-500/60 uppercase">urgente</span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-2">
                        {/* Busca */}
                        <div className="flex items-center bg-[#141418] border border-white/[0.07] rounded-lg px-3 py-2 w-36 lg:w-44 xl:w-56 focus-within:border-white/20 transition-all">
                            <Search size={13} className="text-white/30 shrink-0" />
                            <input
                                type="text"
                                placeholder="Buscar..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="bg-transparent border-none outline-none text-[12px] text-white/80 w-full ml-2 placeholder:text-white/20"
                            />
                        </div>

                        {/* Toggle lista/kanban */}
                        <div className="flex bg-[#141418] p-0.5 rounded-lg border border-white/[0.07]">
                            <button
                                onClick={() => setViewMode('kanban')}
                                className={`px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1.5 text-[11px] font-semibold ${
                                    viewMode === 'kanban'
                                        ? 'bg-white/10 text-white'
                                        : 'text-white/30 hover:text-white/60'
                                }`}
                            >
                                <LayoutGrid size={13} /> Kanban
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1.5 text-[11px] font-semibold ${
                                    viewMode === 'list'
                                        ? 'bg-white/10 text-white'
                                        : 'text-white/30 hover:text-white/60'
                                }`}
                            >
                                <ListIcon size={13} /> Lista
                            </button>
                        </div>

                        {/* Novo alvo */}
                        <button
                            className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-3 py-2 rounded-lg text-[12px] font-bold transition-all active:scale-95"
                            onClick={() => setIsAddingLead(true)}
                        >
                            <Plus size={14} /> Novo
                        </button>
                    </div>
                </div>
            </header>

            {/* FILTROS — linha 2: compacta e organizada */}
            <div className="w-full bg-[#0C0C0F] border-b border-white/[0.05] px-5 py-2 flex items-center gap-2 overflow-x-auto custom-scrollbar shrink-0 z-[60]">
                {/* Select estilizado padrão */}
                {[
                    { icon: Calendar, value: filterDate, onChange: setFilterDate, options: [
                        { value: 'all', label: 'Todas as datas' },
                        { value: 'today', label: 'Hoje' },
                        { value: 'week', label: 'Esta semana' },
                        { value: 'month', label: 'Este mês' },
                    ]},
                    { icon: User, value: filterConsultant, onChange: setFilterConsultant, disabled: role !== 'admin', options: [
                        { value: 'all', label: 'Todos os consultores' },
                        ...consultants.map(c => ({ value: c.id, label: c.name.split(' ')[0] }))
                    ]},
                    { icon: Car, value: filterInterest, onChange: setFilterInterest, options: [
                        { value: 'all', label: 'Qualquer veículo' },
                        ...inventory.slice(0, 20).map(item => ({ value: item.name, label: item.name }))
                    ]},
                    { icon: Globe, value: filterOrigin, onChange: setFilterOrigin, options: [
                        { value: 'all', label: 'Todas as origens' },
                        ...origins.map(o => ({ value: o, label: o }))
                    ]},
                ].map(({ icon: Icon, value, onChange, disabled, options }, i) => (
                    <div key={i} className="flex items-center gap-1.5 bg-[#141418] border border-white/[0.07] rounded-md px-2.5 py-1.5 shrink-0">
                        <Icon size={11} className="text-white/25 shrink-0" />
                        <select
                            value={value}
                            onChange={(e) => onChange(e.target.value)}
                            disabled={disabled}
                            className="bg-transparent border-none text-[11px] font-medium text-white/80 outline-none cursor-pointer disabled:opacity-30 max-w-[130px]"
                        >
                            {options.map((opt, idx) => (
                                <option key={`${opt.value}-${idx}`} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>
                ))}

                <div className="w-px h-4 bg-white/[0.08] shrink-0 mx-1" />

                <div className="flex items-center gap-1.5 bg-[#141418] border border-white/[0.07] rounded-md px-2.5 py-1.5 shrink-0">
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="bg-transparent border-none text-[11px] font-medium text-white/60 outline-none cursor-pointer"
                    >
                        <option value="all">Todas as etapas</option>
                        <option value="new">Entrada</option>
                        <option value="contacted">Triagem</option>
                        <option value="negotiation">Ataque</option>
                        <option value="proposed">Fechamento</option>
                    </select>
                </div>

                <div className="flex items-center gap-1.5 bg-[#141418] border border-white/[0.07] rounded-md px-2.5 py-1.5 shrink-0">
                    <select
                        value={filterScore}
                        onChange={(e) => setFilterScore(e.target.value)}
                        className="bg-transparent border-none text-[11px] font-medium text-white/60 outline-none cursor-pointer"
                    >
                        <option value="all">Score IA</option>
                        <option value="high">Elite (70%+)</option>
                        <option value="med">Médio (40-70%)</option>
                        <option value="low">Frio (&lt;40%)</option>
                    </select>
                </div>
            </div>

            {/* MAIN CONTENT AREA - NO DOUBLE SCROLLBARS */}
            <main className="flex-1 w-full overflow-hidden relative">
                <AnimatePresence mode="wait">
                    {viewMode === 'kanban' ? (
                        <motion.div
                            key="kanban"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="h-full"
                        >
                            <KanbanBoardV2 
                                leads={filteredLeads} 
                                setLeads={setLeads}
                                userName={userName}
                                onView={(lead) => {
                                    setIsManagement(false);
                                    setSelectedLead(lead);
                                }}
                                onManage={(lead) => {
                                    setIsManagement(true);
                                    setSelectedLead(lead);
                                }}
                                onStatusChange={handleStatusChange}
                            />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="list"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="h-full overflow-y-auto custom-scrollbar px-4 py-4"
                        >
                            <LeadListV2 
                                leads={filteredLeads} 
                                onView={(lead) => {
                                    setIsManagement(false);
                                    setSelectedLead(lead);
                                }}
                                onManage={(lead) => {
                                    setIsManagement(true);
                                    setSelectedLead(lead);
                                }}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {selectedLead && (
                <LeadProfileModalV2 
                    lead={selectedLead} 
                    onClose={() => {
                        setSelectedLead(null);
                        setIsManagement(false);
                    }}
                    setLeads={setLeads}
                    userName={userName}
                    isManagement={isManagement}
                />
            )}

            <NewLeadModalV2 
                isOpen={isAddingLead}
                onClose={() => setIsAddingLead(false)}
                onSuccess={(newLead) => {
                    setLeads(prev => [newLead as Lead, ...prev]);
                    setSelectedLead(newLead as Lead);
                } }
                userName={userName}
                consultantId={consultantId}
            />
        </div>
    );
}

export default function PipelineV2() {
    return (
        <React.Suspense fallback={
            <div className="flex h-[80vh] items-center justify-center">
                <div className="h-12 w-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
            </div>
        }>
            <PipelineContent />
        </React.Suspense>
    );
}
