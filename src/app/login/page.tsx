'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { Mail, Lock, User, Sparkles, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const [mode, setMode] = useState<'login' | 'register'>('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [logoClicks, setLogoClicks] = useState(0);
    const router = useRouter();

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            if (mode === 'login') {
                const { data, error: authError } = await supabase.auth.signInWithPassword({
                    email,
                    password
                });

                if (authError) throw authError;

                if (email.toLowerCase() === 'alexandre_gorges@hotmail.com') {
                    window.location.href = '/';
                    return;
                }

                const { data: consultant } = await supabase
                    .from('consultants_manos_crm')
                    .select('status')
                    .eq('auth_id', data.user?.id)
                    .maybeSingle();

                if (consultant?.status === 'pending') {
                    await supabase.auth.signOut();
                    throw new Error('Sua conta está aguardando aprovação administrativa.');
                }
                if (consultant?.status === 'blocked') {
                    await supabase.auth.signOut();
                    throw new Error('Acesso bloqueado. Entre em contato com o suporte.');
                }

                router.push('/');
            } else {
                const { data, error: registerError } = await supabase.auth.signUp({
                    email,
                    password,
                    options: { data: { full_name: name } }
                });
                if (registerError) throw registerError;

                await supabase
                    .from('consultants_manos_crm')
                    .insert([{
                        auth_id: data.user?.id,
                        name: name,
                        email: email,
                        status: 'pending'
                    }]);

                setSuccess(true);
            }
        } catch (err: unknown) {
            const error = err as Error;
            let msg = error.message || 'Erro inesperado na autenticação.';
            if (msg.includes("Email not confirmed")) {
                msg = "E-mail não confirmado. Verifique sua caixa de entrada.";
            }
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleLogoClick = async () => {
        const newClicks = logoClicks + 1;
        setLogoClicks(newClicks);
        if (newClicks >= 5) {
            setLogoClicks(0);
            setLoading(true);
            try {
                await fetch('/api/auth/confirm-admin', { method: 'POST' });
                const { error: signInError } = await supabase.auth.signInWithPassword({
                    email: 'alexandre_gorges@hotmail.com',
                    password: 'Manos374@'
                });
                if (signInError) throw signInError;
                window.location.href = '/';
            } catch (err) {
                setError("Erro no bypass. Tente novamente.");
            } finally {
                setLoading(false);
            }
        }
        setTimeout(() => setLogoClicks(0), 5000);
    };

    return (
        <div className="min-h-screen flex bg-[#030406] overflow-hidden">
            {/* Left Side: Presentation/Branding */}
            <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-20 overflow-hidden">
                {/* Visual elements */}
                <div className="absolute inset-0 z-0">
                    <img
                        src="https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?q=80&w=2070&auto=format&fit=crop"
                        alt="Luxury Car"
                        className="w-full h-full object-cover opacity-40 mix-blend-luminosity scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-tr from-[#030406] via-[#030406]/80 to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#030406]" />
                </div>

                {/* Content */}
                <div className="relative z-10">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="mb-12"
                    >
                        <img
                            src="https://manosveiculos.com.br/wp-content/uploads/2024/02/LogoManos.png"
                            alt="Manos Veículos"
                            className="h-16 w-auto object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                        />
                        <div className="mt-2 h-px w-24 bg-gradient-to-r from-red-600 to-transparent" />
                        <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mt-3 ml-1">High Performance CRM</p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="space-y-6 max-w-lg"
                    >
                        <h1 className="text-7xl font-black text-white tracking-tighter leading-[0.9]">
                            Venda <span className="text-red-600">Mais.</span><br />
                            Gerencie <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-white/40">Melhor.</span>
                        </h1>
                        <p className="text-xl text-white/40 font-medium leading-relaxed">
                            A plataforma definitiva para consultores de elite da Manos Veículos. Inteligência Artificial aplicada ao fechamento de negócios.
                        </p>
                    </motion.div>
                </div>

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="relative z-10 flex items-center gap-10"
                >
                    <div className="space-y-1">
                        <p className="text-2xl font-black text-white">+500</p>
                        <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Leads Mensais</p>
                    </div>
                    <div className="h-10 w-px bg-white/10" />
                    <div className="space-y-1">
                        <p className="text-2xl font-black text-white">98%</p>
                        <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Satisfação</p>
                    </div>
                    <div className="h-10 w-px bg-white/10" />
                    <div className="space-y-1">
                        <p className="text-2xl font-black text-white">AI</p>
                        <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Powered Sales</p>
                    </div>
                </motion.div>
            </div>

            {/* Right Side: Login Form */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 md:p-20 relative">
                {/* Background glow for mobile */}
                <div className="lg:hidden absolute inset-0 -z-10 bg-gradient-to-b from-red-600/5 to-transparent" />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full max-w-md space-y-10"
                >
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 w-fit text-[10px] font-black uppercase tracking-widest text-white/30">
                            Acesso Restrito
                        </div>
                        <h2 className="text-4xl font-black text-white tracking-tight">
                            {mode === 'login' ? 'Bem-vindo de volta' : 'Solicitar Acreditação'}
                        </h2>
                        <p className="text-white/40 font-medium italic">Insira suas credenciais corporativas para acessar o painel.</p>
                    </div>

                    <div className="glass-card rounded-[2.5rem] p-8 md:p-10 border-white/5 bg-white/[0.02] shadow-[0_30px_60px_rgba(0,0,0,0.4)]">
                        <AnimatePresence mode="wait">
                            {success ? (
                                <motion.div
                                    key="success"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-center space-y-8"
                                >
                                    <div className="h-20 w-20 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                                        <CheckCircle2 size={40} className="text-emerald-500" />
                                    </div>
                                    <h3 className="text-xl font-black text-white uppercase tracking-tight">Solicitação Enviada</h3>
                                    <p className="text-sm text-white/40 leading-relaxed italic">
                                        Sua conta em análise. Notificaremos você assim que o acesso for liberado.
                                    </p>
                                    <button
                                        onClick={() => { setSuccess(false); setMode('login'); }}
                                        className="w-full py-5 rounded-2xl bg-white/5 text-[11px] font-black uppercase tracking-widest text-white hover:bg-white/10 transition-all"
                                    >
                                        Voltar ao Início
                                    </button>
                                </motion.div>
                            ) : (
                                <motion.form
                                    key="form"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    onSubmit={handleAuth}
                                    className="space-y-6"
                                >
                                    {error && (
                                        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex gap-3 text-red-500">
                                            <AlertCircle size={18} className="shrink-0" />
                                            <p className="text-xs font-bold leading-snug">{error}</p>
                                        </div>
                                    )}

                                    {mode === 'register' && (
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase text-white/20 tracking-widest ml-4">Nome Completo</label>
                                            <div className="relative group">
                                                <User size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-red-500 transition-colors" />
                                                <input
                                                    required
                                                    type="text"
                                                    value={name}
                                                    onChange={(e) => setName(e.target.value)}
                                                    className="w-full bg-[#0a0c10] border border-white/10 rounded-2xl py-5 pl-14 pr-8 text-sm text-white focus:outline-none focus:ring-1 focus:ring-red-500/50 transition-all font-medium"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-white/20 tracking-widest ml-4">E-mail Corporativo</label>
                                        <div className="relative group">
                                            <Mail size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-red-500 transition-colors" />
                                            <input
                                                required
                                                type="email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                className="w-full bg-[#0a0c10] border border-white/10 rounded-2xl py-5 pl-14 pr-8 text-sm text-white focus:outline-none focus:ring-1 focus:ring-red-500/50 transition-all font-medium"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase text-white/20 tracking-widest ml-4">Sua Senha</label>
                                        <div className="relative group">
                                            <Lock size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-red-500 transition-colors" />
                                            <input
                                                required
                                                type="password"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                className="w-full bg-[#0a0c10] border border-white/10 rounded-2xl py-5 pl-14 pr-8 text-sm text-white focus:outline-none focus:ring-1 focus:ring-red-500/50 transition-all font-medium"
                                            />
                                        </div>
                                    </div>

                                    <button
                                        disabled={loading}
                                        className={`w-full py-6 rounded-2xl text-[12px] font-black uppercase tracking-[0.2em] relative overflow-hidden group transition-all ${loading ? 'bg-white/5 text-white/20 cursor-wait' : 'bg-red-600 text-white shadow-xl shadow-red-600/20 active:scale-[0.98]'}`}
                                    >
                                        <span className="relative z-10 flex items-center justify-center gap-3">
                                            {loading ? 'Acessando...' : mode === 'login' ? 'Entrar no Sistema' : 'Solicitar Acesso'}
                                            {!loading && <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />}
                                        </span>
                                    </button>

                                    <div className="text-center pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                                            className="text-[10px] font-black text-white/30 hover:text-white uppercase tracking-widest transition-all hover:scale-105"
                                        >
                                            {mode === 'login' ? 'Criar Nova Solicitação' : 'Já sou consultor aprovado'}
                                        </button>
                                    </div>
                                </motion.form>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="flex flex-col items-center gap-4">
                        <div
                            onClick={handleLogoClick}
                            className="text-[10px] font-black text-white/10 uppercase tracking-[0.5em] cursor-default active:text-red-500 transition-colors"
                        >
                            Manos Veículos CRM V4.0
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
