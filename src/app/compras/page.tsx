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
import { LeadCardCompra } from './components/LeadCardCompra';

export default function ComprasPage() {
    const supabase = createClient();
    const [leads, setLeads] = useState<LeadCompra[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [authorized, setAuthorized] = useState<boolean | null>(null);

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
                const data = await compraService.getLeads(supabase);
                setLeads(data);
            } else {
                setAuthorized(false);
            }
            setLoading(false);
        }

        checkAccessAndLoad();
    }, []);

    const filteredLeads = leads.filter(l => 
        (l.nome?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (l.modelo?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (l.marca?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

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
        <div className="min-h-screen bg-[#0C0C0F] flex flex-col pt-0">
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

                    <div className="flex items-center gap-3">
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

                        <button className="bg-white/5 hover:bg-white/10 border border-white/10 p-2.5 rounded-xl text-white/40 hover:text-white transition-all">
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
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Oportunidades</span>
                        <span className="text-xl font-black text-emerald-500 tabular-nums">
                            {leads.filter(l => l.aceita_abaixo_fipe).length}
                        </span>
                    </div>
                    <div className="w-px h-8 bg-white/5" />
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">Volume Negocial</span>
                        <span className="text-xl font-black text-white/80 tabular-nums">
                            {(leads.reduce((acc, curr) => acc + (curr.valor_cliente || 0), 0) / 1000000).toFixed(1)}M
                        </span>
                    </div>
                </div>
            </header>

            {/* Content Area */}
            <main className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    <AnimatePresence>
                        {filteredLeads.map((lead) => (
                            <LeadCardCompra 
                                key={lead.id} 
                                lead={lead} 
                                onClick={() => {}} 
                            />
                        ))}
                    </AnimatePresence>
                </div>

                {filteredLeads.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-6">
                            <Search className="text-white/10" size={40} />
                        </div>
                        <h2 className="text-xl font-bold text-white/90">Nenhum lead encontrado</h2>
                        <p className="text-white/30 max-w-xs mt-2">Tente ajustar sua busca ou adicione um novo lead para começar.</p>
                    </div>
                )}
            </main>
        </div>
    );
}
