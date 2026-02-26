'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import {
    Users,
    Shield,
    ShieldCheck,
    XCircle,
    CheckCircle2,
    Search,
    UserCheck,
    UserMinus,
    AlertCircle
} from 'lucide-react';

interface Consultant {
    id: string;
    auth_id: string;
    name: string;
    email: string;
    status: 'pending' | 'active' | 'blocked';
    role: 'admin' | 'consultant';
    created_at: string;
}

export default function EquipePage() {
    const [consultants, setConsultants] = useState<Consultant[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchEquipe = async () => {
        setLoading(true);
        try {
            const { data, error: dbError } = await supabase
                .from('consultants_manos_crm')
                .select('*')
                .order('created_at', { ascending: false });

            if (dbError) throw dbError;
            setConsultants(data || []);
        } catch (err: unknown) {
            console.error("Erro ao buscar equipe:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEquipe();
    }, []);

    const handleUpdateStatus = async (id: string, newStatus: string) => {
        try {
            const { error: updateError } = await supabase
                .from('consultants_manos_crm')
                .update({ status: newStatus })
                .eq('id', id);

            if (updateError) throw updateError;
            fetchEquipe();
        } catch (err: unknown) {
            const error = err as Error;
            alert('Erro ao atualizar status: ' + error.message);
        }
    };

    const handleUpdateRole = async (id: string, newRole: string) => {
        try {
            const { error: updateError } = await supabase
                .from('consultants_manos_crm')
                .update({ role: newRole })
                .eq('id', id);

            if (updateError) throw updateError;
            fetchEquipe();
        } catch (err: unknown) {
            const error = err as Error;
            alert('Erro ao atualizar cargo: ' + error.message);
        }
    };

    const filteredConsultants = consultants.filter(c =>
        c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const pendingCount = consultants.filter(c => c.status === 'pending').length;

    return (
        <div className="space-y-10 animate-in fade-in duration-700">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-red-600 to-red-900 flex items-center justify-center text-white shadow-lg shadow-red-900/20">
                            <Users size={24} />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-white tracking-tight">Gerenciamento de Equipe</h1>
                            <p className="text-white/40 text-sm font-medium">Controle de acesso e aprovação de consultores</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative group">
                        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-red-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="Buscar consultor..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-white/5 border border-white/10 rounded-2xl py-3 pl-12 pr-6 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/50 w-full md:w-64 transition-all"
                        />
                    </div>
                </div>
            </header>

            {pendingCount > 0 && (
                <div className="p-6 rounded-[2rem] bg-amber-500/10 border border-amber-500/20 flex items-center justify-between group overflow-hidden relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-transparent -translate-x-full group-hover:translate-x-0 transition-transform duration-1000" />
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="h-12 w-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 border border-amber-500/20 shadow-inner">
                            <AlertCircle size={24} className="animate-pulse" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-white">Solicitações Pendentes</h3>
                            <p className="text-sm text-white/40 font-medium">Você tem {pendingCount} consultores aguardando aprovação para acessar o sistema.</p>
                        </div>
                    </div>
                    <div className="hidden md:block relative z-10">
                        <div className="px-5 py-2 rounded-xl bg-amber-500 text-black text-[10px] font-black uppercase tracking-widest shadow-xl">Ação Necessária</div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <AnimatePresence>
                    {filteredConsultants.map((consultant) => (
                        <motion.div
                            key={consultant.id}
                            layout
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="glass-card rounded-[2.5rem] p-8 border border-white/5 flex flex-col gap-6 relative overflow-hidden group hover:border-red-500/30 transition-all shadow-2xl"
                        >
                            <div className="flex justify-between items-start">
                                <div className="h-16 w-16 rounded-[1.5rem] bg-white/5 flex items-center justify-center text-2xl font-black text-red-500 border border-white/10 group-hover:bg-red-500/5 transition-all">
                                    {consultant.name?.[0] || consultant.email?.[0]?.toUpperCase()}
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border ${consultant.status === 'active' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                        consultant.status === 'pending' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                            'bg-red-500/10 text-red-500 border-red-500/20'
                                        }`}>
                                        {consultant.status === 'active' ? 'Ativo' : consultant.status === 'pending' ? 'Pendente' : 'Bloqueado'}
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[8px] font-black text-white/20 uppercase tracking-widest">
                                        {consultant.role === 'admin' ? <ShieldCheck size={10} className="text-red-500" /> : <Shield size={10} />}
                                        {consultant.role === 'admin' ? 'Administrador' : 'Consultor'}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-xl font-black text-white truncate">{consultant.name || 'Sem Nome'}</h3>
                                <p className="text-sm font-medium text-white/30 truncate italic">{consultant.email}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/5">
                                {consultant.status === 'pending' ? (
                                    <>
                                        <button
                                            onClick={() => handleUpdateStatus(consultant.id, 'active')}
                                            className="col-span-1 flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-600/20"
                                        >
                                            <UserCheck size={14} /> Aprovar
                                        </button>
                                        <button
                                            onClick={() => handleUpdateStatus(consultant.id, 'blocked')}
                                            className="col-span-1 flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                                        >
                                            <UserMinus size={14} /> Negar
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => handleUpdateStatus(consultant.id, consultant.status === 'active' ? 'blocked' : 'active')}
                                            className={`col-span-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${consultant.status === 'active' ? 'bg-white/5 hover:bg-red-600 shadow-none hover:shadow-red-600/20 text-white/40 hover:text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
                                                }`}
                                        >
                                            {consultant.status === 'active' ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
                                            {consultant.status === 'active' ? 'Bloquear' : 'Desbloquear'}
                                        </button>
                                        <button
                                            onClick={() => handleUpdateRole(consultant.id, consultant.role === 'admin' ? 'consultant' : 'admin')}
                                            className="col-span-1 flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                                        >
                                            {consultant.role === 'admin' ? <Shield size={14} /> : <ShieldCheck size={14} />}
                                            {consultant.role === 'admin' ? 'Tirar Admin' : 'Virar Admin'}
                                        </button>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {loading && (
                <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
                    <div className="h-10 w-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white">Sincronizando Equipe...</p>
                </div>
            )}

            {!loading && filteredConsultants.length === 0 && (
                <div className="py-20 text-center space-y-4">
                    <div className="h-20 w-20 bg-white/5 rounded-full flex items-center justify-center mx-auto border border-dashed border-white/10">
                        <Users size={32} className="text-white/10" />
                    </div>
                    <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">Nenhum consultor encontrado</p>
                </div>
            )}
        </div>
    );
}
