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
    Plus,
    X
} from 'lucide-react';
import { dataService } from '@/lib/dataService';

function HUDSelect({ label, value, options, onChange, minWidth = '120px', disabled = false }: { 
    label: string, 
    value: string, 
    options: { id: string, label: string }[], 
    onChange: (val: string) => void,
    minWidth?: string,
    disabled?: boolean
}) {
    const [isOpen, setIsOpen] = useState(false);
    const selectedOption = options.find(opt => opt.id === value) || options[0];

    return (
        <div className={`flex flex-col relative ${disabled ? 'opacity-30 pointer-events-none' : ''}`} onMouseLeave={() => setIsOpen(false)}>
            <span className="text-[7px] font-black text-red-500 uppercase tracking-widest mb-0.5">{label}</span>
            <button 
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className="flex items-center justify-between gap-2 bg-transparent text-[9px] font-black text-white/60 outline-none uppercase cursor-pointer hover:text-white transition-colors text-left"
                style={{ minWidth }}
            >
                <span className="truncate">{selectedOption.label}</span>
                <ChevronDown size={8} className={isOpen ? 'text-red-500' : 'text-white/20'} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div 
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="absolute top-full left-0 bg-[#0a0a0a]/95 border border-white/10 rounded-lg shadow-[0_20px_50px_rgba(0,0,0,0.95)] py-1.5 z-[100] min-w-[200px] backdrop-blur-3xl"
                    >
                        <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                            {options.map(opt => (
                                <button
                                    key={opt.id}
                                    onClick={() => {
                                        onChange(opt.id);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full text-left px-4 py-2 text-[8px] font-black uppercase tracking-widest hover:bg-red-600/10 hover:text-white transition-all flex items-center justify-between group ${value === opt.id ? 'text-red-500 bg-red-600/5' : 'text-white/40'}`}
                                >
                                    {opt.label}
                                    {value === opt.id && <div className="w-1 h-1 rounded-full bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.8)]" />}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

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
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
    const [viewMode, setViewMode] = useState<'kanban' | 'list'>('list');
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

    const [filterAI, setFilterAI] = useState(false);

    // Briefing Matinal IA
    const [dailyBrief, setDailyBrief] = useState<{
        saudacao: string;
        resumo: string;
        prioridades: string[];
        aviso: string | null;
        stats?: { total: number; hot: number; slaBreached: number };
    } | null>(null);
    const [briefDismissed, setBriefDismissed] = useState(false);

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
                searchTerm: debouncedSearchTerm || undefined
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

            // IA proativa: quando lead avança para estágios decisivos, dispara análise em background.
            // Quando o vendedor abrir o modal do lead, o script já estará pronto.
            if (newStatus === 'ataque' || newStatus === 'fechamento') {
                fetch('/api/lead/next-steps', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ leadId }),
                }).catch(() => {});
            }
        } catch (err) {
            console.error("Error updating lead status:", err);
            setLeads(oldLeads); // Revert on error
        }
    };

    // Debounce Search Term — aguarda o usuário parar de digitar (500ms) para não sobrecarregar o banco
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
        }, 500); 
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Re-fetch on filter/search change
    useEffect(() => {
        setPage(1);
        loadLeads(1, true);
    }, [debouncedSearchTerm, consultantId, filterFromUrl]);

    const filteredLeads = useMemo(() => {
        // Normalize status before filtering so V1 statuses ('perda total', 'venda realizada', etc.) are handled
        let filtered = leads.filter(l => {
            const norm = normalizeStatus(l.status);
            return norm !== 'vendido' && norm !== 'perdido';
        });
        
        // Date Filter (Aligned with Central de Leads)
        if (filterDate !== 'all') {
            const now = new Date();
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            
            filtered = filtered.filter(l => {
                const leadDate = new Date(l.created_at || 0).getTime();
                if (filterDate === 'today') return leadDate >= todayStart.getTime();
                if (filterDate === '7days') return leadDate >= (Date.now() - 7 * 24 * 60 * 60 * 1000);
                if (filterDate === '30days') return leadDate >= (Date.now() - 30 * 24 * 60 * 60 * 1000);
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
            filtered = filtered.filter(l => normalizeStatus(l.status) === filterStatus);
        }

        // Score Filter
        if (filterScore !== 'all') {
            filtered = filtered.filter(l => {
                const s = l.ai_score || 0;
                if (filterScore === 'quente') return s >= 80;
                if (filterScore === 'morno') return s >= 60 && s < 80;
                if (filterScore === 'frio') return s >= 30 && s < 60;
                if (filterScore === 'gelado') return s < 30;
                return true;
            });
        }

        // Filtro IA Recomenda Hoje: hot/quente + sem contato recente (>2h)
        if (filterAI) {
            const cutoff = Date.now() - 2 * 3_600_000;
            filtered = filtered.filter(l => {
                const score = Number(l.ai_score) || 0;
                const isHot = score >= 70 || l.ai_classification === 'hot';
                const lastTouch = new Date(l.updated_at || l.created_at).getTime();
                return isHot && lastTouch < cutoff;
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
    }, [leads, searchTerm, filterStatus, filterScore, filterDate, filterConsultant, filterInterest, filterOrigin, sortBy, filterAI]);

    // Briefing Matinal — busca 1x por sessão após leads carregados
    useEffect(() => {
        if (loading || !userName || leads.length === 0 || briefDismissed || dailyBrief) return;
        const today = new Date().toISOString().split('T')[0];
        const cacheKey = `brief_${today}_${consultantId || 'admin'}`;
        const dismissKey = `brief_dismissed_${today}`;
        if (typeof window !== 'undefined' && sessionStorage.getItem(dismissKey)) {
            setBriefDismissed(true);
            return;
        }
        const cached = typeof window !== 'undefined' ? sessionStorage.getItem(cacheKey) : null;
        if (cached) { setDailyBrief(JSON.parse(cached)); return; }
        const params = new URLSearchParams({ name: userName });
        if (consultantId) params.set('consultantId', consultantId);
        fetch(`/api/ai/daily-brief?${params}`)
            .then(r => r.json())
            .then(data => {
                if (data.saudacao) {
                    setDailyBrief(data);
                    sessionStorage.setItem(cacheKey, JSON.stringify(data));
                }
            })
            .catch(() => {});
    }, [loading, userName]);

    // TACTICAL COUNTERS
    const counters = useMemo(() => {
        const elite = filteredLeads.filter(l => (l.ai_score || 0) >= 70 && (l.ai_score || 0) < 99).length;
        const emergency = filteredLeads.filter(l => (l.ai_score || 0) === 99).length;
        const cutoff = Date.now() - 2 * 3_600_000;
        const aiHoje = leads.filter(l => {
            const norm = normalizeStatus(l.status);
            if (norm === 'vendido' || norm === 'perdido') return false;
            const score = Number(l.ai_score) || 0;
            const isHot = score >= 70 || l.ai_classification === 'hot';
            const lastTouch = new Date(l.updated_at || l.created_at).getTime();
            return isHot && lastTouch < cutoff;
        }).length;
        return { total: filteredLeads.length, elite, emergency, aiHoje };
    }, [filteredLeads]);

    const handleConsultantChange = async (leadId: string, consultantId: string) => {
        if (role !== 'admin') return;
        try {
            const consultant = consultants.find(c => c.id === consultantId);
            const { error } = await supabase
                .from('leads_manos_crm')
                .update({ 
                    assigned_consultant_id: consultantId,
                    primeiro_vendedor: consultant?.name,
                    updated_at: new Date().toISOString() 
                })
                .eq('id', leadId);

            if (error) throw error;

            setLeads(prev => prev.map(l => l.id === leadId ? { 
                ...l, 
                assigned_consultant_id: consultantId,
                consultant_name: consultant?.name,
                primeiro_vendedor: consultant?.name
            } : l));
        } catch (error) {
            console.error("Error updating consultant:", error);
        }
    };

    if (loading && page === 1 && leads.length === 0) {
        return (
            <div className="flex h-[80vh] items-center justify-center bg-[#0C0C0F]">
                <div className="h-12 w-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="w-full h-screen flex flex-col pt-0 px-0 items-start justify-start leading-none bg-[#0C0C0F] overflow-hidden">
            {/* HEADER — linha 1: título + contadores + ações */}
            <header className="px-3 sm:px-5 py-2 bg-[#0C0C0F] border-b border-white/[0.06] shrink-0 w-full z-[60]">
                <div className="flex items-center justify-between gap-4 w-full">
                    {/* Título */}
                    <div className="flex items-center gap-4 px-4 py-2 bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm">
                        <div className="flex flex-col">
                            <h1 className="text-sm font-black text-white uppercase tracking-tight leading-none whitespace-nowrap">
                                Central <span className="text-red-500">de Vendas</span>
                            </h1>
                        </div>

                        {/* Contadores inline */}
                        <div className="hidden sm:flex items-center gap-4 pl-4 border-l border-white/10 ml-2">
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-xs font-black text-white/80 tabular-nums">{counters.total}</span>
                                <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest leading-none">TOTAL</span>
                            </div>
                            
                            <div className="w-px h-3 bg-white/10" />
                            
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-xs font-black text-amber-400 tabular-nums">{counters.elite}</span>
                                <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest leading-none">ELITE</span>
                            </div>

                            {counters.emergency > 0 && (
                                <>
                                    <div className="w-px h-3 bg-white/10" />
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-xs font-black text-red-500 tabular-nums animate-pulse">{counters.emergency}</span>
                                        <span className="text-[8px] font-bold text-red-500/40 uppercase tracking-widest leading-none">URGENTE</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-2">
                        {/* Busca */}
                        <div className="flex items-center bg-[#141418] border border-white/[0.07] rounded-lg px-3 py-2 w-28 sm:w-36 lg:w-44 xl:w-56 focus-within:border-white/20 transition-all">
                            {loading ? (
                                <div className="h-3.5 w-3.5 border-2 border-white/20 border-t-white/80 rounded-full animate-spin shrink-0" />
                            ) : (
                                <Search size={13} className="text-white/30 shrink-0" />
                            )}
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

            {/* FILTROS — linha 2: compacta e organizada (HUD Style) */}
            <div className="w-full bg-[#0C0C0F] border-b border-white/[0.05] px-3 sm:px-6 py-2.5 flex items-center gap-6 overflow-x-auto custom-scrollbar shrink-0 z-[60]">
                
                <HUDSelect 
                    label="Período"
                    value={filterDate}
                    onChange={setFilterDate}
                    options={[
                        { id: 'all', label: 'TODAS AS DATAS' },
                        { id: 'today', label: 'HOJE' },
                        { id: '7days', label: 'ÚLTIMOS 7 DIAS' },
                        { id: '30days', label: 'ÚLTIMOS 30 DIAS' }
                    ]}
                />

                <div className="h-4 w-[1px] bg-white/10 shrink-0" />

                <HUDSelect 
                    label="Consultor"
                    value={filterConsultant}
                    onChange={setFilterConsultant}
                    minWidth="140px"
                    disabled={role !== 'admin'}
                    options={[
                        { id: 'all', label: 'TODOS OS CONSULTORES' },
                        ...consultants.map(c => ({ id: c.id, label: c.name }))
                    ]}
                />

                <div className="h-4 w-[1px] bg-white/10 shrink-0" />

                <HUDSelect 
                    label="Probabilidade"
                    value={filterScore}
                    onChange={setFilterScore}
                    options={[
                        { id: 'all', label: 'TODAS AS CHANCES' },
                        { id: 'quente', label: 'QUENTE (80%+)' },
                        { id: 'morno', label: 'MORNO (60-79%)' },
                        { id: 'frio', label: 'FRIO (30-59%)' },
                        { id: 'gelado', label: 'GELADO (<30%)' }
                    ]}
                />

                <div className="h-4 w-[1px] bg-white/10 shrink-0" />

                <HUDSelect 
                    label="Origem"
                    value={filterOrigin}
                    onChange={setFilterOrigin}
                    minWidth="140px"
                    options={[
                        { id: 'all', label: 'TODAS ORIGENS' },
                        ...origins.map(o => ({ id: o, label: o }))
                    ]}
                />

                <div className="h-4 w-[1px] bg-white/10 shrink-0 ml-auto" />

                {/* Chip — IA Recomenda Hoje */}
                {counters.aiHoje > 0 && (
                    <button
                        onClick={() => setFilterAI(p => !p)}
                        className={`flex items-center gap-1.5 border rounded-md px-2.5 py-1.5 shrink-0 text-[11px] font-semibold transition-all ${
                            filterAI
                                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                                : 'bg-[#141418] border-white/[0.07] text-white/40 hover:text-white/60 hover:border-white/15'
                        }`}
                    >
                        <Brain size={11} />
                        IA Hoje ({counters.aiHoje})
                    </button>
                )}
            </div>

            {/* BRIEFING MATINAL IA */}
            {dailyBrief && !briefDismissed && (
                <div className="w-full px-3 sm:px-5 py-2 bg-[#0C0C0F] border-b border-white/[0.05] shrink-0">
                    <div className="flex items-start gap-3 bg-[#141418] border border-amber-500/15 rounded-xl px-4 py-3">
                        <Brain size={14} className="text-amber-400 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                                <p className="text-[11px] font-bold text-amber-300 leading-snug">{dailyBrief.saudacao}</p>
                                <button
                                    onClick={() => {
                                        setBriefDismissed(true);
                                        const today = new Date().toISOString().split('T')[0];
                                        sessionStorage.setItem(`brief_dismissed_${today}`, 'true');
                                    }}
                                    className="text-white/20 hover:text-white/50 transition-colors shrink-0 mt-0.5"
                                >
                                    <X size={11} />
                                </button>
                            </div>
                            {dailyBrief.resumo && (
                                <p className="text-[10px] text-white/45 mt-0.5 leading-snug">{dailyBrief.resumo}</p>
                            )}
                            {dailyBrief.prioridades.length > 0 && (
                                <div className="flex flex-wrap gap-x-5 gap-y-0.5 mt-1.5">
                                    {dailyBrief.prioridades.map((p, i) => (
                                        <span key={i} className="text-[10px] text-white/55 leading-snug">
                                            <span className="text-amber-500/50 mr-1">→</span>{p}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {dailyBrief.aviso && (
                                <p className="text-[10px] text-red-400/75 mt-1.5 font-semibold leading-snug">⚠ {dailyBrief.aviso}</p>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* MAIN CONTENT AREA - NO DOUBLE SCROLLBARS */}
            <main className="flex-1 w-full overflow-hidden relative min-h-0">
                <AnimatePresence mode="wait">
                    {viewMode === 'kanban' ? (
                        <motion.div
                            key="kanban"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="h-full min-h-0 relative flex-1"
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
                                onStatusChange={handleStatusChange}
                                onConsultantChange={handleConsultantChange}
                                role={role as 'admin' | 'consultant'}
                                consultants={consultants}
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
