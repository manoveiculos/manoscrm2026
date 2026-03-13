'use client';

import { useState, useEffect } from 'react';
import { X, User, Lock, Save, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';

interface UserProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: any;
    role: string | null;
}

export const UserProfileModal = ({ isOpen, onClose, user, role }: UserProfileModalProps) => {
    const [fullName, setFullName] = useState(user?.user_metadata?.full_name || '');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        if (user?.user_metadata?.full_name) {
            setFullName(user.user_metadata.full_name);
        } else if (user?.email) {
            const fetchProfile = async () => {
                const { data } = await supabase
                    .from('consultants_manos_crm')
                    .select('name')
                    .eq('auth_id', user.id)
                    .maybeSingle();
                if (data?.name) setFullName(data.name);
            };
            fetchProfile();
        }
    }, [user, isOpen]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setMessage(null);

        try {
            // Update Password if provided
            if (newPassword) {
                if (newPassword !== confirmPassword) {
                    throw new Error('As senhas não coincidem');
                }
                if (newPassword.length < 6) {
                    throw new Error('A senha deve ter pelo menos 6 caracteres');
                }
                const { error: pwdError } = await supabase.auth.updateUser({
                    password: newPassword
                });
                if (pwdError) throw pwdError;
            }

            // Update Profile Name in Auth metadata
            const { error: authError } = await supabase.auth.updateUser({
                data: { full_name: fullName }
            });
            if (authError) throw authError;

            // Update Profile Name in consultants table
            const { error: dbError } = await supabase
                .from('consultants_manos_crm')
                .update({ name: fullName })
                .eq('auth_id', user.id);
            
            setMessage({ type: 'success', text: 'Dados atualizados com sucesso!' });
            setNewPassword('');
            setConfirmPassword('');
            
            setTimeout(() => {
                onClose();
                setMessage(null);
            }, 2000);

        } catch (error: any) {
            setMessage({ type: 'error', text: error.message || 'Erro ao atualizar dados' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    />
                    
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-md bg-[#0a0f18] border border-white/10 rounded-3xl shadow-2xl overflow-hidden"
                    >
                        <div className="p-6 md:p-8">
                            <div className="flex items-center justify-between mb-8">
                                <div>
                                    <h2 className="text-xl font-black text-white tracking-tight">Meus Dados</h2>
                                    <p className="text-xs text-white/40 font-bold uppercase tracking-widest mt-1">Configurações de Conta</p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="h-10 w-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-white/40 hover:text-white transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <form onSubmit={handleSave} className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Nome Completo</label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/20 group-focus-within:text-red-500 transition-colors">
                                            <User size={18} />
                                        </div>
                                        <input
                                            type="text"
                                            value={fullName}
                                            onChange={(e) => setFullName(e.target.value)}
                                            className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-white/20 focus:outline-none focus:border-red-500/50 focus:bg-white/[0.08] transition-all font-bold text-sm"
                                            placeholder="Seu nome completo"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-white/5 space-y-4">
                                    <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Alterar Senha (Opcional)</p>
                                    <div className="space-y-4">
                                        <div className="relative group">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/20 group-focus-within:text-red-500 transition-colors">
                                                <Lock size={18} />
                                            </div>
                                            <input
                                                type="password"
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-white/20 focus:outline-none focus:border-red-500/50 focus:bg-white/[0.08] transition-all font-bold text-sm"
                                                placeholder="Nova senha"
                                            />
                                        </div>
                                        <div className="relative group">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/20 group-focus-within:text-red-500 transition-colors">
                                                <Lock size={18} />
                                            </div>
                                            <input
                                                type="password"
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-white/20 focus:outline-none focus:border-red-500/50 focus:bg-white/[0.08] transition-all font-bold text-sm"
                                                placeholder="Confirmar nova senha"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {message && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={`p-4 rounded-2xl flex items-center gap-3 ${
                                            message.type === 'success' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'
                                        }`}
                                    >
                                        {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                                        <p className="text-xs font-bold">{message.text}</p>
                                    </motion.div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="w-full py-4 bg-gradient-to-r from-red-600 to-red-800 hover:from-red-500 hover:to-red-700 disabled:from-white/10 disabled:to-white/10 disabled:text-white/20 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-red-950/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                                >
                                    {isSaving ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <Save size={18} />
                                            Salvar Alterações
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
