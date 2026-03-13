'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { dataService } from '@/lib/dataService';
import {
    adminUpdateUserEmail,
    adminUpdateUserPassword,
    adminDeleteUser
} from '@/app/actions/admin-auth';
import {
    Users,
    Shield,
    ShieldCheck,
    XCircle,
    CheckCircle2,
    Search,
    UserCheck,
    UserMinus,
    AlertCircle,
    Target,
    Zap,
    Mail,
    Key,
    Trash2,
    Save,
    X
} from 'lucide-react';

interface Consultant {
    id: string;
    auth_id: string;
    name: string;
    email: string;
    status: 'pending' | 'active' | 'blocked';
    role: 'admin' | 'consultant';
    created_at: string;
    leads_total_count?: number;
    sales_manos_crm?: { count: number }[];
}

export default function EquipePage() {
    const [consultants, setConsultants] = useState<Consultant[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Modal states
    const [editingEmail, setEditingEmail] = useState<{ id: string, auth_id: string, email: string } | null>(null);
    const [updatingPassword, setUpdatingPassword] = useState<{ id: string, auth_id: string, name: string } | null>(null);
    const [deletingUser, setDeletingUser] = useState<{ id: string, auth_id: string, name: string } | null>(null);
    
    const [modalInput, setModalInput] = useState('');
    const [isActionLoading, setIsActionLoading] = useState(false);

    const fetchEquipe = async () => {
        setLoading(true);
        try {
            const data = await dataService.getConsultantPerformance();
            setConsultants(data as any);
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

    const onUpdateEmail = async () => {
        if (!editingEmail || !modalInput) return;
        setIsActionLoading(true);
        const result = await adminUpdateUserEmail(editingEmail.auth_id, editingEmail.id, modalInput);
        setIsActionLoading(false);
        if (result.success) {
            setEditingEmail(null);
            setModalInput('');
            fetchEquipe();
        } else {
            alert('Erro: ' + result.error);
        }
    };

    const onUpdatePassword = async () => {
        if (!updatingPassword || !modalInput) return;
        setIsActionLoading(true);
        const result = await adminUpdateUserPassword(updatingPassword.auth_id, modalInput);
        setIsActionLoading(false);
        if (result.success) {
            setUpdatingPassword(null);
            setModalInput('');
            alert('Senha alterada com sucesso!');
        } else {
            alert('Erro: ' + result.error);
        }
    };

    const onDeleteUser = async () => {
        if (!deletingUser) return;
        setIsActionLoading(true);
        const result = await adminDeleteUser(deletingUser.auth_id, deletingUser.id);
        setIsActionLoading(false);
        if (result.success) {
            setDeletingUser(null);
            fetchEquipe();
        } else {
            alert('Erro: ' + result.error);
        }
    };

    const filteredConsultants = consultants.filter(c =>
        c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const pendingCount = consultants.filter(c => c.status === 'pending').length;

    return (
        <div className="space-y-10 animate-in fade-in duration-700">
            <header className="flex-col md:flex-row md:items-center justify-between gap-6">
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
                            className="glass-card rounded-[2.5rem] p-8 border border-white/5 flex-col gap-6 relative overflow-hidden group hover:border-red-500/30 transition-all shadow-2xl"
                        >
                            <div className="flex justify-between items-start">
                                <div className="h-16 w-16 rounded-[1.5rem] bg-white/5 flex items-center justify-center text-2xl font-black text-red-500 border border-white/10 group-hover:bg-red-500/5 transition-all">
                                    {consultant.name?.[0] || consultant.email?.[0]?.toUpperCase()}
                                </div>
                                <div className="flex-col items-end gap-2">
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

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Zap size={12} className="text-blue-500" />
                                        <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Leads</span>
                                    </div>
                                    <p className="text-2xl font-black text-white">{consultant.leads_total_count || 0}</p>
                                </div>
                                <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
                                    <div className="flex items-center gap-2 mb-1">
                                        <Target size={12} className="text-emerald-500" />
                                        <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Vendas</span>
                                    </div>
                                    <p className="text-2xl font-black text-white">{consultant.sales_manos_crm?.[0]?.count || 0}</p>
                                </div>
                            </div>

                            <div className="flex flex-col gap-4 pt-4 border-t border-white/5">
                                {/* Row 1: Status and Role */}
                                <div className="grid grid-cols-2 gap-3">
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

                                {/* Row 2: Advanced Powers */}
                                <div className="grid grid-cols-3 gap-2 pt-2">
                                    <button
                                        onClick={() => {
                                            setEditingEmail({ id: consultant.id, auth_id: consultant.auth_id, email: consultant.email });
                                            setModalInput(consultant.email);
                                        }}
                                        title="Alterar E-mail de Login"
                                        className="flex items-center justify-center py-3 bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white rounded-xl transition-all"
                                    >
                                        <Mail size={16} />
                                    </button>
                                    <button
                                        onClick={() => {
                                            setUpdatingPassword({ id: consultant.id, auth_id: consultant.auth_id, name: consultant.name });
                                            setModalInput('');
                                        }}
                                        title="Redefinir Senha"
                                        className="flex items-center justify-center py-3 bg-amber-600/10 hover:bg-amber-600 text-amber-500 hover:text-white rounded-xl transition-all"
                                    >
                                        <Key size={16} />
                                    </button>
                                    <button
                                        onClick={() => setDeletingUser({ id: consultant.id, auth_id: consultant.auth_id, name: consultant.name })}
                                        title="Excluir Usuário"
                                        className="flex items-center justify-center py-3 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white rounded-xl transition-all"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Modals */}
            <AnimatePresence>
                {(editingEmail || updatingPassword || deletingUser) && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => {
                                setEditingEmail(null);
                                setUpdatingPassword(null);
                                setDeletingUser(null);
                                setModalInput('');
                            }}
                            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        />
                        
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative w-full max-w-sm bg-[#0a0f18] border border-white/10 rounded-[2.5rem] p-8 shadow-2xl"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-black text-white">
                                    {editingEmail ? 'Alterar Login' : updatingPassword ? 'Nova Senha' : 'Excluir Usuário'}
                                </h3>
                                <button
                                    onClick={() => {
                                        setEditingEmail(null);
                                        setUpdatingPassword(null);
                                        setDeletingUser(null);
                                        setModalInput('');
                                    }}
                                    className="text-white/20 hover:text-white"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="space-y-6">
                                {deletingUser ? (
                                    <div className="space-y-4">
                                        <p className="text-sm text-white/60 font-medium">
                                            Tem certeza que deseja excluir **{deletingUser.name}**? Esta ação removerá o acesso e os dados do banco.
                                        </p>
                                        <button
                                            onClick={onDeleteUser}
                                            disabled={isActionLoading}
                                            className="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                        >
                                            {isActionLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Confirmar Exclusão'}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-white/30 uppercase tracking-widest ml-1">
                                                {editingEmail ? 'Novo E-mail' : 'Nova Senha'}
                                            </label>
                                            <input
                                                type={editingEmail ? 'email' : 'text'}
                                                value={modalInput}
                                                onChange={(e) => setModalInput(e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white font-bold focus:outline-none focus:border-red-500 transition-all"
                                                placeholder={editingEmail ? 'exemplo@email.com' : 'Mínimo 6 caracteres'}
                                            />
                                        </div>
                                        <button
                                            onClick={editingEmail ? onUpdateEmail : onUpdatePassword}
                                            disabled={isActionLoading || !modalInput}
                                            className="w-full py-4 bg-red-600 hover:bg-red-500 disabled:bg-white/5 disabled:text-white/10 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                        >
                                            {isActionLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (
                                                <>
                                                    <Save size={16} />
                                                    Salvar Alteração
                                                </>
                                            )}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {loading && (
                <div className="flex-col items-center justify-center py-20 gap-4 opacity-50">
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
