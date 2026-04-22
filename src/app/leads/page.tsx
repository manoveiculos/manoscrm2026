'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import {
    Search,
    Users,
    Filter,
    Zap,
    Target,
    Calendar,
    CarFront,
    Activity,
    ArrowUpDown,
    Plus,
    RefreshCcw,
    KanbanSquare,
    List,
    Brain,
    X,
    Loader2,
    Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { dataService } from '@/lib/dataService';
import { Lead, Consultant, InventoryItem, LeadStatus } from '@/lib/types';
import { leadService, leadCacheInvalidate } from '@/lib/leadService';
import { LeadListV2 } from '../pipeline/components/LeadListV2';
import { LeadProfileModalV2 } from '../components/lead-profile/LeadProfileModalV2';
import { NewLeadModalV2 } from '../pipeline/components/NewLeadModalV2';
import { KanbanBoardV2 } from '../pipeline/components/KanbanBoardV2';
import { supabase } from '@/lib/supabase';
import { ALL_STATUS, normalizeStatus } from '@/constants/status';
import { calculateLeadScore } from '@/utils/calculateScore';
import { isLeadQualified } from '@/utils/leadQualification';
import { HUDSelect } from '../../components/shared_leads/HUDSelect';
import { updateLeadStatusAction } from '../actions/leads';


export default function CentralLeadsV2() {
    return (
        <Suspense fallback={<div className="flex-1 flex items-center justify-center bg-[#03060b] text-white/20 font-black uppercase tracking-widest animate-pulse">Iniciando Radar Elíptico...</div>}>
            <LeadsContent />
        </Suspense>
    );
}

