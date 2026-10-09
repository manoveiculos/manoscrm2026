'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Wallet, ArrowUpRight, ArrowDownRight, CheckCircle2, Trash2, Users, PiggyBank } from 'lucide-react';

export function PainelCaixaAcerto() {
    const [acertos, setAcertos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'fluxo' | 'comissoes'>('fluxo');

    useEffect(() => {
        carregarAcertos();
    }, []);

    const carregarAcertos = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('negociacao_terceiros_caixa')
                .select('*, negociacao_terceiros(veiculo_modelo)')
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) throw error;
            setAcertos(data || []);
        } catch (error) {
            console.error('Erro ao carregar acertos:', error);
        } finally {
            setLoading(false);
        }
    };

    const getIcon = (tipo: string) => {
        if (tipo === 'A Receber') return <ArrowUpRight className="w-4 h-4 text-emerald-400" />;
        if (tipo === 'A Pagar') return <ArrowDownRight className="w-4 h-4 text-rose-400" />;
        return <Wallet className="w-4 h-4 text-blue-400" />;
    };

    const toggleStatus = async (id: string, currentStatus: string) => {
        const novoStatus = currentStatus === 'Pendente' ? 'Pago' : 'Pendente';
        try {
            await supabase.from('negociacao_terceiros_caixa').update({ status: novoStatus }).eq('id', id);
            carregarAcertos(); // Reload
        } catch (e) {
            console.error(e);
        }
    };

    const deletarAcerto = async (id: string) => {
        if (!window.confirm('Tem certeza que deseja excluir este lançamento?')) return;
        try {
            await supabase.from('negociacao_terceiros_caixa').delete().eq('id', id);
            carregarAcertos(); // Reload
        } catch (e) { console.error(e); }
    };

    const fluxo = acertos.filter(a => a.tipo !== 'Acerto');
    const comissoes = acertos.filter(a => a.tipo === 'Acerto');

    const calcularResumo = (nome: string) => {
        const pagas = comissoes.filter(a => a.descricao.includes(nome) && a.status === 'Pago').reduce((acc, curr) => acc + curr.valor, 0);
        const pendentes = comissoes.filter(a => a.descricao.includes(nome) && a.status === 'Pendente').reduce((acc, curr) => acc + curr.valor, 0);
        return { pagas, pendentes };
    };

    const resumoAlexandre = calcularResumo('Alexandre');
    const resumoWilson = calcularResumo('Wilson');

    const renderItem = (a: any) => (
        <div key={a.id} className="p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors relative group">
            <button 
                onClick={() => deletarAcerto(a.id)}
                className="absolute top-3 right-3 p-1.5 bg-red-500/10 text-red-500 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                title="Excluir Lançamento"
            >
                <Trash2 className="w-3 h-3" />
            </button>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-md ${a.tipo === 'A Receber' ? 'bg-emerald-500/10' : a.tipo === 'A Pagar' ? 'bg-rose-500/10' : 'bg-blue-500/10'}`}>
                        {getIcon(a.tipo)}
                    </div>
                    <span className="text-sm font-bold text-white">{a.tipo}</span>
                </div>
                <span className="text-xs font-medium text-white/40 pr-8">{new Date(a.created_at).toLocaleDateString()}</span>
            </div>
            
            <div className="flex items-end justify-between mt-3">
                <div className="max-w-[60%]">
                    <div className="text-xs text-white/50 truncate">{a.negociacao_terceiros?.veiculo_modelo || 'Geral'}</div>
                    <div className="text-sm text-white/80 line-clamp-2">{a.descricao || a.pessoa || 'Acerto de contas'}</div>
                </div>
                <div className="text-right flex flex-col items-end">
                    <div className="text-lg font-black text-white">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(a.valor || 0)}
                    </div>
                    <button 
                        onClick={() => toggleStatus(a.id, a.status)}
                        className={`mt-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded transition-colors ${
                            a.status === 'Pendente' ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                        }`}
                    >
                        {a.status === 'Pendente' ? 'Marcar como Pago' : 'Pago ✓'}
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="bg-[#15151A] border border-white/5 rounded-2xl overflow-hidden flex flex-col shadow-2xl">
            <div className="p-5 border-b border-white/5">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-red-500" />
                    Caixa e Controle
                </h2>
                <div className="flex bg-[#0C0C0F] p-1 rounded-lg mt-4 border border-white/5">
                    <button onClick={() => setTab('fluxo')} className={`flex-1 py-1.5 text-xs font-bold rounded-md flex items-center justify-center gap-2 transition-colors ${tab === 'fluxo' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/80'}`}>
                        <PiggyBank className="w-3.5 h-3.5" /> Fluxo
                    </button>
                    <button onClick={() => setTab('comissoes')} className={`flex-1 py-1.5 text-xs font-bold rounded-md flex items-center justify-center gap-2 transition-colors ${tab === 'comissoes' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/80'}`}>
                        <Users className="w-3.5 h-3.5" /> Comissões
                    </button>
                </div>
            </div>
            
            <div className="p-4 space-y-3 overflow-y-auto max-h-[480px]">
                {loading ? (
                    <div className="text-center py-8 text-white/50 text-sm">Carregando acertos...</div>
                ) : acertos.length === 0 ? (
                    <div className="text-center py-8 text-white/50 text-sm flex flex-col items-center">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500/20 mb-2" />
                        Tudo em dia! Nenhum acerto pendente.
                    </div>
                ) : (
                    <>
                        {tab === 'comissoes' && comissoes.length > 0 && (
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
                                    <div className="text-xs font-bold text-blue-400 mb-2">Alexandre</div>
                                    <div className="text-[10px] text-white/50">Pago: <span className="text-emerald-400">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(resumoAlexandre.pagas)}</span></div>
                                    <div className="text-[10px] text-white/50">Pendente: <span className="text-amber-400">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(resumoAlexandre.pendentes)}</span></div>
                                </div>
                                <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20">
                                    <div className="text-xs font-bold text-purple-400 mb-2">Wilson</div>
                                    <div className="text-[10px] text-white/50">Pago: <span className="text-emerald-400">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(resumoWilson.pagas)}</span></div>
                                    <div className="text-[10px] text-white/50">Pendente: <span className="text-amber-400">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(resumoWilson.pendentes)}</span></div>
                                </div>
                            </div>
                        )}
                        {tab === 'fluxo' && (fluxo.length === 0 ? <div className="text-center py-4 text-white/50 text-sm">Nenhum fluxo.</div> : fluxo.map(renderItem))}
                        {tab === 'comissoes' && (comissoes.length === 0 ? <div className="text-center py-4 text-white/50 text-sm">Nenhuma comissão.</div> : comissoes.map(renderItem))}
                    </>
                )}
            </div>
            <div className="p-4 border-t border-white/5">
                <button className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white text-sm font-bold transition-colors">
                    Ver Todos os Lançamentos
                </button>
            </div>
        </div>
    );
}
