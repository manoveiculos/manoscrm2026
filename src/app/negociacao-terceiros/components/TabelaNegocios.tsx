'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { MoreHorizontal, Car, Tag } from 'lucide-react';

interface TabelaNegociosProps {
    onEdit?: (id: string) => void;
}

export function TabelaNegocios({ onEdit }: TabelaNegociosProps) {
    const [negocios, setNegocios] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        carregarNegocios();
    }, []);

    const carregarNegocios = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('negociacao_terceiros')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setNegocios(data || []);
        } catch (error) {
            console.error('Erro ao carregar negócios:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Finalizado': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            case 'Em Negociação': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
            case 'Cancelado': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
            case 'Vendido': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
            default: return 'bg-white/5 text-white/50 border-white/10';
        }
    };

    return (
        <div className="bg-[#15151A] border border-white/5 rounded-2xl overflow-hidden flex flex-col h-full shadow-2xl">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Car className="w-5 h-5 text-red-500" />
                        Lista de Negócios
                    </h2>
                    <p className="text-xs text-white/40 mt-1">Acompanhamento das parcerias e repasses.</p>
                </div>
            </div>
            
            <div className="overflow-x-auto flex-1">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-white/50 uppercase bg-[#0C0C0F]">
                        <tr>
                            <th className="px-6 py-4 font-medium">Veículo / Operação</th>
                            <th className="px-6 py-4 font-medium">Parceiro</th>
                            <th className="px-6 py-4 font-medium">Lucro Líquido</th>
                            <th className="px-6 py-4 font-medium">Status</th>
                            <th className="px-6 py-4 font-medium text-right">Ação</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-white/50">Carregando...</td>
                            </tr>
                        ) : negocios.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-white/50">Nenhum negócio encontrado.</td>
                            </tr>
                        ) : (
                            negocios.map((n) => (
                                <tr key={n.id} className="hover:bg-white/[0.02] transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-white">{n.veiculo_modelo || 'Veículo não informado'}</div>
                                        <div className="text-xs text-white/40 flex items-center gap-1 mt-1">
                                            <Tag className="w-3 h-3" /> {n.tipo_operacao}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-white/80">{n.terceiro_nome || 'N/A'}</td>
                                    <td className="px-6 py-4 font-medium text-emerald-400">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n.lucro_liquido || 0)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2.5 py-1 text-xs font-medium rounded-full border ${getStatusColor(n.status)}`}>
                                            {n.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button 
                                            onClick={() => onEdit && onEdit(n.id)}
                                            className="px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors text-xs font-medium"
                                        >
                                            Editar
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
