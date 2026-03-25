'use client';

import React, { useState, useEffect, Suspense } from 'react';
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
    List
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { dataService } from '@/lib/dataService';
import { Lead, Consultant, InventoryItem } from '@/lib/types';
import { LeadListV2 } from '../pipeline/components/LeadListV2';
import { LeadProfileModalV2 } from '../components/lead-profile/LeadProfileModalV2';
import { NewLeadModalV2 } from '../pipeline/components/NewLeadModalV2';
import { KanbanBoardV2 } from '../pipeline/components/KanbanBoardV2';
import { supabase } from '@/lib/supabase';
import { ALL_STATUS, normalizeStatus } from '@/constants/status';
import { calculateLeadScore } from '@/utils/calculateScore';

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
                <ArrowUpDown size={8} className={isOpen ? 'text-red-500' : 'text-white/20'} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div 
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="absolute top-full left-0 bg-[#0a0a0a] border border-white/10 rounded-lg shadow-[0_10px_40px_rgba(0,0,0,0.8)] py-1.5 z-[100] min-w-[180px] backdrop-blur-2xl"
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

export default function CentralLeadsV2() {
    return (
        <Suspense fallback={<div className="flex-1 flex items-center justify-center bg-[#03060b] text-white/20 font-black uppercase tracking-widest animate-pulse">Iniciando Radar Elíptico...</div>}>
            <LeadsContent />
        </Suspense>
    );
}

