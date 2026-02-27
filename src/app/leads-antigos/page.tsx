'use client';

import React, { useEffect, useState } from 'react';
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
    Phone
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { dataService } from '@/lib/dataService';
import { DistributedLead } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';

type Category = 'all' | 'hot' | 'warm' | 'cold';

export default function OldLeadsPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [leads, setLeads] = useState<DistributedLead[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeCategory, setActiveCategory] = useState<Category>('all');
    const [isClassifying, setIsClassifying] = useState(false);
    const [isDistributing, setIsDistributing] = useState(false);
    const [role, setRole] = useState<string | null>(null);
    const [userName, setUserName] = useState<string | null>(null);

    useEffect(() => {
        async function initialize() {
            setLoading(true);
            try {
                // Get Role and User Name
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user) {
                    if (session.user.email === 'alexandre_gorges@hotmail.com') {
                        setRole('admin');
                    } else {
                        const { data: consultant } = await supabase
                            .from('consultants_manos_crm')
                            .select('role, name')
                            .eq('auth_id', session.user.id)
                            .maybeSingle();
                        if (consultant) {
                            setRole(consultant.role);
                            setUserName(consultant.name);
                        }
                    }
                }

                // Load Leads
                const data = await dataService.getDistributedLeads();

                // If consultant, filter to show only their distributed leads
                if (session?.user && session.user.email !== 'alexandre_gorges@hotmail.com') {
                    const filtered = (data || []).filter(l => l.enviado && l.vendedor === (userName || session.user.user_metadata?.name));
                    setLeads(filtered);
                } else {
                    setLeads(data || []);
                }
            } catch (err) {
                console.error("Error initializing page:", err);
            } finally {
                setLoading(false);
            }
        }
        initialize();
    }, []);

    const filteredLeads = leads.filter(lead => {
        const matchesSearch =
            lead.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            lead.interesse?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            lead.vendedor?.toLowerCase().includes(searchTerm.toLowerCase());

        if (activeCategory === 'all') return matchesSearch;
        return matchesSearch && lead.ai_classification === activeCategory;
    });

    const counts = {
        all: leads.length,
        hot: leads.filter(l => l.ai_classification === 'hot').length,
        warm: leads.filter(l => l.ai_classification === 'warm').length,
        cold: leads.filter(l => l.ai_classification === 'cold').length,
    };

    const handleWhatsApp = (phone: string) => {
        const cleanPhone = phone.replace(/\D/g, '');
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
                    const leadId = batch[j].id;
                    const result = results[j];

                    if (!result) continue;

                    const index = newLeads.findIndex(l => l.id === leadId);
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
                        await dataService.updateDistributedLeadAI(leadId, {
                            ai_classification: result.classification,
                            ai_reason: result.reasoning,
                            nivel_interesse: result.nivel_interesse,
                            momento_compra: result.momento_compra,
                            resumo_consultor: result.resumo_consultor,
                            proxima_acao: result.proxima_acao
                        });
                    } catch (e) {
                        console.error("Error updating lead AI", leadId, e);
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

        // Leads available for distribution: Qualified but not sent
        const toDistribute = leads.filter(l => l.ai_classification && !l.enviado);
        if (toDistribute.length === 0) {
            alert("Não há leads novos qualificados para distribuir.");
            return;
        }

        const confirmResult = confirm(`Deseja distribuir ${toDistribute.length} leads entre os consultores ativos?`);
        if (!confirmResult) return;

        setIsDistributing(true);
        try {
            const consultants = await dataService.getConsultants();
            const activeConsultants = consultants.filter(c => c.is_active).map(c => c.name);

            if (activeConsultants.length === 0) {
                throw new Error("Não há consultores ativos para receber os leads.");
            }

            const ids = toDistribute.map(l => l.id);
            await dataService.distributeOldLeads(ids, activeConsultants);

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

    if (loading) {
        return (
            <div className="flex h-[60vh] items-center justify-center">
                <div className="h-12 w-12 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    // Bloqueia acesso para não-admins APENAS se não houver leads distribuídos para eles
    if (role !== 'admin' && leads.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-[70vh] text-center space-y-8 animate-in fade-in zoom-in duration-700">
                <div className="relative group">
                    <div className="absolute inset-0 bg-red-600/20 blur-[80px] rounded-full group-hover:bg-red-600/30 transition-all duration-500" />
                    <div className="relative bg-[#0a0f18] p-8 rounded-[3rem] border border-white/5 shadow-2xl">
                        <History size={100} className="text-red-500 animate-pulse" strokeWidth={1} />
                    </div>
                    <div className="absolute -bottom-4 -right-4 bg-red-600 p-4 rounded-2xl shadow-xl shadow-red-900/40 rotate-12">
                        <User size={24} className="text-white" />
                    </div>
                </div>

                <div className="space-y-4 max-w-xl relative z-10">
                    <h1 className="text-6xl font-black text-white tracking-tighter uppercase font-outfit">
                        Aguardando <span className="text-red-600 italic">Leads</span>
                    </h1>
                    <p className="text-white/40 font-medium text-lg leading-relaxed">
                        Olá {userName || 'Consultor'}! No momento você não possui leads do arquivo distribuídos para você.
                    </p>
                    <div className="flex items-center justify-center gap-4">
                        <p className="text-red-500/80 font-black text-[11px] uppercase tracking-[0.3em] bg-red-500/5 py-2 px-4 rounded-full border border-red-500/10 w-fit">
                            Fique atento às notificações
                        </p>
                    </div>
                </div>

                <div className="flex flex-col items-center gap-2 pt-8">
                    <div className="flex items-center gap-3 px-6 py-4 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-md">
                        <ClockIcon size={20} className="text-red-500" />
                        <span className="text-[12px] font-black text-white/80 uppercase tracking-widest leading-none">Acesso Restrito a Gerentes</span>
                    </div>
                    <p className="text-[10px] text-white/20 font-medium italic">Seu perfil: Consultor Manos Veículos</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-10 pb-20 max-w-[1600px] mx-auto px-4">
            <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <h1 className="text-5xl font-black tracking-tighter text-white font-outfit">
                            Leads <span className="text-red-600">Antigos</span>
                        </h1>
                        <div className="bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-full">
                            <span className="text-[10px] font-black text-red-500 uppercase tracking-widest leading-none">Arquivo</span>
                        </div>
                    </div>
                    <p className="text-white/40 font-medium italic">Base de dados histórica do sistema de distribuição.</p>
                </div>

                <div className="flex flex-col md:flex-row items-center gap-4">
                    {role === 'admin' && (
                        <>
                            {leads.some(l => !l.ai_classification) ? (
                                <button
                                    onClick={runBulkClassification}
                                    disabled={isClassifying}
                                    className={`px-6 py-3.5 rounded-2xl border transition-all flex items-center gap-3 font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl ${isClassifying
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
                            ) : leads.some(l => !l.enviado) && (
                                <button
                                    onClick={handleDistribute}
                                    disabled={isDistributing}
                                    className={`px-6 py-3.5 rounded-2xl border transition-all flex items-center gap-3 font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl ${isDistributing
                                        ? 'bg-white/5 border-white/5 text-white/20 cursor-wait'
                                        : 'bg-blue-500/10 border-blue-500/20 text-blue-500 hover:bg-blue-500 hover:text-white hover:border-blue-500 shadow-blue-500/10 active:scale-95'
                                        }`}
                                >
                                    {isDistributing ? (
                                        <div className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <Copy size={16} />
                                    )}
                                    {isDistributing ? 'DISTRIBUINDO...' : 'DISTRIBUIR AOS CONSULTORES'}
                                </button>
                            )}
                        </>
                    )}

                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-red-500 transition-colors" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar no arquivo..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-12 pr-6 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:bg-white/10 transition-all w-full md:w-80 font-medium"
                        />
                    </div>
                </div>
            </header>

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
                                layoutId="active-tab"
                                className="absolute inset-0 bg-white/5 border-b-2 border-red-500"
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            />
                        )}
                    </button>
                ))}
            </div>

            <div className="flex flex-col gap-6">
                <AnimatePresence mode="popLayout">
                    {filteredLeads.map((lead) => (
                        <motion.div
                            key={lead.id}
                            layout
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="glass-card rounded-[2.5rem] border border-white/5 overflow-hidden flex flex-col md:flex-row min-h-[180px] hover:border-red-500/30 transition-all group relative bg-[#050608]/80 backdrop-blur-xl"
                        >
                            {/* Status and Interest Level Badge */}
                            {(lead.ai_classification || lead.nivel_interesse) && (
                                <div className="absolute top-6 right-8 z-20 flex items-center gap-3">
                                    {lead.nivel_interesse && (
                                        <div className="flex items-center gap-2 bg-purple-500/10 backdrop-blur-md px-4 py-2 rounded-2xl border border-purple-500/20">
                                            <Sparkles size={12} className="text-purple-400" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">
                                                {lead.nivel_interesse}
                                            </span>
                                        </div>
                                    )}
                                    {lead.ai_classification && (
                                        <div className={`flex items-center gap-2 backdrop-blur-md px-4 py-2 rounded-2xl border ${lead.ai_classification === 'hot' ? 'bg-red-500/10 border-red-500/20' :
                                            lead.ai_classification === 'warm' ? 'bg-amber-500/10 border-amber-500/20' :
                                                'bg-blue-500/10 border-blue-500/20'
                                            }`}>
                                            {lead.ai_classification === 'hot' && <Flame size={12} className="text-red-500" />}
                                            {lead.ai_classification === 'warm' && <Thermometer size={12} className="text-amber-500" />}
                                            {lead.ai_classification === 'cold' && <Snowflake size={12} className="text-blue-400" />}
                                            <span className={`text-[10px] font-black uppercase tracking-widest ${lead.ai_classification === 'hot' ? 'text-red-500' :
                                                lead.ai_classification === 'warm' ? 'text-amber-500' :
                                                    'text-blue-400'
                                                }`}>
                                                {lead.ai_classification === 'hot' ? 'Quente' : lead.ai_classification === 'warm' ? 'Morno' : 'Frio'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Glow Effect */}
                            <div className="absolute inset-0 bg-gradient-to-r from-red-600/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                            {/* Column 1: Identity & Action */}
                            <div className="w-full md:w-[300px] p-8 border-r border-white/5 flex flex-col justify-between relative z-10">
                                <div className="space-y-2">
                                    <h3 className="text-2xl font-black text-white tracking-tight truncate group-hover:text-red-500 transition-colors">
                                        {lead.nome}
                                    </h3>
                                    <div className="flex items-center gap-3 text-white/40">
                                        <div className="bg-white/5 p-1.5 rounded-lg border border-white/5">
                                            <MessageSquare size={14} className="text-red-500" />
                                        </div>
                                        <span className="text-sm font-bold tracking-wider">{lead.telefone}</span>
                                    </div>
                                </div>

                                <button
                                    onClick={() => handleWhatsApp(lead.telefone)}
                                    className="mt-6 w-full bg-red-600 hover:bg-red-500 text-white py-4 rounded-2xl flex items-center justify-center gap-3 transition-all font-black text-[10px] uppercase tracking-[0.2em] shadow-lg shadow-red-600/20 active:scale-95"
                                >
                                    <MessageSquare size={16} fill="white" />
                                    CONTATO WHATSAPP
                                </button>
                            </div>

                            {/* Column 2: Details */}
                            <div className="flex-1 p-8 border-r border-white/5 grid grid-cols-1 gap-6 relative z-10">
                                <div className="space-y-6">
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <MapPin size={14} className="text-white/20" />
                                            <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">LOCALIDADE</span>
                                        </div>
                                        <p className="text-sm font-bold text-white/80">
                                            {lead.cidade || 'Não informada'}
                                        </p>
                                    </div>

                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <Car size={14} className="text-white/20" />
                                            <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">INTERESSE</span>
                                        </div>
                                        <p className="text-sm font-bold text-white/80 line-clamp-2">
                                            {lead.interesse || 'N/A'}
                                        </p>
                                    </div>

                                    {lead.troca && (
                                        <div className="pt-2">
                                            <div className="flex items-center gap-2 mb-2">
                                                <RefreshCw size={14} className="text-emerald-500/50" />
                                                <span className="text-[10px] font-black text-emerald-500/50 uppercase tracking-[0.2em]">CARRO NA TROCA</span>
                                            </div>
                                            <p className="text-sm font-bold text-emerald-500 line-clamp-1">
                                                {lead.troca}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Column 3: AI Analysis (Unified Panel) */}
                            <div className="flex-[2] p-8 border-r border-white/5 flex flex-col relative z-10 bg-white/[0.01]">
                                <div className="flex items-center gap-2 mb-6">
                                    <Sparkles size={16} className="text-red-500/50" />
                                    <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">ANÁLISE ESTRATÉGICA IA</span>
                                </div>
                                <div className="space-y-6 flex-1">
                                    {/* Executive Summary */}
                                    <div className="p-5 rounded-3xl bg-red-600/10 border border-red-500/20">
                                        <p className="text-[9px] font-black text-red-500 uppercase tracking-widest mb-1 italic">Resumo do Consultor</p>
                                        <p className="text-[11px] font-bold text-white/80 leading-relaxed">
                                            {lead.resumo_consultor || lead.resumo || 'Nenhuma observação automática registrada para este lead.'}
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-blue-500/5 p-4 rounded-2xl border border-blue-500/10">
                                            <span className="text-[9px] font-black uppercase text-blue-500/40 tracking-wider block mb-1">Momento</span>
                                            <span className="text-xs font-black text-white uppercase">{lead.momento_compra || 'Pesquisa'}</span>
                                        </div>
                                        {lead.ai_reason && (
                                            <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                                <span className="text-[9px] font-black uppercase text-white/20 tracking-wider block mb-1">Score IA</span>
                                                <span className="text-xs font-black text-white uppercase">Analisado</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Next Action */}
                                    <div className="bg-emerald-500/5 p-5 rounded-3xl border border-emerald-500/10 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <Zap size={12} className="text-emerald-500" />
                                            <span className="text-[9px] font-black uppercase text-emerald-500/40 tracking-wider italic">Próxima Ação Sugerida</span>
                                        </div>
                                        <p className="text-[11px] font-black text-white leading-relaxed">
                                            {lead.proxima_acao || 'Retomar contato para entender interesse atual.'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Column 4: Seller & Date */}
                            <div className="w-full md:w-[240px] p-8 bg-white/[0.02] flex flex-col justify-between relative z-10">
                                <div>
                                    <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] block mb-5">CONSULTOR RESP.</span>
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center text-white font-black text-sm shadow-xl shadow-red-900/40">
                                            {lead.vendedor?.[0] || 'U'}
                                        </div>
                                        <div className="overflow-hidden">
                                            <p className="text-sm font-black text-white truncate">{lead.vendedor || 'Padrão'}</p>
                                            <p className="text-[9px] font-bold text-red-500 uppercase tracking-tighter">Manos Veículos</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-6 mt-6 border-t border-white/5">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Clock size={12} className="text-white/20" />
                                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">DATA DE REGISTRO</span>
                                    </div>
                                    <p className="text-xs font-bold text-white/60">
                                        {formatDistanceToNow(new Date(lead.criado_em), { locale: ptBR, addSuffix: true })}
                                    </p>
                                    <p className="text-[9px] text-white/20 font-medium mt-1 uppercase tracking-widest">
                                        {new Date(lead.criado_em).toLocaleDateString('pt-BR')}
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

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
        </div>
    );
}
