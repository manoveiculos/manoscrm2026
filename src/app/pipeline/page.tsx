'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { leadService } from '@/lib/leadService';
import { createClient } from '@/lib/supabase/client';
import { Lead, LeadStatus } from '@/lib/types';
import { HUDSelect } from '../../components/shared_leads/HUDSelect';
import { calculateLeadScore } from '@/utils/calculateScore';
import { isLeadQualified } from '@/utils/leadQualification';
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
    X,
    Sparkles
} from 'lucide-react';
import { dataService } from '@/lib/dataService';


function PipelineContent() {
    const supabase = createClient();
    const searchParams = useSearchParams();
    const filterFromUrl = searchParams.get('filter');
    const leadIdFromUrl = searchParams.get('id');

    const [leads, setLeads] = useState<Lead[]>([]);
    const [serverTotalCount, setServerTotalCount] = useState(0);
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

    // Busca semântica — ativa quando query tem 4+ palavras
    const [semanticIds, setSemanticIds] = useState<Set<string> | null>(null);
    const [isSemanticLoading, setIsSemanticLoading] = useState(false);

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
                    const cName = consultant.name.split(' ')[0];
                    const cRole = isAdmin ? 'admin' : (consultant.role || 'consultant');
                    setUserName(cName);
                    setRole(cRole);
                    if (cRole !== 'admin') {
                        setConsultantId(consultant.id);
                        setFilterConsultant(consultant.id);
                    }
                } else if (isAdmin) {
                    setRole('admin');
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
            const limit = 2000; // MASSIVE LOAD to cover the entire unified database (1106+ leads)
            const result = await leadService.getLeadsPaginated(supabase, {
                page: pageNum,
                limit, 
                consultantId,
                searchTerm: debouncedSearchTerm || undefined,
                role: role as 'admin' | 'consultant' // ISOLAMENTO DE DADOS
            });

            if (isNewSearch) {
                setLeads(result.leads);
                setServerTotalCount(result.totalCount);
            } else {
                setLeads(prev => [...prev, ...result.leads]);
                setServerTotalCount(result.totalCount);
            }
            
            setHasMore(result.leads.length === limit);
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

            // Briefing pré-visita: quando lead é agendado, gera resumo tático para o consultor
            if (newStatus === 'ataque' || newStatus === 'scheduled' || newStatus === 'confirmed') {
                fetch('/api/lead/pre-visit-brief', {
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

    // Busca semântica — dispara quando query tem 4+ palavras
    useEffect(() => {
        const words = debouncedSearchTerm.trim().split(/\s+/).filter(Boolean);
        if (words.length < 4) {
            setSemanticIds(null);
            return;
        }
        setIsSemanticLoading(true);
        fetch('/api/ai/semantic-search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: debouncedSearchTerm, limit: 100 }),
        })
            .then(r => r.json())
            .then(data => {
                if (data.results && Array.isArray(data.results)) {
                    setSemanticIds(new Set(data.results.map((r: { id: string }) => r.id)));
                } else {
                    setSemanticIds(null);
                }
            })
            .catch(() => setSemanticIds(null))
            .finally(() => setIsSemanticLoading(false));
    }, [debouncedSearchTerm]);

    // Re-fetch on filter/search change
    useEffect(() => {
        setPage(1);
        loadLeads(1, true);
    }, [debouncedSearchTerm, consultantId, filterFromUrl]);

    const filteredLeads = useMemo(() => {
        const fifteenDaysAgo = Date.now() - 15 * 24 * 60 * 60 * 1000;

        let filtered = leads.filter(l => {
            const norm = normalizeStatus(l.status);
            // Somente leads qualificados (com nome real) entram no Pipeline
            if (!isLeadQualified(l)) return false;
            
            // Regra: Ocultar Vendidos e Perdidos do Pipeline
            if (norm === 'vendido' || norm === 'perdido') return false;

            // Regra: Ocultar leads sem atividade há mais de 15 dias
            const lastActivity = new Date(l.updated_at || l.created_at || 0).getTime();
            if (lastActivity < fifteenDaysAgo) return false;

            return true;
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

        // Busca semântica (4+ palavras) ou filtro de texto simples
        if (searchTerm) {
            if (semanticIds !== null) {
                // Modo IA: retorna apenas IDs vindos do vector search
                filtered = filtered.filter(l => semanticIds.has(l.id));
            } else {
                const terms = searchTerm.toLowerCase().split(/\s+/).filter(t => t.length > 0);
                filtered = filtered.filter(l => {
                    const searchableText = [
                        l.name,
                        l.phone,
                        l.vehicle_interest,
                        l.source,
                        l.origem,
                        l.region,
                        l.cpf,
                        l.id,
                        l.real_id?.toString()
                    ].join(' ').toLowerCase();
                    return terms.every(term => searchableText.includes(term));
                });
            }
        }

        // Status Filter
        if (filterStatus !== 'all') {
            filtered = filtered.filter(l => normalizeStatus(l.status) === filterStatus);
        }

        // Score Filter — Unify logic with Display (ai_score or calculated fallback)
        if (filterScore !== 'all') {
            const now = new Date();
            filtered = filtered.filter(l => {
                const aiScore = Number(l.ai_score);
                const s = aiScore > 0 ? aiScore : calculateLeadScore({
                    status: normalizeStatus(l.status),
                    tempoFunilHoras: Math.max(0, (now.getTime() - new Date(l.created_at || 0).getTime()) / (1000 * 60 * 60)),
                    totalInteracoes: 0,
                    ultimaInteracaoH: Math.max(0, (now.getTime() - new Date(l.created_at || 0).getTime()) / (1000 * 60 * 60)),
                    temValorDefinido: !!l.valor_investimento && l.valor_investimento !== '0',
                    temVeiculoInteresse: !!l.vehicle_interest && l.vehicle_interest !== '---'
                });

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
    }, [leads, searchTerm, filterStatus, filterScore, filterDate, filterConsultant, filterInterest, filterOrigin, sortBy, filterAI, semanticIds]);

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
    }, [filteredLeads, leads]);

    const handleConsultantChange = async (leadId: string, newConsultantId: string) => {
        if (role !== 'admin') return;
        try {
            const consultant = consultants.find(c => c.id === newConsultantId);
            const previousConsultantId = leads.find(l => l.id === leadId)?.assigned_consultant_id;

            const { error } = await supabase
                .from('leads_manos_crm')
                .update({
                    assigned_consultant_id: newConsultantId,
                    primeiro_vendedor: consultant?.name,
                    updated_at: new Date().toISOString()
                })
                .eq('id', leadId);

            if (error) throw error;

            setLeads(prev => prev.map(l => l.id === leadId ? {
                ...l,
                assigned_consultant_id: newConsultantId,
                consultant_name: consultant?.name,
                primeiro_vendedor: consultant?.name
            } : l));

            // Handoff inteligente — gera briefing para o novo consultor (fire-and-forget)
            if (previousConsultantId && previousConsultantId !== newConsultantId) {
                fetch('/api/lead/handoff-brief', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        leadId,
                        newConsultantId,
                        newConsultantName: consultant?.name,
                        previousConsultantId,
                    }),
                }).catch(() => {});
            }
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
                                Pipeline <span className="text-red-500">de Vendas</span>
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
                        <div className={`flex items-center bg-[#141418] border rounded-lg px-3 py-2 w-28 sm:w-36 lg:w-44 xl:w-56 focus-within:border-white/20 transition-all ${semanticIds !== null ? 'border-violet-500/40' : 'border-white/[0.07]'}`}>
                            {loading || isSemanticLoading ? (
                                <div className={`h-3.5 w-3.5 border-2 rounded-full animate-spin shrink-0 ${isSemanticLoading ? 'border-violet-500/30 border-t-violet-400' : 'border-white/20 border-t-white/80'}`} />
                            ) : semanticIds !== null ? (
                                <Sparkles size={13} className="text-violet-400 shrink-0" />
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
                            {searchTerm && (
                                <button onClick={() => setSearchTerm('')} className="text-white/20 hover:text-white/50 ml-1 shrink-0">
                                    <X size={11} />
                                </button>
                            )}
                        </div>
                        {semanticIds !== null && (
                            <div className="hidden lg:flex items-center gap-1 text-[10px] text-violet-400/70 font-semibold bg-violet-500/[0.07] border border-violet-500/20 rounded-md px-2 py-1 shrink-0">
                                <Sparkles size={9} /> IA semântica
                            </div>
                        )}

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
            <div className="w-full bg-[#0C0C0F] border-b border-white/[0.05] px-3 sm:px-6 py-2.5 flex items-center gap-6 overflow-visible custom-scrollbar shrink-0 z-[70]">
                
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
