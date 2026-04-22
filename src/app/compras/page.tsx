'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    ShoppingBag, 
    Search, 
    Filter, 
    Plus, 
    TrendingUp, 
    Car,
    AlertCircle,
    LayoutGrid,
    List as ListIcon,
    RefreshCw
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { LeadCompra } from '@/lib/types/compra';
import { compraService } from '@/lib/services/compraService';
import { LeadEditModalCompra } from './components/LeadEditModalCompra';
import { LeadCardCompra } from './components/LeadCardCompra';

export default function ComprasPage() {
    const supabase = createClient();
    const [leads, setLeads] = useState<LeadCompra[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('todos');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [authorized, setAuthorized] = useState<boolean | null>(null);
    
    // Novas variáveis para edição
    const [selectedLead, setSelectedLead] = useState<LeadCompra | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    const loadLeads = async () => {
        const data = await compraService.getLeads(supabase);
        setLeads(data);
    };

    useEffect(() => {
        async function checkAccessAndLoad() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setAuthorized(false);
                setLoading(false);
                return;
            }

            const { data: consultant } = await supabase
                .from('consultants_manos_crm')
                .select('name, role')
                .eq('auth_id', user.id)
                .maybeSingle();

            const isAdmin = consultant?.role === 'admin' || user.email === 'alexandre_gorges@hotmail.com';
            const isFelipe = consultant?.name?.includes('Felipe Ledra');

            if (isAdmin || isFelipe) {
                setAuthorized(true);
                await loadLeads();
            } else {
                setAuthorized(false);
            }
            setLoading(false);
        }

        checkAccessAndLoad();
    }, []);

    const filteredLeads = leads
        .filter(l => {
            const matchesSearch = 
                (l.nome?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                (l.modelo?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                (l.marca?.toLowerCase() || '').includes(searchTerm.toLowerCase());
            
            const matchesStatus = statusFilter === 'todos' || l.status === statusFilter;
            
            return matchesSearch && matchesStatus;
        })
        .sort((a, b) => {
            // Regra 1: Data de criação (Mais recente sempre no topo)
            const dateA = new Date(a.criado_em).getTime();
            const dateB = new Date(b.criado_em).getTime();
            if (dateA !== dateB) return dateB - dateA;

            // Regra 2: Prioridade manual (se as datas forem iguais)
            if ((a.prioridade || 0) !== (b.prioridade || 0)) {
                return (b.prioridade || 0) - (a.prioridade || 0);
            }

            // Regra 3: Status 'perdido' sempre para o final
            if (a.status === 'perdido' && b.status !== 'perdido') return 1;
            if (a.status !== 'perdido' && b.status === 'perdido') return -1;

            return 0;
        });

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#0C0C0F]">
                <div className="h-10 w-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (authorized === false) {
        return (
            <div className="flex h-screen flex-col items-center justify-center bg-[#0C0C0F] text-center p-6">
                <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
                    <AlertCircle className="text-red-500" size={32} />
                </div>
                <h1 className="text-2xl font-black text-white uppercase tracking-tight mb-2">Acesso Restrito</h1>
                <p className="text-white/40 max-w-md">Esta área é exclusiva para a gerência de compras e usuários autorizados.</p>
                <button 
                    onClick={() => window.location.href = '/'}
                    className="mt-6 px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-white font-bold hover:bg-white/10 transition-all"
                >
                    Voltar para o Dashboard
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0C0C0F] flex flex-col pt-0 pb-20">
            {/* Header Area */}
            <header className="px-6 py-6 border-b border-white/[0.06] bg-[#0C0C0F] sticky top-0 z-40">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center shadow-[0_0_20px_rgba(185,28,28,0.3)]">
                            <ShoppingBag className="text-white" size={24} />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-white uppercase tracking-tight leading-none">
                                Central de <span className="text-red-500">Compras</span>
                            </h1>
                            <p className="text-[10px] text-white/30 font-bold uppercase tracking-[0.2em] mt-2">
                                Inteligência em Captação de Veículos
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {/* Status Filter */}
                        <select 
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-xs font-black text-white/60 uppercase tracking-widest focus:outline-none focus:border-red-500 transition-all cursor-pointer"
                        >
                            <option value="todos">Todos Status</option>
                            <option value="novo">Novos</option>
                            <option value="em_analise">Em Análise</option>
                            <option value="proposta_enviada">Proposta Enviada</option>
                            <option value="agendado">Agendado</option>
                            <option value="vistoria">Vistoria</option>
                            <option value="fechado">Fechado</option>
                            <option value="perdido">Perdido / Lixo</option>
                        </select>

                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-red-500 transition-colors" size={16} />
                            <input 
                                type="text" 
                                placeholder="Buscar lead, marca ou modelo..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="bg-white/[0.03] border border-white/[0.08] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-red-500/50 focus:bg-white/[0.05] transition-all w-64 lg:w-80"
                            />
                        </div>

                        <div className="flex bg-white/[0.03] p-1 rounded-xl border border-white/[0.06]">
                            <button 
                                onClick={() => setViewMode('grid')}
                                className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white/10 text-white shadow-sm' : 'text-white/30 hover:text-white/60'}`}
                            >
                                <LayoutGrid size={18} />
                            </button>
                            <button 
                                onClick={() => setViewMode('list')}
                                className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white/10 text-white shadow-sm' : 'text-white/30 hover:text-white/60'}`}
                            >
                                <ListIcon size={18} />
                            </button>
                        </div>

                        <button 
                            onClick={() => loadLeads()}
                            className="bg-white/5 hover:bg-white/10 border border-white/10 p-2.5 rounded-xl text-white/40 hover:text-white transition-all"
                        >
                            <RefreshCw size={18} />
                        </button>
                        
                        <button className="bg-red-600 hover:bg-red-500 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-red-900/20">
                            <Plus size={18} /> Novo Lead
                        </button>
                    </div>
                </div>

                {/* Tactical Stats */}
                <div className="flex items-center gap-6 mt-6 pt-6 border-t border-white/[0.04]">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Total</span>
                        <span className="text-xl font-black text-white tabular-nums">{leads.length}</span>
                    </div>
                    <div className="w-px h-8 bg-white/5" />
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Quentes 🔥</span>
                        <span className="text-xl font-black text-red-500 tabular-nums">
                            {leads.filter(l => l.prioridade === 1).length}
                        </span>
                    </div>
                    <div className="w-px h-8 bg-white/5" />
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Volume Captação</span>
                        <span className="text-xl font-black text-white/80 tabular-nums">
                            {(leads.filter(l => l.status !== 'perdido').reduce((acc, curr) => acc + (curr.valor_negociado || curr.valor_cliente || 0), 0) / 1000000).toFixed(1)}M
                        </span>
                    </div>
                </div>
            </header>

            {/* Content Area */}
            <main className="p-6">
                <div className={viewMode === 'grid' 
                    ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                    : "flex flex-col gap-4"
                }>
                    <AnimatePresence>
                        {filteredLeads.map((lead) => {
                            const isDuplicate = leads.filter(l => l.telefone === lead.telefone && l.id !== lead.id).length > 0;
                            return (
                                <LeadCardCompra 
                                    key={lead.id} 
                                    lead={lead} 
                                    isDuplicate={isDuplicate}
                                    onClick={() => {
                                        setSelectedLead(lead);
                                        setIsEditModalOpen(true);
                                    }} 
                                />
                            );
                        })}
                    </AnimatePresence>
                </div>

                {filteredLeads.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
                            <Search className="text-white/10" size={40} />
                        </div>
                        <h2 className="text-xl font-bold text-white/90">Nenhum lead encontrado</h2>
                        <p className="text-white/30 max-w-xs mt-2">Tente ajustar sua busca ou filtros para encontrar o que procura.</p>
                    </div>
                )}
            </main>

            {/* Edição de Lead */}
            {selectedLead && (
                <LeadEditModalCompra 
                    isOpen={isEditModalOpen}
                    onClose={() => setIsEditModalOpen(false)}
                    lead={selectedLead}
                    onUpdate={loadLeads}
                />
            )}
        </div>
    );
}
