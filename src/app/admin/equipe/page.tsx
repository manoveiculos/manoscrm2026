'use client';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Users, 
    UserPlus, 
    Mail, 
    Key, 
    Trash2, 
    ShieldCheck, 
    RefreshCw, 
    Search,
    UserCircle2,
    CheckCircle2,
    XCircle,
    AlertCircle,
    ChevronRight,
    ArrowLeft
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getConsultantPerformance } from '@/lib/services/analyticsService';
import { adminUpdateUserEmail, adminUpdateUserPassword, adminDeleteUser } from '@/app/actions/admin-auth';
import { ConsultantDashboard } from '@/components/ConsultantDashboard';

interface Consultant {
    id: string; // Consultant DB ID
    auth_id: string; // Supabase Auth UID
    name: string;
    email: string;
    role: string;
    is_active: boolean;
    performance_score: number;
    leads_total_count: number;
    last_lead_assigned_at: string;
}

export default function TeamManagementPage() {
    const supabase = createClient();
    const [consultants, setConsultants] = useState<Consultant[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedConsultant, setSelectedConsultant] = useState<Consultant | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);
    
    // Modal states
    const [showEditModal, setShowEditModal] = useState(false);
    const [editMode, setEditMode] = useState<'email' | 'password' | 'delete' | null>(null);
    const [newEmail, setNewEmail] = useState('');
    const [newPass, setNewPass] = useState('');
    const [confirmPass, setConfirmPass] = useState('');
    const [showPerformanceModal, setShowPerformanceModal] = useState(false);
    const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const fetchData = async () => {
        setLoading(true);
        try {
            const data = await getConsultantPerformance();
            setConsultants(data as Consultant[]);
        } catch (err) {
            console.error('Erro ao buscar equipe:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const filteredConsultants = consultants.filter(c => 
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleAction = async () => {
        if (!selectedConsultant || !editMode) return;
        setIsUpdating(true);
        setStatusMsg(null);

        try {
            let result;
            if (editMode === 'email') {
                if (!newEmail.includes('@')) throw new Error('E-mail inválido');
                result = await adminUpdateUserEmail(selectedConsultant.auth_id, selectedConsultant.id, newEmail);
            } else if (editMode === 'password') {
                if (newPass.length < 6) throw new Error('Senha deve ter ao menos 6 caracteres');
                if (newPass !== confirmPass) throw new Error('As senhas não coincidem');
                result = await adminUpdateUserPassword(selectedConsultant.auth_id, newPass);
            } else if (editMode === 'delete') {
                result = await adminDeleteUser(selectedConsultant.auth_id, selectedConsultant.id);
            }

            if (result?.success) {
                setStatusMsg({ type: 'success', text: result.message || 'Operação realizada com sucesso!' });
                if (editMode === 'delete') {
                    setConsultants(prev => prev.filter(c => c.id !== selectedConsultant.id));
                    setTimeout(() => setShowEditModal(false), 2000);
                } else {
                    setTimeout(() => setShowEditModal(false), 1500);
                    fetchData();
                }
            } else {
                throw new Error(result?.error || 'Erro desconhecido');
            }
        } catch (err: any) {
            setStatusMsg({ type: 'error', text: err.message });
        } finally {
            setIsUpdating(false);
        }
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0 }
    };

    return (
        <div className="min-h-screen bg-[#03060b] text-white pb-24">
            {/* HUD HEADER */}
            <header className="border-b border-white/5 bg-[#050101]/80 backdrop-blur-xl flex flex-wrap items-center justify-between gap-3 px-6 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.5)] mb-6">
                {/* Left: identity + stats */}
                <div className="flex items-center gap-5">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                            <ShieldCheck size={14} className="text-red-600" />
                            <h1 className="text-sm font-black uppercase tracking-[0.3em] text-white/90">
                                Gestão de <span className="text-red-500">Equipe</span>
                            </h1>
                        </div>
                        <p className="text-[10px] font-black text-white/20 uppercase tracking-widest mt-0.5">V2.5 // Admin Panel</p>
                    </div>

                    <div className="hidden sm:flex items-center gap-1">
                        <div className="h-6 w-[1px] bg-white/5 mr-3" />
                        <span className="text-xs font-black text-white/70 tabular-nums">{consultants.length}</span>
                        <span className="text-[9px] text-white/25 uppercase ml-1">consultores</span>
                        <span className="w-px h-3 bg-white/10 mx-2" />
                        <span className="text-xs font-black text-emerald-400 tabular-nums">{consultants.filter(c => c.is_active).length}</span>
                        <span className="text-[9px] text-white/25 uppercase ml-1">ativos</span>
                    </div>
                </div>

                {/* Right: search + refresh */}
                <div className="flex items-center gap-2">
                    <div className="relative group/s">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 group-focus-within/s:text-red-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="BUSCAR..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-white/5 border border-white/5 rounded-xl py-2 pl-9 pr-4 text-[10px] font-black uppercase tracking-widest w-36 focus:w-52 focus:bg-white/10 focus:border-red-500/30 outline-none transition-all placeholder:text-white/10"
                        />
                    </div>
                    <button
                        onClick={fetchData}
                        className="h-9 w-9 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-white/40 hover:bg-white/10 hover:text-white transition-all"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin text-red-500' : ''} />
                    </button>
                </div>
            </header>

            <div className="px-6">

            {/* Grid de Consultores */}
            {loading && consultants.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 opacity-20">
                    <RefreshCw className="animate-spin mb-4" size={32} />
                    <p>Sincronizando equipe...</p>
                </div>
            ) : (
                <motion.div 
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"
                >
                    {filteredConsultants.map(c => (
                        <motion.div 
                            key={c.id} 
                            variants={itemVariants}
                            onClick={() => {
                                setSelectedConsultant(c);
                                setShowPerformanceModal(true);
                            }}
                            className={`group relative bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 hover:bg-white/[0.05] hover:border-red-500/30 transition-all cursor-pointer ${!c.is_active ? 'opacity-60 grayscale' : ''}`}
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-red-600 to-red-900 border border-white/10 flex items-center justify-center text-lg font-bold shadow-lg shadow-red-900/20 group-hover:scale-105 transition-transform">
                                        {c.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-white/90 group-hover:text-white transition-colors">{c.name}</h3>
                                        <p className="text-[10px] text-white/30 uppercase tracking-wider font-semibold">{c.role || 'Consultor'}</p>
                                    </div>
                                </div>
                                <div className={`px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider ${c.is_active ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-white/10 text-white/30 border border-white/10'}`}>
                                    {c.is_active ? 'Ativo' : 'Inativo'}
                                </div>
                            </div>

                            <div className="space-y-3 mb-6">
                                <div className="flex items-center gap-2 text-xs text-white/40">
                                    <Mail size={12} className="shrink-0" />
                                    <span className="truncate">{c.email}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-3 mt-4">
                                    <div className="bg-black/40 rounded-xl p-3 border border-white/[0.03]">
                                        <p className="text-[10px] text-white/20 uppercase font-bold mb-1">Leads Ativos</p>
                                        <p className="text-xl font-bold text-white/80">{c.leads_total_count || 0}</p>
                                    </div>
                                    <div className="bg-black/40 rounded-xl p-3 border border-white/[0.03]">
                                        <p className="text-[10px] text-white/20 uppercase font-bold mb-1">Performance</p>
                                        <p className="text-xl font-bold text-red-500">{c.performance_score || 0}%</p>
                                    </div>
                                </div>
                            </div>

                            {/* Actions Overlay */}
                            <div className="flex items-center gap-2 pt-4 border-t border-white/[0.05]">
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedConsultant(c);
                                        setEditMode('email');
                                        setNewEmail(c.email);
                                        setShowEditModal(true);
                                    }}
                                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-[11px] font-semibold transition-all"
                                >
                                    <Mail size={13} />
                                    E-mail
                                </button>
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedConsultant(c);
                                        setEditMode('password');
                                        setNewPass('');
                                        setConfirmPass('');
                                        setShowEditModal(true);
                                    }}
                                    className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-[11px] font-semibold transition-all"
                                >
                                    <Key size={13} />
                                    Senha
                                </button>
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedConsultant(c);
                                        setEditMode('delete');
                                        setShowEditModal(true);
                                    }}
                                    className="p-2 rounded-lg bg-red-500/5 hover:bg-red-500/20 border border-red-500/10 text-red-400/60 hover:text-red-400 transition-all"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>
            )}

            {/* Modal de Ação Admin */}
            <AnimatePresence>
                {showEditModal && selectedConsultant && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => !isUpdating && setShowEditModal(false)}
                            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="relative w-full max-w-md bg-[#18181b] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
                        >
                            <div className="p-8">
                                <div className="flex items-center gap-4 mb-8">
                                    <div className={`p-3 rounded-2xl ${
                                        editMode === 'delete' ? 'bg-red-500/10 text-red-500' : 'bg-red-500 text-white'
                                    }`}>
                                        {editMode === 'email' && <Mail size={24} />}
                                        {editMode === 'password' && <Key size={24} />}
                                        {editMode === 'delete' && <Trash2 size={24} />}
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold">
                                            {editMode === 'email' && 'Alterar E-mail'}
                                            {editMode === 'password' && 'Resetar Senha'}
                                            {editMode === 'delete' && 'Remover Consultor'}
                                        </h2>
                                        <p className="text-white/40 text-sm">{selectedConsultant.name}</p>
                                    </div>
                                </div>

                                {statusMsg ? (
                                    <div className={`p-4 rounded-xl flex items-start gap-3 mb-6 ${
                                        statusMsg.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                    }`}>
                                        {statusMsg.type === 'success' ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> : <AlertCircle size={18} className="shrink-0 mt-0.5" />}
                                        <p className="text-sm font-medium">{statusMsg.text}</p>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {editMode === 'email' && (
                                            <div className="space-y-2">
                                                <label className="text-xs font-bold text-white/30 uppercase tracking-widest pl-1">Novo E-mail corporativo</label>
                                                <input 
                                                    type="email" 
                                                    value={newEmail}
                                                    onChange={e => setNewEmail(e.target.value)}
                                                    className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 focus:outline-none focus:border-red-500/50 transition-all"
                                                    placeholder="exemplo@manosveiculos.com"
                                                />
                                            </div>
                                        )}

                                        {editMode === 'password' && (
                                            <div className="space-y-5">
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold text-white/30 uppercase tracking-widest pl-1">Nova Senha temporária</label>
                                                    <input 
                                                        type="password" 
                                                        value={newPass}
                                                        onChange={e => setNewPass(e.target.value)}
                                                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 focus:outline-none focus:border-red-500/50 transition-all font-mono"
                                                        placeholder="••••••••"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-bold text-white/30 uppercase tracking-widest pl-1">Confirmar Senha</label>
                                                    <input 
                                                        type="password" 
                                                        value={confirmPass}
                                                        onChange={e => setConfirmPass(e.target.value)}
                                                        className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 focus:outline-none focus:border-red-500/50 transition-all font-mono"
                                                        placeholder="••••••••"
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {editMode === 'delete' && (
                                            <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-2xl space-y-4">
                                                <div className="flex items-center gap-3 text-red-400">
                                                    <AlertCircle size={20} />
                                                    <p className="font-bold text-sm uppercase tracking-wider">Atenção Crítica</p>
                                                </div>
                                                <p className="text-sm text-red-200/60 leading-relaxed">
                                                    Esta ação excluirá o usuário permanentemente do **Supabase Auth** e do **CRM**. Os leads vinculados ficarão órfãos.
                                                </p>
                                            </div>
                                        )}

                                        <div className="flex gap-3 pt-4">
                                            <button 
                                                onClick={() => setShowEditModal(false)}
                                                disabled={isUpdating}
                                                className="flex-1 py-4 px-6 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 font-bold transition-all disabled:opacity-50"
                                            >
                                                Cancelar
                                            </button>
                                            <button 
                                                onClick={handleAction}
                                                disabled={isUpdating}
                                                className={`flex-1 py-4 px-6 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-xl ${
                                                    editMode === 'delete' 
                                                        ? 'bg-red-600 hover:bg-red-500 shadow-red-900/20' 
                                                        : 'bg-white text-black hover:bg-white/90 shadow-white/5'
                                                } disabled:opacity-50`}
                                            >
                                                {isUpdating ? <RefreshCw size={18} className="animate-spin" /> : 'Confirmar'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Modal de Performance do Consultor (Para Admin) */}
            <AnimatePresence>
                {showPerformanceModal && selectedConsultant && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowPerformanceModal(false)}
                            className="absolute inset-0 bg-black/90 backdrop-blur-md"
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.98, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.98, y: 10 }}
                            className="relative w-full max-w-6xl max-h-[90vh] bg-[#0a0a0c] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col"
                        >
                            <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/[0.02]">
                                <div className="flex items-center gap-4">
                                    <div className="h-10 w-10 rounded-xl bg-red-500 flex items-center justify-center text-white font-black">
                                        {selectedConsultant.name[0]}
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold uppercase tracking-tight">{selectedConsultant.name}</h2>
                                        <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">{selectedConsultant.email}</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => setShowPerformanceModal(false)}
                                    className="h-10 w-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-all"
                                >
                                    <XCircle size={20} className="text-white/40" />
                                </button>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto p-6 sm:p-10 custom-scrollbar">
                                <ConsultantDashboard 
                                    consultantId={selectedConsultant.id} 
                                    consultantName={selectedConsultant.name} 
                                />
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            </div>
        </div>
    );
}