function LeadsContent() {
    const [leads, setLeads] = useState<Lead[]>([]);
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

    useEffect(() => {
        const loadInitialData = async () => {
            setLoading(true);
            try {
                const { data: { session } } = await supabase.auth.getSession();
                let currentConsultantId: string | null = null;
                let userRole: 'admin' | 'consultant' = 'consultant';

                if (session?.user) {
                    const isAdmin = session.user.email === 'alexandre_gorges@hotmail.com';
                    userRole = isAdmin ? 'admin' : 'consultant';
                    setRole(userRole);

                    const { data: profile } = await supabase
                        .from('consultants_manos_crm')
                        .select('id, name')
                        .eq('auth_id', session.user.id)
                        .maybeSingle();
                    
                    if (profile) {
                        setUserName(profile.name.split(' ')[0]);
                        if (!isAdmin) {
                            currentConsultantId = profile.id;
                            setConsultantId(profile.id);
                            setFilterConsultant(profile.id);
                        }
                    } else if (isAdmin) {
                        setUserName('Admin');
                    }
                }

                const [leadsData, consultantsData, inventoryData] = await Promise.all([
                    dataService.getLeads(currentConsultantId || undefined),
                    dataService.getConsultants(),
                    dataService.getInventory()
                ]);

                setLeads(leadsData || []);
                setConsultants(consultantsData || []);
                setInventory(inventoryData || []);
            } catch (error) {
                console.error("Error loading Central de Leads data:", error);
            } finally {
                setLoading(false);
            }
        };

        loadInitialData();
    }, []);

    const filteredLeads = leads
        .filter(lead => {
            const matchesSearch = 
                lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                lead.phone.includes(searchTerm) ||
                (lead.vehicle_interest && lead.vehicle_interest.toLowerCase().includes(searchTerm.toLowerCase()));
            
            const matchesConsultant = filterConsultant === 'all' || lead.assigned_consultant_id === filterConsultant;
            const matchesStatus = filterStatus === 'all' || normalizeStatus(lead.status) === filterStatus;
            const matchesInterest = filterInterest === 'all' || lead.vehicle_interest === filterInterest;
            const matchesOrigin = filterOrigin === 'all' || lead.source === filterOrigin;
            
            // Date Filter Logic
            const leadDate = new Date(lead.created_at);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const matchesDate = filterDate === 'all' || (
                filterDate === 'today' ? leadDate >= today :
                filterDate === '7days' ? leadDate >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) :
                filterDate === '30days' ? leadDate >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) :
                true
            );
            
            // Calc current score for filter
            const now = new Date();
            const createdAt = new Date(lead.created_at);
            const tempoFunilH = Math.max(0, (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60));
            const currentScore = calculateLeadScore({
                status: normalizeStatus(lead.status),
                tempoFunilHoras: tempoFunilH,
                totalInteracoes: 0,
                ultimaInteracaoH: tempoFunilH,
                temValorDefinido: !!lead.valor_investimento && lead.valor_investimento !== '0',
                temVeiculoInteresse: !!lead.vehicle_interest && lead.vehicle_interest !== '---'
            });

            const matchesScore = filterScore === 'all' || (
                filterScore === 'quente' ? currentScore >= 80 :
                filterScore === 'morno' ? currentScore >= 60 && currentScore < 80 :
                filterScore === 'frio' ? currentScore >= 30 && currentScore < 60 :
                filterScore === 'gelado' ? currentScore < 30 :
                true
            );

            return matchesSearch && matchesConsultant && matchesStatus && matchesInterest && matchesOrigin && matchesScore && matchesDate;
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const interests = Array.from(new Set(leads.map(l => l.vehicle_interest).filter(Boolean)));
    const origins = Array.from(new Set(leads.map(l => l.source).filter(Boolean)));

    return (
        <div className="flex flex-col h-screen w-full bg-[#03060b] overflow-hidden text-white font-inter">
            {/* HUD HEADER - ELITE OS STYLE */}
            <header className="shrink-0 h-16 border-b border-white/5 bg-[#050101]/80 backdrop-blur-xl flex items-center justify-between px-6 z-30 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
                <div className="flex items-center gap-5">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <Users size={14} className="text-red-600" />
                            <h1 className="text-sm font-black uppercase tracking-[0.3em] text-white/90">Central de <span className="text-red-500">Leads</span></h1>
                        </div>
                        <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mt-0.5">V2.5 // Elite Sales OS</p>
                    </div>

                    <div className="hidden sm:flex items-center gap-1">
                        <div className="h-6 w-[1px] bg-white/5 mr-3" />
                        <span className="text-xs font-black text-white/70 tabular-nums">{leads.length}</span>
                        <span className="text-[9px] text-white/25 uppercase ml-1">total</span>
                        <span className="w-px h-3 bg-white/10 mx-2" />
                        <span className="text-xs font-black text-red-500 tabular-nums">{filteredLeads.length}</span>
                        <span className="text-[9px] text-white/25 uppercase ml-1">filtrados</span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="relative group">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-red-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="BUSCAR..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-white/5 border border-white/5 rounded-xl py-2.5 pl-10 pr-4 text-[10px] font-black uppercase tracking-widest w-48 focus:w-64 lg:w-64 lg:focus:w-80 focus:bg-white/10 focus:border-red-500/30 outline-none transition-all placeholder:text-white/10"
                        />
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

            {/* QUICK FILTERS BAR - OPTIMIZED FOR 100% SCREEN */}
            <div className="shrink-0 min-h-14 border-b border-white/5 bg-[#03060b] flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-2 z-20">
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

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
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
                            dataService.getLeads().then((data: Lead[]) => {
                                setLeads(data || []);
                                setLoading(false);
                            });
                        }}
                        className="p-2 bg-white/5 border border-white/5 rounded-lg text-white/20 hover:text-white hover:border-white/10 transition-all active:rotate-180"
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
                    <div className="h-full relative overflow-hidden">
                         <AnimatePresence mode="wait">
                            {viewMode === 'list' ? (
                                <motion.div 
                                    key="list"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    className="h-full overflow-y-auto custom-scrollbar px-6 py-6 pb-20"
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
                            ) : (
                                <motion.div 
                                    key="kanban"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
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
                                        onStatusChange={async (leadId, newStatus) => {
                                            const { error } = await supabase
                                                .from('leads_master')
                                                .update({ status: newStatus })
                                                .eq('id', leadId);
                                            
                                            if (!error) {
                                                setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
                                            }
                                        }}
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
