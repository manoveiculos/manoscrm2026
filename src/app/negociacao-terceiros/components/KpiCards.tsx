'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { TrendingUp, Car, DollarSign, AlertCircle } from 'lucide-react';

export function KpiCards() {
    const [kpis, setKpis] = useState({
        totalNegocios: 0,
        lucroTotal: 0,
        ativos: 0,
        acertoPendente: 0
    });

    useEffect(() => {
        carregarKpis();
    }, []);

    const carregarKpis = async () => {
        try {
            const { data: negocios, error: errorNegocios } = await supabase
                .from('negociacao_terceiros')
                .select('*');

            if (errorNegocios) throw errorNegocios;

            const { data: caixa, error: errorCaixa } = await supabase
                .from('negociacao_terceiros_caixa')
                .select('*')
                .eq('status', 'Pendente');

            if (errorCaixa) throw errorCaixa;

            let lucro = 0;
            let ativosCount = 0;
            
            negocios?.forEach(n => {
                if (n.status === 'Finalizado') {
                    lucro += Number(n.lucro_liquido || 0);
                } else if (n.status !== 'Cancelado') {
                    ativosCount++;
                }
            });

            let acerto = 0;
            caixa?.forEach(c => {
                acerto += Number(c.valor || 0);
            });

            setKpis({
                totalNegocios: negocios?.length || 0,
                lucroTotal: lucro,
                ativos: ativosCount,
                acertoPendente: acerto
            });
        } catch (error) {
            console.error('Erro ao carregar KPIs:', error);
        }
    };

    const formatarMoeda = (valor: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(valor);
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#15151A] border border-white/5 p-6 rounded-2xl relative overflow-hidden group hover:border-red-500/30 transition-colors">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Car className="w-24 h-24" />
                </div>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                        <Car className="w-5 h-5" />
                    </div>
                    <span className="text-white/50 text-sm font-medium">Veículos Ativos</span>
                </div>
                <div className="text-3xl font-black text-white">{kpis.ativos}</div>
                <div className="text-xs text-white/30 mt-2">Em negociação/estoque</div>
            </div>

            <div className="bg-[#15151A] border border-white/5 p-6 rounded-2xl relative overflow-hidden group hover:border-red-500/30 transition-colors">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <TrendingUp className="w-24 h-24" />
                </div>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
                        <TrendingUp className="w-5 h-5" />
                    </div>
                    <span className="text-white/50 text-sm font-medium">Lucro Líquido (Realizado)</span>
                </div>
                <div className="text-3xl font-black text-white">{formatarMoeda(kpis.lucroTotal)}</div>
                <div className="text-xs text-white/30 mt-2">Negócios finalizados</div>
            </div>

            <div className="bg-[#15151A] border border-white/5 p-6 rounded-2xl relative overflow-hidden group hover:border-red-500/30 transition-colors">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <AlertCircle className="w-24 h-24" />
                </div>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400">
                        <AlertCircle className="w-5 h-5" />
                    </div>
                    <span className="text-white/50 text-sm font-medium">Acertos Pendentes</span>
                </div>
                <div className="text-3xl font-black text-white">{formatarMoeda(kpis.acertoPendente)}</div>
                <div className="text-xs text-white/30 mt-2">Aguardando liquidação</div>
            </div>

            <div className="bg-[#15151A] border border-white/5 p-6 rounded-2xl relative overflow-hidden group hover:border-red-500/30 transition-colors">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <DollarSign className="w-24 h-24" />
                </div>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
                        <DollarSign className="w-5 h-5" />
                    </div>
                    <span className="text-white/50 text-sm font-medium">Total de Negócios</span>
                </div>
                <div className="text-3xl font-black text-white">{kpis.totalNegocios}</div>
                <div className="text-xs text-white/30 mt-2">Histórico completo</div>
            </div>
        </div>
    );
}