function LeadsContent() {
    const [leads, setLeads] = useState<Lead[]>([]);
    const [totalLeadsCount, setTotalLeadsCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
    const [isNewLeadModalOpen, setIsNewLeadModalOpen] = useState(false);
    const [isManagement, setIsManagement] = useState(false);
    const [userName, setUserName] = useState('');
    const [role, setRole] = useState<'admin' | 'consultant'>('consultant');
    const [consultantId, setConsultantId] = useState<string | null>(null);
    const [consultants, setConsultants] = useState<Consultant[]>([]);
    const [inventory, setInventory] = useState<InventoryItem[]>([]);

    // Filters
    const [filterConsultant, setFilterConsultant] = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterInterest, setFilterInterest] = useState('all');
    const [filterOrigin, setFilterOrigin] = useState('all');
    const [filterScore, setFilterScore] = useState('all');
    const [filterDate, setFilterDate] = useState('all');

    // Busca Semântica (P4)
    const [semanticMode, setSemanticMode] = useState(false);
    const [semanticQuery, setSemanticQuery] = useState('');
    const [semanticLoading, setSemanticLoading] = useState(false);
    const [semanticResults, setSemanticResults] = useState<{ id: string; similarity: number }[] | null>(null);
    const [semanticUnindexed, setSemanticUnindexed] = useState(0);
    const [indexingBatch, setIndexingBatch] = useState(false);
    const semanticDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const loadInitialData = async (skipLoadingFlag = false) => {
            if (!skipLoadingFlag) setLoading(true);
            try {
                const { data: { user } } = await supabase.auth.getUser();
                let userRole: 'admin' | 'consultant' = 'consultant';

                if (user) {
                    const isAdmin = user.email === 'alexandre_gorges@hotmail.com';
                    userRole = isAdmin ? 'admin' : 'consultant';
                    setRole(userRole);

                    const { data: profile } = await supabase
                        .from('consultants_manos_crm')
                        .select('id, name')
                        .eq('auth_id', user.id)
                        .maybeSingle();

                    let consultantParamId: string | undefined = undefined;
                    if (profile) {
                        setUserName(profile.name.split(' ')[0]);
                        consultantParamId = profile.id;
                        if (!isAdmin) {
                            setConsultantId(profile.id);
                        }
                    } else if (isAdmin) {
                        setUserName('Admin');
                    }

                    const [leadsResult, consultantsData, inventoryData] = await Promise.all([
                        leadService.getLeadsPaginated(undefined, {
                            consultantId: userRole === 'admin' ? undefined : (consultantParamId || user.id),
                            role: userRole,
                            limit: 2000
                        }),
                        dataService.getConsultants(),
                        dataService.getInventory()
                    ]);

                    setLeads(leadsResult.leads || []);
                    setTotalLeadsCount(leadsResult.totalCount || 0);
                    setConsultants(consultantsData || []);
                    setInventory(inventoryData || []);
                }
            } catch (error) {
                console.error("Error loading Central de Leads data:", error);
            } finally {
                if (!skipLoadingFlag) setLoading(false);
            }
        };

        loadInitialData();

        // Refetch silencioso quando o usuário volta para a aba após pelo menos 30s.
        // Garante que dados editados pela extensão Chrome (em outra janela/dispositivo)
        // apareçam ao retomar o foco, sem esperar o usuário dar F5.
        let lastHidden = 0;
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') {
                lastHidden = Date.now();
                return;
            }
            if (document.visibilityState === 'visible' && lastHidden > 0) {
                const awayMs = Date.now() - lastHidden;
                lastHidden = 0;
                if (awayMs >= 30_000) {
                    leadCacheInvalidate();
                    loadInitialData(true); // skip loading flag — refetch silencioso
                }
            }
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, []);

    const filteredLeads = (leads || [])
        .filter(lead => {
            const matchesSearch = !searchTerm || 
                lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                lead.phone.includes(searchTerm) ||
                (lead.cpf && lead.cpf.includes(searchTerm)) ||
                (lead.id && lead.id.toLowerCase().includes(searchTerm.toLowerCase())) ||
                (lead.vehicle_interest && lead.vehicle_interest.toLowerCase().includes(searchTerm.toLowerCase()));
            
            const matchesConsultant = 
                role === 'consultant' ? lead.assigned_consultant_id === consultantId :
                filterConsultant === 'all' ? true : 
                filterConsultant === 'none' ? !lead.assigned_consultant_id : 
                lead.assigned_consultant_id === filterConsultant;
            const matchesStatus = filterStatus === 'all' || normalizeStatus(lead.status) === filterStatus;
            const matchesOrigin = filterOrigin === 'all' || lead.source === filterOrigin || lead.origem === filterOrigin;
            const matchesInterest = filterInterest === 'all' || lead.vehicle_interest === filterInterest;
            
            // Date Filter Logic
            const leadDate = new Date(lead.created_at);
            const todayDate = new Date();
            todayDate.setHours(0, 0, 0, 0);
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

            const matchesDate = filterDate === 'all' || (
                filterDate === 'today' ? leadDate >= todayDate :
                filterDate === '7days' ? leadDate >= sevenDaysAgo :
                filterDate === '30days' ? leadDate >= thirtyDaysAgo :
                true
            );
            
            // Calc current score for filter — prioriza ai_score do banco, fallback heurístico
            const aiScore = Number(lead.ai_score);
            const currentScore = aiScore > 0 ? aiScore : (() => {
                const now = new Date();
                const createdAt = new Date(lead.created_at);
                const tempoFunilH = Math.max(0, (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60));
                return calculateLeadScore({
                    status: normalizeStatus(lead.status),
                    tempoFunilHoras: tempoFunilH,
                    totalInteracoes: 0,
                    ultimaInteracaoH: tempoFunilH,
                    temValorDefinido: !!lead.valor_investimento && lead.valor_investimento !== '0',
                    temVeiculoInteresse: !!lead.vehicle_interest && lead.vehicle_interest !== '---'
                });
            })();

            const matchesScore = filterScore === 'all' || (
                filterScore === 'quente' ? currentScore >= 80 :
                filterScore === 'morno' ? currentScore >= 60 && currentScore < 80 :
                filterScore === 'frio' ? currentScore >= 30 && currentScore < 60 :
                filterScore === 'gelado' ? currentScore < 30 :
                true
            );

            // ── REGRA DE ACESSO (CIRÚRGICA) ──────────────────────────
            // Se não for admin, o consultor só pode ver:
            // 1. Leads atribuídos a ele mesmo
            // 2. Leads que ainda não têm consultor atribuído (para triagem/resgate)
            if (role !== 'admin' && consultantId) {
                const isMine = lead.assigned_consultant_id === consultantId;
                const isOrphan = !lead.assigned_consultant_id || lead.assigned_consultant_id === '';
                if (!isMine && !isOrphan) return false;
            }
            // ──────────────────────────────────────────────────────────

            return matchesSearch && matchesConsultant && matchesStatus && matchesInterest && matchesOrigin && matchesScore && matchesDate;
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // ── Busca Semântica ──────────────────────────────────────
    const runSemanticSearch = async (q: string) => {
        if (!q.trim()) { setSemanticResults(null); return; }
        setSemanticLoading(true);
        try {
            const res = await fetch('/api/ai/semantic-search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: q }),
            });
            const data = await res.json();
            if (data.success) {
                setSemanticResults(data.results);
                setSemanticUnindexed(data.unindexed_count ?? 0);
            }
        } catch (e) {
            console.error('[semantic-search]', e);
        } finally {
            setSemanticLoading(false);
        }
    };

    const handleSemanticInput = (val: string) => {
        setSemanticQuery(val);
        if (semanticDebounce.current) clearTimeout(semanticDebounce.current);
        semanticDebounce.current = setTimeout(() => runSemanticSearch(val), 600);
    };

    const handleIndexBatch = async () => {
        setIndexingBatch(true);
        try {
            const res = await fetch('/api/ai/embed-lead', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ batch: true }),
            });
            const data = await res.json();
            setSemanticUnindexed(prev => Math.max(0, prev - (data.indexed ?? 0)));
            if (semanticQuery) runSemanticSearch(semanticQuery);
        } catch (e) {
            console.error('[embed-lead batch]', e);
        } finally {
            setIndexingBatch(false);
        }
    };

    // Leads resultantes da busca semântica (por ID, ordenados por similarity)
    const semanticLeads = semanticResults
        ? semanticResults
            .map(r => ({ lead: leads.find(l => l.id === r.id), similarity: r.similarity }))
            .filter(r => r.lead)
            .map(r => r.lead!)
        : null;

    // Em modo semântico, usa os leads da busca IA (já ordenados por similarity)
    const displayLeads = (semanticMode && semanticLeads) ? semanticLeads : filteredLeads;
    // ──────────────────────────────────────────────────────────

    const handleStatusChange = async (leadId: string, newStatus: LeadStatus) => {
        const normalized = normalizeStatus(newStatus);
        
        // Interceptar estados finais para garantir captura de motivo/detalhes via Modal
        if (normalized === 'perdido' || normalized === 'vendido') {
            const lead = leads.find(l => l.id === leadId);
            if (lead) {
                setSelectedLead(lead);
                setIsManagement(true);
                return;
            }
        }

        try {
            const oldStatus = leads.find(l => l.id === leadId)?.status;
            
            // Usar Server Action para lidar com múltiplos bancos (manos/master) e prefixos (main_/master_)
            await updateLeadStatusAction(leadId, newStatus, oldStatus);

            setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));

            // IA proativa: dispara análise em background ao avançar para etapas decisivas
            if (newStatus === 'ataque' || newStatus === 'fechamento') {
                fetch('/api/lead/next-steps', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ leadId }),
                }).catch(() => {});
            }

            // Briefing pré-visita ao agendar
            if (newStatus === 'ataque' || newStatus === 'scheduled' || newStatus === 'confirmed') {
                fetch('/api/lead/pre-visit-brief', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ leadId }),
                }).catch(() => {});
            }
        } catch (error) {
            console.error("Error updating status:", error);
            alert("Erro ao atualizar status do lead.");
        }
    };

    const handleConsultantChange = async (leadId: string, newConsultantId: string) => {
        if (role !== 'admin') return;
        try {
            const consultant = consultants.find(c => c.id === newConsultantId);
            const currentLead = leads.find(l => l.id === leadId);
            const previousConsultantId = currentLead?.assigned_consultant_id;

            await leadService.updateLeadDetails(undefined, leadId, {
                assigned_consultant_id: newConsultantId,
                primeiro_vendedor: consultant?.name
            });

            setLeads(prev => prev.map(l => l.id === leadId ? {
                ...l,
                assigned_consultant_id: newConsultantId,
                vendedor: consultant?.name,
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

    const interests = Array.from(new Set(leads.map(l => l.vehicle_interest).filter(Boolean)))
        .filter(interest => {
            const up = interest.toUpperCase();
            const genericIntents = ['COMPRA', 'VENDA', 'TROCA', 'DUVIDA', 'FALAR COM CONSULTOR', '---', 'INTERESSE'];
            return !genericIntents.some(g => up.includes(g)) && up.length > 2;
        })
        .sort();
    const origins = Array.from(new Set(leads.map(l => l.source).filter(Boolean)));

    return (
        <div className="flex flex-col h-screen w-full bg-[#03060b] overflow-hidden text-white font-inter">
            {/* HUD HEADER - ELITE OS STYLE */}
            <header className="shrink-0 h-16 border-b border-white/5 bg-[#050101]/80 backdrop-blur-xl flex items-center justify-between px-3 sm:px-6 z-30 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                <div className="flex items-center gap-4 px-4 py-2.5 bg-white/[0.03] border border-white/10 rounded-2xl shadow-sm">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2.5">
                            <Users size={14} className="text-red-600" />
                            <h1 className="text-xs font-black uppercase tracking-[0.3em] text-white/95 whitespace-nowrap">
                                Central <span className="text-red-500 font-black">DA IA</span>
                            </h1>
                            <div className="text-[6px] font-bold text-white/10 uppercase tracking-[0.2em] -mt-1">Visibility: FULL DATABASE</div>
                        </div>
                    </div>

                    <div className="hidden sm:flex items-center gap-4 pl-4 border-l border-white/10 ml-2">
                        <div className="flex items-baseline gap-1.5">
                            <span className="text-xs font-black text-white/80 tabular-nums">{totalLeadsCount || leads.length}</span>
                            <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">TOTAL</span>
                        </div>
                        <div className="w-px h-3 bg-white/10" />
                        <div className="flex items-baseline gap-1.5">
                            <span className={`text-xs font-black tabular-nums ${semanticMode ? 'text-violet-400' : 'text-red-500'}`}>0</span>
                            <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">IA</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Toggle busca semântica IA */}
                    <button
                        onClick={() => {
                            setSemanticMode(m => !m);
                            setSemanticQuery('');
                            setSemanticResults(null);
                        }}
                        title={semanticMode ? 'Fechar busca IA' : 'Busca inteligente por IA'}
                        className={`h-9 w-9 flex items-center justify-center rounded-xl border transition-all ${
                            semanticMode
                                ? 'bg-violet-600/20 border-violet-500/50 text-violet-400 shadow-[0_0_12px_rgba(139,92,246,0.3)]'
                                : 'bg-white/5 border-white/5 text-white/25 hover:text-white/60 hover:border-white/15'
                        }`}
                    >
                        <Brain size={14} />
                    </button>

                    {/* Input — normal ou semântico */}
                    <div className="relative group">
                        {semanticMode ? (
                            <>
                                <Brain size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-400" />
                                {semanticLoading && <Loader2 size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-violet-400 animate-spin" />}
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Ex: clientes com SUV e troca..."
                                    value={semanticQuery}
                                    onChange={(e) => handleSemanticInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && runSemanticSearch(semanticQuery)}
                                    className="bg-violet-950/30 border border-violet-500/30 rounded-xl py-2.5 pl-9 pr-8 text-[10px] font-black w-56 sm:w-72 focus:w-72 sm:focus:w-80 focus:border-violet-500/60 outline-none transition-all placeholder:text-violet-300/20 text-violet-100"
                                />
                            </>
                        ) : (
                            <>
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-red-500 transition-colors" />
                                <input
                                    type="text"
                                    placeholder="BUSCAR..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="bg-white/5 border border-white/5 rounded-xl py-2.5 pl-10 pr-4 text-[10px] font-black uppercase tracking-widest w-32 sm:w-48 focus:w-44 sm:focus:w-64 lg:w-64 lg:focus:w-80 focus:bg-white/10 focus:border-red-500/30 outline-none transition-all placeholder:text-white/10"
                                />
                            </>
                        )}
                    </div>

                    <button
                        onClick={() => setIsNewLeadModalOpen(true)}
                        className="h-9 px-3.5 bg-red-600 hover:bg-red-500 text-white rounded-xl flex items-center gap-2 transition-all shadow-[0_4px_15px_rgba(239,68,68,0.3)] active:scale-95"
                    >
                        <Plus size={14} strokeWidth={3} />
                        <span className="text-[9px] font-black uppercase tracking-widest hidden sm:block">Novo Alvo</span>
                    </button>
                </div>
            </header>

            {/* SEMANTIC SEARCH STATUS BAR */}
            <AnimatePresence>
                {semanticMode && (
                    <motion.div
                        key="semantic-bar"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="shrink-0 border-b border-violet-500/20 bg-violet-950/20 overflow-hidden"
                    >
                        <div className="flex items-center gap-3 px-3 sm:px-6 py-2">
                            <Brain size={11} className="text-violet-400 shrink-0" />
                            <span className="text-[10px] font-black text-violet-400/80 uppercase tracking-widest">
                                Modo IA —
                            </span>
                            {semanticResults === null ? (
                                <span className="text-[10px] text-white/30">Digite uma descrição para buscar leads por contexto</span>
                            ) : semanticResults.length === 0 ? (
                                <span className="text-[10px] text-white/30">Nenhum lead encontrado para esta descrição</span>
                            ) : (
                                <span className="text-[10px] text-white/50">
                                    <span className="text-violet-300 font-black">{semanticResults.length}</span> leads encontrados por similaridade
                                </span>
                            )}
                            {semanticUnindexed > 0 && (
                                <button
                                    onClick={handleIndexBatch}
                                    disabled={indexingBatch}
                                    className="ml-auto flex items-center gap-1.5 px-2.5 py-1 bg-violet-600/20 border border-violet-500/30 rounded-lg text-[9px] font-black text-violet-300 hover:bg-violet-600/30 transition-all disabled:opacity-40"
                                >
                                    {indexingBatch ? <Loader2 size={9} className="animate-spin" /> : <Database size={9} />}
                                    {indexingBatch ? 'Indexando...' : `Indexar ${semanticUnindexed} leads`}
                                </button>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>


            {/* QUICK FILTERS BAR - OPTIMIZED FOR 100% SCREEN */}
            <div className="shrink-0 min-h-12 border-b border-white/5 bg-[#03060b] flex flex-wrap items-center gap-x-2 gap-y-2 px-3 sm:px-6 py-2.5 z-[100] relative">
                <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/10">
                    <button 
                        onClick={() => setViewMode('list')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'text-white/30 hover:text-white/60'}`}
                    >
                        <List size={12} strokeWidth={3} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Lista</span>
                    </button>
                    <button 
                        onClick={() => setViewMode('kanban')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all ${viewMode === 'kanban' ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'text-white/30 hover:text-white/60'}`}
                    >
                        <KanbanSquare size={12} strokeWidth={3} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Kanban</span>
                    </button>
                </div>

                <div className="h-4 w-[1px] bg-white/10 hidden lg:block" />

                <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                    <HUDSelect 
                        label="Período"
                        value={filterDate}
                        onChange={setFilterDate}
                        options={[
                            { id: 'all', label: 'TODAS AS DATAS' },
                            { id: 'today', label: 'HOJE' },
                            { id: '7days', label: 'ÚLTIMOS 7 DIAS' },
                            { id: '30days', label: 'ÚLTIMOS 30 DIAS' },
                            { id: 'custom', label: 'PERSONALIZADO...' }
                        ]}
                    />

                    <div className="h-4 w-[1px] bg-white/10" />

                    <HUDSelect 
                        label="Consultor"
                        value={filterConsultant}
                        onChange={setFilterConsultant}
                        minWidth="120px"
                        disabled={role !== 'admin'}
                        options={[
                            { id: 'all', label: 'TODOS' },
                            { id: 'none', label: 'SEM VENDEDOR' },
                            ...consultants.map(c => ({ id: c.id, label: c.name }))
                        ]}
                    />

                    <div className="h-4 w-[1px] bg-white/10" />

                    <HUDSelect 
                        label="Etapa"
                        value={filterStatus}
                        onChange={setFilterStatus}
                        options={[
                            { id: 'all', label: 'TODAS AS ETAPAS' },
                            ...ALL_STATUS.map(s => ({ id: s.id, label: s.label }))
                        ]}
                    />

                    <div className="h-4 w-[1px] bg-white/10" />

                    <HUDSelect 
                        label="Interesse"
                        value={filterInterest}
                        onChange={setFilterInterest}
                        minWidth="120px"
                        options={[
                            { id: 'all', label: 'QUALQUER VEÍCULO' },
                            ...interests.map(i => ({ id: i, label: i }))
                        ]}
                    />

                    <div className="h-4 w-[1px] bg-white/10" />

                    <HUDSelect 
                        label="Origem"
                        value={filterOrigin}
                        onChange={setFilterOrigin}
                        options={[
                            { id: 'all', label: 'TODAS ORIGENS' },
                            ...origins.map(o => ({ id: o, label: o }))
                        ]}
                    />

                    <div className="h-4 w-[1px] bg-white/10 shadow-lg" />

                    <HUDSelect 
                        label="Score"
                        value={filterScore}
                        onChange={setFilterScore}
                        options={[
                            { id: 'all', label: 'TODAS PROBABILS.' },
                            { id: 'quente', label: 'QUENTE (80%+)' },
                            { id: 'morno', label: 'MORNO (60-79%)' },
                            { id: 'frio', label: 'FRIO (30-59%)' },
                            { id: 'gelado', label: 'GELADO (0-29%)' }
                        ]}
                    />
                </div>

                <div className="ml-auto flex items-center gap-4">
                    <button 
                        onClick={() => {
                            setLoading(true);
                            leadService.getLeadsPaginated(undefined, {
                                consultantId: role === 'admin' ? undefined : (consultantId || undefined),
                                role: role,
                                limit: 2000
                            }).then((result) => {
                                setLeads(result.leads || []);
                                setTotalLeadsCount(result.totalCount || 0);
                                setLoading(false);
                            });
                        }}
                        className="p-2.5 h-9 w-9 flex items-center justify-center bg-white/5 border border-white/5 rounded-lg text-white/20 hover:text-white hover:border-white/10 transition-all active:rotate-180"
                    >
                        <RefreshCcw size={12} />
                    </button>
                </div>
            </div>

            {/* MAIN CONTENT AREA */}
            <main className="flex-1 w-full overflow-hidden relative">
                {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-4">
                            <div className="h-12 w-12 border-2 border-red-500/20 border-t-red-600 rounded-full animate-spin" />
                            <p className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Sincronizando Radar...</p>
                        </div>
                    </div>
                ) : (
                    <div className="h-full relative px-2 sm:px-4">
                         <AnimatePresence mode="wait">
                            {viewMode === 'list' ? (
                                <motion.div 
                                    key="list"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    className="h-full overflow-y-auto custom-scrollbar pt-6 pb-20"
                                >
                                    <LeadListV2
                                        leads={displayLeads}
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
                                        role={role}
                                        consultants={consultants}
                                    />
                                </motion.div>
                            ) : (
                                <motion.div 
                                    key="kanban"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="h-full min-h-0 flex-1 relative"
                                >
                                    <KanbanBoardV2
                                        leads={displayLeads}
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
                            )}
                         </AnimatePresence>
                    </div>
                )}
            </main>

            {/* MODAL INTEGRATION */}
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
                isOpen={isNewLeadModalOpen}
                onClose={() => setIsNewLeadModalOpen(false)}
                onSuccess={(newLead) => {
                    setLeads(prev => [newLead, ...prev]);
                }}
                userName={userName}
                consultantId={consultantId || undefined}
            />

            {/* AESTHETIC SCAN LINE */}
            <div className="pointer-events-none fixed top-0 left-0 w-full h-[2px] bg-red-600/5 shadow-[0_0_15px_rgba(239,68,68,0.1)] z-[100] animate-scanline" />
        </div>
    );
}
