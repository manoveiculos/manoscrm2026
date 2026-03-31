'use client';
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/services/supabaseClients';
import { 
    CreditCard, 
    Calendar, 
    User, 
    Search, 
    Download, 
    TrendingUp, 
    AlertCircle, 
    LayoutDashboard,
    Filter,
    BarChart3,
    ArrowRight
} from 'lucide-react';

export default function CreditReportPage() {
    const [logs, setLogs] = useState<any[]>([]);
    const [consultants, setConsultants] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        consultantId: 'all',
        searchTerm: '',
        startDate: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0]
    });

    useEffect(() => {
        const loadInitialData = async () => {
            const { data: cons } = await supabase.from('consultants_manos_crm').select('id, name');
            setConsultants(cons || []);
            fetchLogs();
        };
        loadInitialData();
    }, []);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('audit_credit_consultations')
                .select('*, consultants_manos_crm(name)')
                .order('created_at', { ascending: false });

            if (filters.consultantId !== 'all') {
                query = query.eq('consultant_id', filters.consultantId);
            }

            if (filters.startDate) {
                query = query.gte('created_at', `${filters.startDate}T00:00:00`);
            }

            if (filters.endDate) {
                query = query.lte('created_at', `${filters.endDate}T23:59:59`);
            }
            if (filters.searchTerm) {
                const term = filters.searchTerm.trim();
                query = query.or(`cpf_consultado.ilike.%${term}%,lead_id.ilike.%${term}%`);
            }

            const { data, error } = await query;
            if (error) throw error;
            setLogs(data || []);
        } catch (err) {
            console.error("Erro ao carregar auditoria:", err);
        } finally {
            setLoading(false);
        }
    };

    const stats = {
        total: logs.length,
        sucesso: logs.filter(l => l.status_consulta === 'sucesso').length,
        falha: logs.filter(l => l.status_consulta === 'falha').length,
        custoTotal: logs.reduce((acc, current) => acc + (Number(current.cost) || 0), 0)
    };

    return (
        <div className="min-h-screen bg-[#0C0C0F] text-white p-8">
            {/* Header */}
            <div className="max-w-7xl mx-auto space-y-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6">
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-2xl bg-red-600/10 border border-red-600/20 flex items-center justify-center">
                            <CreditCard className="text-red-500" size={24} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black tracking-tight">Relatório de Crédito</h1>
                            <p className="text-white/40 text-sm">Auditoria e faturamento de consultas de score.</p>
                        </div>
                    </div>
                    
                    <button 
                        onClick={() => window.print()}
                        className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold hover:bg-white/10 transition-all"
                    >
                        <Download size={14} />
                        EXPORTAR PDF
                    </button>
                </div>

                {/* Cards de Métricas */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Total Consultas</span>
                            <LayoutDashboard size={14} className="text-white/20" />
                        </div>
                        <div className="text-3xl font-black">{stats.total}</div>
                    </div>
                    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-emerald-500/40 uppercase tracking-widest">Com Sucesso</span>
                            <TrendingUp size={14} className="text-emerald-500/20" />
                        </div>
                        <div className="text-3xl font-black text-emerald-500">{stats.sucesso}</div>
                    </div>
                    <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-red-500/40 uppercase tracking-widest">Falhas/Erros</span>
                            <AlertCircle size={14} className="text-red-500/20" />
                        </div>
                        <div className="text-3xl font-black text-red-500/60">{stats.falha}</div>
                    </div>
                    <div className="bg-red-600/5 border border-red-600/10 rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Custo Total de Cobrança</span>
                            <BarChart3 size={14} className="text-red-500/40" />
                        </div>
                        <div className="text-3xl font-black text-red-500">R$ {stats.custoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        <p className="text-[9px] text-white/20 mt-1">* Baseado em R$ 2,00 por consulta ativa</p>
                    </div>
                </div>

                {/* Filtros */}
                <div className="bg-[#141419] border border-white/[0.05] rounded-3xl p-6 shadow-2xl flex flex-wrap items-end gap-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest flex items-center gap-2">
                            <User size={12} /> Consultor
                        </label>
                        <select 
                            value={filters.consultantId}
                            onChange={(e) => setFilters({...filters, consultantId: e.target.value})}
                            className="bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/20"
                        >
                            <option value="all">Todos os Consultores</option>
                            {consultants.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>

                    <div className="space-y-2 flex-1">
                        <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest flex items-center gap-2">
                            <Search size={12} /> ID ou CPF
                        </label>
                        <input 
                            type="text" 
                            placeholder="Buscar por ID ou CPF..."
                            value={filters.searchTerm}
                            onChange={(e) => setFilters({...filters, searchTerm: e.target.value})}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/20"
                        />
                    </div>
                    
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest flex items-center gap-2">
                            <Calendar size={12} /> Início
                        </label>
                        <input 
                            type="date" 
                            value={filters.startDate}
                            onChange={(e) => setFilters({...filters, startDate: e.target.value})}
                            className="bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/20"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest flex items-center gap-2">
                            <Calendar size={12} /> Fim
                        </label>
                        <input 
                            type="date" 
                            value={filters.endDate}
                            onChange={(e) => setFilters({...filters, endDate: e.target.value})}
                            className="bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500/20"
                        />
                    </div>

                    <button 
                        onClick={fetchLogs}
                        className="h-[42px] px-6 bg-red-600 rounded-xl text-xs font-black flex items-center gap-2 hover:bg-red-700 transition-all shadow-lg shadow-red-600/20"
                    >
                        <Filter size={14} />
                        FILTRAR RESULTADOS
                    </button>
                </div>

                {/* Tabela de Resultados */}
                <div className="bg-[#141419] border border-white/[0.05] rounded-3xl overflow-hidden shadow-2xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-white/[0.02] border-b border-white/[0.05]">
                                    <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">Data/Hora</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">Consultor</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">CPF Consultado</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">Score Original</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">Custo</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest">Status</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-white/40 uppercase tracking-widest text-right">Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.03]">
                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-white/20 italic">
                                            Carregando auditoria...
                                        </td>
                                    </tr>
                                ) : logs.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-white/20 italic">
                                            Nenhum registro encontrado no período selecionado.
                                        </td>
                                    </tr>
                                ) : logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-white/[0.02] transition-all group">
                                        <td className="px-6 py-4">
                                            <div className="text-xs text-white/80 font-medium">
                                                {new Date(log.created_at).toLocaleDateString('pt-BR')}
                                            </div>
                                            <div className="text-[10px] text-white/30">
                                                {new Date(log.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-xs font-semibold text-white/90">
                                                {log.consultants_manos_crm?.name || '—'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-xs font-mono text-white/50 tracking-wider">
                                                {log.cpf_consultado.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm font-black text-white/80">
                                                {log.score_original || '—'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-xs font-bold text-white/40">
                                                R$ {Number(log.cost || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                                                log.status_consulta === 'sucesso' 
                                                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' 
                                                : 'bg-red-500/10 border-red-500/20 text-red-500'
                                            }`}>
                                                {log.status_consulta}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-white/40 group-hover:text-red-500 group-hover:bg-red-500/10 group-hover:border-red-500/20 transition-all">
                                                <ArrowRight size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
