'use client';

import { useState, useEffect } from 'react';
import { 
    Calculator, 
    Users, 
    Calendar, 
    FileText, 
    Search,
    ChevronDown,
    ChevronUp,
    Download,
    CheckCircle2,
    AlertCircle,
    TrendingUp,
    DollarSign
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface BillingData {
    consultant_id: string;
    consultant_name: string;
    total_consultations: number;
    success_count: number;
    total_cost: number;
    details: any[];
}

export default function BillingPage() {
    const [loading, setLoading] = useState(true);
    const [month, setMonth] = useState(new Date().getMonth());
    const [year, setYear] = useState(new Date().getFullYear());
    const [billingData, setBillingData] = useState<BillingData[]>([]);
    const [expandedConsultant, setExpandedConsultant] = useState<string | null>(null);
    const [stats, setStats] = useState({
        totalConsultations: 0,
        totalSuccess: 0,
        totalValue: 0
    });

    const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

    useEffect(() => {
        fetchBillingData();
    }, [month, year]);

    const fetchBillingData = async () => {
        setLoading(true);
        try {
            const startDate = new Date(year, month, 1).toISOString();
            const endDate = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

            const { data, error } = await supabase
                .from('audit_credit_consultations')
                .select('*, consultants_manos_crm(name)')
                .gte('created_at', startDate)
                .lte('created_at', endDate)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Agrupar por consultor
            const grouped: Record<string, BillingData> = {};
            let tConsults = 0;
            let tSuccess = 0;
            let tValue = 0;

            data?.forEach(item => {
                const cId = item.consultant_id;
                const cName = item.consultants_manos_crm?.name || 'Desconhecido';
                
                if (!grouped[cId]) {
                    grouped[cId] = {
                        consultant_id: cId,
                        consultant_name: cName,
                        total_consultations: 0,
                        success_count: 0,
                        total_cost: 0,
                        details: []
                    };
                }

                grouped[cId].total_consultations++;
                if (item.status_consulta === 'sucesso') {
                    grouped[cId].success_count++;
                    const cost = Number(item.cost) || 2.00;
                    grouped[cId].total_cost += cost;
                    tSuccess++;
                    tValue += cost;
                }
                grouped[cId].details.push(item);
                tConsults++;
            });

            setBillingData(Object.values(grouped).sort((a, b) => b.total_cost - a.total_cost));
            setStats({
                totalConsultations: tConsults,
                totalSuccess: tSuccess,
                totalValue: tValue
            });

        } catch (err) {
            console.error('Erro ao buscar cobrança:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0C0C0F] p-4 md:p-8 pt-20 md:pt-8">
            <div className="max-w-7xl mx-auto space-y-8">
                
                {/* Header e Filtros */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                            <ReceiptIcon className="text-red-500" size={32} />
                            Faturamento de Consultas
                        </h1>
                        <p className="text-white/40 mt-1 text-sm">Gestão financeira e faturamento mensal de consultas de crédito.</p>
                    </div>

                    <div className="flex items-center gap-3 bg-white/[0.03] border border-white/10 p-2 rounded-2xl">
                        <select 
                            value={month}
                            onChange={(e) => setMonth(Number(e.target.value))}
                            className="bg-transparent text-white text-sm font-bold border-none focus:ring-0 cursor-pointer px-4 py-2 hover:bg-white/5 rounded-xl transition-all"
                        >
                            {months.map((m, i) => <option key={m} value={i} className="bg-[#1A1A22]">{m}</option>)}
                        </select>
                        <div className="w-px h-4 bg-white/10" />
                        <select 
                            value={year}
                            onChange={(e) => setYear(Number(e.target.value))}
                            className="bg-transparent text-white text-sm font-bold border-none focus:ring-0 cursor-pointer px-4 py-2 hover:bg-white/5 rounded-xl transition-all"
                        >
                            {years.map(y => <option key={y} value={y} className="bg-[#1A1A22]">{y}</option>)}
                        </select>
                        <button 
                            onClick={fetchBillingData}
                            className="p-2.5 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-all shadow-lg shadow-red-600/20 active:scale-95"
                        >
                            <Search size={18} />
                        </button>
                    </div>
                </div>

                {/* Cards de Métricas */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white/[0.03] border border-white/[0.08] rounded-3xl p-6 relative overflow-hidden group">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-red-500/5 blur-3xl rounded-full" />
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Consultas Realizadas</span>
                            <Calculator size={18} className="text-white/20" />
                        </div>
                        <div className="text-4xl font-black text-white">{stats.totalConsultations}</div>
                        <div className="text-[11px] text-white/30 mt-2">Volume total processado no período</div>
                    </div>

                    <div className="bg-white/[0.03] border border-white/[0.08] rounded-3xl p-6 relative overflow-hidden group">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full" />
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-black text-emerald-500/40 uppercase tracking-[0.2em]">Consultas Faturáveis</span>
                            <TrendingUp size={18} className="text-emerald-500/20" />
                        </div>
                        <div className="text-4xl font-black text-emerald-500">{stats.totalSuccess}</div>
                        <div className="text-[11px] text-white/30 mt-2">Registros bem-sucedidos (status Sucesso)</div>
                    </div>

                    <div className="bg-red-600/10 border border-red-600/20 rounded-3xl p-6 relative overflow-hidden group">
                        <div className="absolute -top-10 -right-10 w-32 h-32 bg-red-600/10 blur-3xl rounded-full" />
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em]">Valor total a cobrar</span>
                            <DollarSign size={18} className="text-red-500" />
                        </div>
                        <div className="text-4xl font-black text-white">
                            R$ {stats.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-[11px] text-red-500/50 mt-2 font-bold tracking-tight italic">Referente a R$ 2,00 por CPF faturado</div>
                    </div>
                </div>

                {/* Listagem de Faturamento por Consultor */}
                <div className="bg-white/[0.02] border border-white/10 rounded-[32px] overflow-hidden">
                    <div className="p-6 border-b border-white/5 flex items-center justify-between">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <Users size={20} className="text-white/20" />
                            Fechamento por Consultor
                        </h2>
                        <button className="flex items-center gap-2 text-[10px] font-black text-white/40 hover:text-white uppercase tracking-widest transition-all">
                            <Download size={14} />
                            Exportar CSV
                        </button>
                    </div>

                    <div className="divide-y divide-white/5">
                        {loading ? (
                            <div className="p-20 flex flex-col items-center justify-center gap-4 text-white/20">
                                <TrendingUp className="animate-pulse" size={48} />
                                <span className="text-xs font-bold uppercase tracking-widest">Calculando faturamento...</span>
                            </div>
                        ) : billingData.length === 0 ? (
                            <div className="p-20 flex flex-col items-center justify-center gap-4 text-white/20">
                                <AlertCircle size={48} />
                                <span className="text-xs font-bold uppercase tracking-widest">Nenhuma consulta registrada neste período.</span>
                            </div>
                        ) : (
                            billingData.map(item => (
                                <div key={item.consultant_id} className="transition-all hover:bg-white/[0.02]">
                                    <div 
                                        className="p-6 flex items-center justify-between cursor-pointer"
                                        onClick={() => setExpandedConsultant(expandedConsultant === item.consultant_id ? null : item.consultant_id)}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="h-12 w-12 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center text-lg font-black text-white">
                                                {item.consultant_name[0]}
                                            </div>
                                            <div>
                                                <div className="text-white font-bold">{item.consultant_name}</div>
                                                <div className="text-white/30 text-[10px] uppercase tracking-widest font-bold">
                                                    {item.total_consultations} consultas ({item.success_count} faturáveis)
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-8">
                                            <div className="text-right">
                                                <div className="text-xl font-black text-white">
                                                    R$ {item.total_cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </div>
                                                <div className="text-[9px] text-emerald-500 font-black uppercase tracking-widest">Para cobrança</div>
                                            </div>
                                            {expandedConsultant === item.consultant_id ? <ChevronUp className="text-white/20" /> : <ChevronDown className="text-white/20" />}
                                        </div>
                                    </div>

                                    {/* Extrato Detalhado */}
                                    {expandedConsultant === item.consultant_id && (
                                        <div className="px-6 pb-6 pt-2">
                                            <div className="bg-black/40 rounded-3xl border border-white/5 overflow-hidden">
                                                <table className="w-full text-[11px] text-left">
                                                    <thead>
                                                        <tr className="bg-white/[0.02] text-white/20 font-black uppercase tracking-widest border-b border-white/5">
                                                            <th className="px-6 py-4">Data</th>
                                                            <th className="px-6 py-4">CPF Consultado</th>
                                                            <th className="px-6 py-4">Lead</th>
                                                            <th className="px-6 py-4">Status</th>
                                                            <th className="px-6 py-4 text-right">Valor</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-white/5">
                                                        {item.details.map((detail, idx) => (
                                                            <tr key={idx} className="text-white/60 hover:text-white transition-colors group">
                                                                <td className="px-6 py-4 font-medium">
                                                                    {format(new Date(detail.created_at), 'dd MMM, HH:mm', { locale: ptBR })}
                                                                </td>
                                                                <td className="px-6 py-4 font-mono tracking-tighter">
                                                                    {detail.cpf_consultado.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <div className="flex flex-col">
                                                                        <span className="font-bold">ID: {detail.lead_id.split('_').pop()}</span>
                                                                        <span className="text-[9px] text-white/20">Ref: Auditoria Interna</span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4">
                                                                    <div className={`flex items-center gap-1.5 ${detail.status_consulta === 'sucesso' ? 'text-emerald-500' : 'text-red-500/40'}`}>
                                                                        <div className={`h-1 w-1 rounded-full ${detail.status_consulta === 'sucesso' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500/40'}`} />
                                                                        <span className="font-bold uppercase tracking-widest text-[9px]">{detail.status_consulta}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-4 text-right font-black text-white/40 group-hover:text-white transition-all">
                                                                    R$ {Number(detail.cost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Info adicional */}
                <div className="flex items-center gap-3 p-6 bg-red-600/5 border border-red-600/10 rounded-3xl">
                    <AlertCircle size={20} className="text-red-500 shrink-0" />
                    <p className="text-xs text-white/50 leading-relaxed">
                        <strong className="text-red-500">Nota Fiscal e Recebimento:</strong> Este relatório serve apenas como extrato para conferência interna. As cobranças reais são geradas mensalmente com base nos registros de sucesso confirmados pelo provedor de score. Consultas duplicadas em um curto intervalo de tempo são automaticamente deduplicadas.
                    </p>
                </div>

            </div>
        </div>
    );
}

function ReceiptIcon({ size, className }: { size?: number, className?: string }) {
    return (
        <svg 
            width={size || 24} 
            height={size || 24} 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className={className}
        >
            <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" />
            <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
            <path d="M12 17.5v-11" />
        </svg>
    );
}
