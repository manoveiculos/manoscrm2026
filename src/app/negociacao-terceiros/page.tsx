'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { RefreshCw, Lock, ShieldCheck, Plus, Handshake } from 'lucide-react';
import { KpiCards } from './components/KpiCards';
import { TabelaNegocios } from './components/TabelaNegocios';
import { PainelCaixaAcerto } from './components/PainelCaixaAcerto';
import { ModalNovoNegocio } from './components/ModalNovoNegocio';

export default function NegociacaoTerceirosPage() {
    const router = useRouter();
    const [carregando, setCarregando] = useState(true);
    const [autorizado, setAutorizado] = useState<boolean | null>(null);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [modalAberto, setModalAberto] = useState(false);
    const [editandoId, setEditandoId] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const abrirModalEdicao = (id: string) => {
        setEditandoId(id);
        setModalAberto(true);
    };

    const abrirModalNovo = () => {
        setEditandoId(null);
        setModalAberto(true);
    };

    const verificarAcesso = async () => {
        setCarregando(true);
        try {
            const { data } = await supabase.auth.getSession();
            const email = data?.session?.user?.email || null;
            setUserEmail(email);

            if (email === 'alexandre_gorges@hotmail.com' || email === 'dultra49@gmail.com') {
                setAutorizado(true);
                // TODO: Load data
            } else {
                setAutorizado(false);
                setTimeout(() => {
                    router.push('/');
                }, 3000);
            }
        } catch (err) {
            console.error('Erro ao verificar acesso:', err);
            setAutorizado(false);
        } finally {
            setCarregando(false);
        }
    };

    useEffect(() => {
        verificarAcesso();
    }, []);

    if (carregando) {
        return (
            <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
                <div className="flex items-center gap-3 text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                    <span>Carregando Módulo Negociação de Terceiros...</span>
                </div>
            </div>
        );
    }

    if (autorizado === false) {
        return (
            <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
                    <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/20">
                        <Lock className="w-6 h-6" />
                    </div>
                    <h2 className="text-xl font-bold text-white">Acesso Negado</h2>
                    <p className="text-sm text-slate-400">
                        Este módulo é exclusivo para as parcerias entre <strong>Alexandre</strong> e <strong>Wilson</strong>.
                    </p>
                    <p className="text-xs text-slate-500">Redirecionando para o início...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0C0C0F] text-white p-4 md:p-8">
            <div className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
                <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-bold flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" /> Restrito: Alexandre & Wilson
                        </span>
                    </div>
                    <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-3">
                        <Handshake className="w-8 h-8 text-red-500" />
                        Negociação de Terceiros
                    </h1>
                    <p className="text-sm text-white/50 mt-1">
                        Gestão de negócios em parceria/sociedade com terceiros (Alexandre & Wilson).
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={verificarAcesso}
                        className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/70 hover:text-white transition-all shadow-md flex items-center gap-2 text-xs font-bold"
                    >
                        <RefreshCw className={`w-4 h-4 ${carregando ? 'animate-spin text-red-400' : ''}`} /> Atualizar
                    </button>

                    <button
                        onClick={abrirModalNovo}
                        className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs transition-all shadow-[0_0_20px_rgba(220,38,38,0.3)] flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" /> Novo Negócio
                    </button>
                </div>
            </div>

            <div className="max-w-7xl mx-auto space-y-8">
                <KpiCards key={`kpi-${refreshKey}`} />
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-8 h-[600px]">
                        <TabelaNegocios key={`tab-${refreshKey}`} onEdit={abrirModalEdicao} />
                    </div>
                    <div className="lg:col-span-1 space-y-8 h-[600px]">
                        <PainelCaixaAcerto key={`caixa-${refreshKey}`} />
                    </div>
                </div>
            </div>

            {modalAberto && (
                <ModalNovoNegocio 
                    negocioIdToEdit={editandoId}
                    onClose={() => setModalAberto(false)} 
                    onSuccess={() => {
                        setModalAberto(false);
                        setRefreshKey(prev => prev + 1);
                    }} 
                />
            )}
        </div>
    );
}
