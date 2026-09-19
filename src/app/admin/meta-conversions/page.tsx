'use client';

import React, { useState, useEffect } from 'react';
import { 
    Activity, 
    CheckCircle2, 
    XCircle, 
    RefreshCw, 
    Send, 
    Search, 
    ShieldCheck, 
    Zap, 
    AlertTriangle, 
    Code, 
    BarChart3, 
    Terminal, 
    Database, 
    Sliders,
    Play,
    Eye,
    ChevronRight,
    Sparkles
} from 'lucide-react';

interface MetaStatus {
    configured: boolean;
    pixelId: string;
    apiVersion: string;
    hasAccessToken: boolean;
}

interface MetaStats {
    total: number;
    successCount: number;
    failedCount: number;
    successRate: number;
    eventsByType: Record<string, number>;
}

interface MetaLog {
    id: string;
    lead_id?: string;
    fb_lead_id?: string;
    event_name: string;
    event_id: string;
    status: 'SUCCESS' | 'FAILED' | 'PENDING';
    response_code?: number;
    response_payload?: any;
    payload_sent?: any;
    error_message?: string;
    attempts: number;
    created_at: string;
}

export default function MetaConversionsDashboard() {
    const [status, setStatus] = useState<MetaStatus | null>(null);
    const [stats, setStats] = useState<MetaStats | null>(null);
    const [logs, setLogs] = useState<MetaLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Filtros
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'SUCCESS' | 'FAILED'>('ALL');
    const [selectedEvent, setSelectedEvent] = useState<string>('ALL');

    // Test Runner State
    const [testEventCode, setTestEventCode] = useState('');
    const [testEventName, setTestEventName] = useState('Lead');
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<any>(null);

    // Modal para visualizar Payload / Resposta
    const [activeLog, setActiveLog] = useState<MetaLog | null>(null);
    const [retryingId, setRetryingId] = useState<string | null>(null);

    async function loadDashboardData() {
        try {
            setRefreshing(true);
            const res = await fetch('/api/admin/meta-conversions');
            if (!res.ok) throw new Error('Falha ao buscar dados');
            const data = await res.json();
            setStatus(data.status);
            setStats(data.stats);
            setLogs(data.logs || []);
        } catch (err) {
            console.error('Erro ao carregar dashboard CAPI:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }

    useEffect(() => {
        loadDashboardData();
    }, []);

    async function handleRunTest() {
        setTesting(true);
        setTestResult(null);
        try {
            const res = await fetch('/api/admin/meta-conversions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'test',
                    eventName: testEventName,
                    testEventCode: testEventCode.trim() || undefined
                })
            });
            const data = await res.json();
            setTestResult(data);
            await loadDashboardData();
        } catch (err: any) {
            setTestResult({ success: false, error: err.message || 'Erro no envio do teste' });
        } finally {
            setTesting(false);
        }
    }

    async function handleRetry(logId: string) {
        setRetryingId(logId);
        try {
            const res = await fetch('/api/admin/meta-conversions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'retry',
                    logId
                })
            });
            const data = await res.json();
            if (data.success) {
                alert('✅ Evento re-enviado com sucesso para a Meta!');
            } else {
                alert(`❌ Falha no reenvio: ${data.result?.error?.message || data.error || 'Erro desconhecido'}`);
            }
            await loadDashboardData();
        } catch (err: any) {
            alert(`❌ Erro: ${err.message}`);
        } finally {
            setRetryingId(null);
        }
    }

    // Filtragem dos logs
    const filteredLogs = logs.filter(log => {
        const matchesSearch = searchQuery === '' || 
            (log.event_name && log.event_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (log.event_id && log.event_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (log.lead_id && log.lead_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
            (log.fb_lead_id && log.fb_lead_id.toLowerCase().includes(searchQuery.toLowerCase()));

        const matchesStatus = selectedStatus === 'ALL' || log.status === selectedStatus;
        const matchesEvent = selectedEvent === 'ALL' || log.event_name === selectedEvent;

        return matchesSearch && matchesStatus && matchesEvent;
    });

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
            {/* TOP BAR & TITLE */}
            <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
                    <div>
                        <div className="flex items-center gap-3">
                            <span className="p-2 bg-blue-600/20 text-blue-400 rounded-lg border border-blue-500/30">
                                <Activity className="w-6 h-6 animate-pulse" />
                            </span>
                            <h1 className="text-2xl md:text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-blue-400">
                                Meta Conversions API (CAPI)
                            </h1>
                        </div>
                        <p className="text-sm text-slate-400 mt-1">
                            Painel Integrado de Diagnóstico, Telemetria & Auditoria de Conversões (Graph API v26.0)
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={loadDashboardData}
                            disabled={refreshing}
                            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 rounded-lg transition text-sm font-medium disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                            Atualizar Dados
                        </button>
                    </div>
                </div>

                {/* STATUS & CONNECTOR CARDS */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Status de Conexão */}
                    <div className="bg-slate-900/80 border border-white/10 rounded-xl p-5 relative overflow-hidden backdrop-blur-md">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Status Conexão</span>
                            {status?.configured ? (
                                <span className="flex items-center gap-1.5 text-xs bg-emerald-500/20 text-emerald-400 font-semibold px-2.5 py-1 rounded-full border border-emerald-500/30">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Conectado
                                </span>
                            ) : (
                                <span className="flex items-center gap-1.5 text-xs bg-rose-500/20 text-rose-400 font-semibold px-2.5 py-1 rounded-full border border-rose-500/30">
                                    <XCircle className="w-3.5 h-3.5" /> Pendente
                                </span>
                            )}
                        </div>
                        <div className="mt-3">
                            <div className="text-lg font-bold text-white font-mono">Dataset {status?.pixelId || '995826668986455'}</div>
                            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" /> API Version: <span className="text-blue-400 font-mono font-medium">{status?.apiVersion || 'v26.0'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Total Disparos */}
                    <div className="bg-slate-900/80 border border-white/10 rounded-xl p-5 backdrop-blur-md">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total de Eventos</span>
                            <Zap className="w-4 h-4 text-amber-400" />
                        </div>
                        <div className="mt-3">
                            <div className="text-2xl font-bold text-white">{stats?.total || 0}</div>
                            <div className="text-xs text-slate-400 mt-1">Registrados na tabela de auditoria</div>
                        </div>
                    </div>

                    {/* Taxa de Sucesso / EMQ */}
                    <div className="bg-slate-900/80 border border-white/10 rounded-xl p-5 backdrop-blur-md">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Taxa de Sucesso</span>
                            <BarChart3 className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div className="mt-3">
                            <div className="text-2xl font-bold text-emerald-400">{stats?.successRate || 100}%</div>
                            <div className="text-xs text-slate-400 mt-1">Status HTTP 200 OK sem erros Graph API</div>
                        </div>
                    </div>

                    {/* Falhas / Falhas para Reenvio */}
                    <div className="bg-slate-900/80 border border-white/10 rounded-xl p-5 backdrop-blur-md">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Falhas Encontradas</span>
                            <AlertTriangle className="w-4 h-4 text-rose-400" />
                        </div>
                        <div className="mt-3">
                            <div className="text-2xl font-bold text-rose-400">{stats?.failedCount || 0}</div>
                            <div className="text-xs text-slate-400 mt-1">Disponíveis para reenvio manual</div>
                        </div>
                    </div>
                </div>

                {/* TEST RUNNER SECTION */}
                <div className="bg-slate-900/90 border border-blue-500/30 rounded-xl p-6 backdrop-blur-md relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                        <Terminal className="w-48 h-48 text-blue-400" />
                    </div>

                    <div className="flex items-center gap-2 text-blue-400 font-semibold text-sm uppercase tracking-wider mb-2">
                        <Sparkles className="w-4 h-4" /> Disparador Sintético em Tempo Real (Meta Events Manager)
                    </div>
                    <p className="text-xs text-slate-400 max-w-3xl mb-4">
                        Insira o código de teste gerado na aba <strong>Testar Eventos</strong> (Test Events) do Meta Events Manager para acompanhar em tempo real a validação da correspondência avançada (Advanced Matching EMQ).
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-slate-300 mb-1">Evento Meta Standard</label>
                            <select
                                value={testEventName}
                                onChange={(e) => setTestEventName(e.target.value)}
                                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-blue-500"
                            >
                                <option value="Lead">Lead (Entrada)</option>
                                <option value="QualifiedLead">QualifiedLead (Triagem)</option>
                                <option value="Schedule">Schedule (Agendamento Visita)</option>
                                <option value="InPersonMeeting">InPersonMeeting (Visita Showroom)</option>
                                <option value="SubmitApplication">SubmitApplication (Proposta)</option>
                                <option value="Purchase">Purchase (Venda Concluída R$)</option>
                                <option value="DisqualifiedLead">DisqualifiedLead (Descarte)</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-300 mb-1">Código Teste (test_event_code)</label>
                            <input
                                type="text"
                                placeholder="ex: TEST12345 (opcional)"
                                value={testEventCode}
                                onChange={(e) => setTestEventCode(e.target.value)}
                                className="w-full bg-slate-950 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-100 font-mono placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                            />
                        </div>

                        <div className="flex items-end">
                            <button
                                onClick={handleRunTest}
                                disabled={testing}
                                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg transition flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                            >
                                {testing ? (
                                    <>
                                        <RefreshCw className="w-4 h-4 animate-spin" /> Disparando CAPI...
                                    </>
                                ) : (
                                    <>
                                        <Play className="w-4 h-4 fill-current" /> Disparar Evento Teste
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {testResult && (
                        <div className={`mt-4 p-4 rounded-lg border text-xs font-mono overflow-x-auto ${testResult.success ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' : 'bg-rose-950/40 border-rose-500/30 text-rose-300'}`}>
                            <div className="font-bold flex items-center gap-2 mb-1">
                                {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}
                                Resultado do Disparo Teste Meta Graph API:
                            </div>
                            <pre className="mt-2 text-[11px] leading-relaxed whitespace-pre-wrap">{JSON.stringify(testResult, null, 2)}</pre>
                        </div>
                    )}
                </div>

                {/* AUDIT LOG TABLE & FILTERS */}
                <div className="bg-slate-900/90 border border-white/10 rounded-xl p-6 backdrop-blur-md space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Database className="w-5 h-5 text-blue-400" /> Auditoria de Eventos Disparados (`meta_conversions_log`)
                            </h2>
                            <p className="text-xs text-slate-400">Histórico de comunicação bidirecional com a Meta Graph API v26.0</p>
                        </div>

                        {/* Search & Filters */}
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                                <input
                                    type="text"
                                    placeholder="Buscar por Lead ID, Event ID..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="bg-slate-950 border border-white/10 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500 w-48 md:w-64"
                                />
                            </div>

                            <select
                                value={selectedStatus}
                                onChange={(e) => setSelectedStatus(e.target.value as any)}
                                className="bg-slate-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                            >
                                <option value="ALL">Todos os Status</option>
                                <option value="SUCCESS">Sucesso (200 OK)</option>
                                <option value="FAILED">Falha / Erro</option>
                            </select>

                            <select
                                value={selectedEvent}
                                onChange={(e) => setSelectedEvent(e.target.value)}
                                className="bg-slate-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                            >
                                <option value="ALL">Todos os Eventos</option>
                                <option value="Lead">Lead</option>
                                <option value="QualifiedLead">QualifiedLead</option>
                                <option value="Schedule">Schedule</option>
                                <option value="InPersonMeeting">InPersonMeeting</option>
                                <option value="SubmitApplication">SubmitApplication</option>
                                <option value="Purchase">Purchase</option>
                                <option value="DisqualifiedLead">DisqualifiedLead</option>
                            </select>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto border border-white/10 rounded-lg">
                        <table className="w-full text-left text-xs text-slate-300">
                            <thead className="bg-slate-950 text-slate-400 font-semibold uppercase tracking-wider text-[10px] border-b border-white/10">
                                <tr>
                                    <th className="px-4 py-3">Data / Hora</th>
                                    <th className="px-4 py-3">Evento Standard</th>
                                    <th className="px-4 py-3">Lead CRM / FB ID</th>
                                    <th className="px-4 py-3">Event ID (Deduplicação)</th>
                                    <th className="px-4 py-3">Status HTTP</th>
                                    <th className="px-4 py-3 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="text-center py-8 text-slate-500">
                                            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                                            Carregando logs de auditoria...
                                        </td>
                                    </tr>
                                ) : filteredLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="text-center py-8 text-slate-500">
                                            Nenhum evento encontrado nos filtros selecionados.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredLogs.map((log) => (
                                        <tr key={log.id} className="hover:bg-white/[0.02] transition">
                                            <td className="px-4 py-3 whitespace-nowrap text-slate-400 font-mono">
                                                {new Date(log.created_at).toLocaleString('pt-BR')}
                                            </td>
                                            <td className="px-4 py-3 font-semibold text-white whitespace-nowrap">
                                                <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">
                                                    {log.event_name}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-300">
                                                <div>{log.lead_id || '—'}</div>
                                                {log.fb_lead_id && (
                                                    <div className="text-[10px] text-amber-400/80">FB Lead: {log.fb_lead_id}</div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-400 text-[11px]">
                                                {log.event_id}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                {log.status === 'SUCCESS' ? (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                                                        <CheckCircle2 className="w-3 h-3" /> {log.response_code || 200} OK
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">
                                                        <XCircle className="w-3 h-3" /> {log.response_code || 500} ERRO
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right whitespace-nowrap space-x-2">
                                                <button
                                                    onClick={() => setActiveLog(log)}
                                                    className="inline-flex items-center gap-1 text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded border border-white/10 text-[11px] transition"
                                                >
                                                    <Eye className="w-3 h-3 text-blue-400" /> Detalhes
                                                </button>

                                                {log.status === 'FAILED' && (
                                                    <button
                                                        onClick={() => handleRetry(log.id)}
                                                        disabled={retryingId === log.id}
                                                        className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2.5 py-1 rounded text-[11px] transition disabled:opacity-50"
                                                    >
                                                        <RefreshCw className={`w-3 h-3 ${retryingId === log.id ? 'animate-spin' : ''}`} /> Reenviar
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* MODAL DETALHES DE AUDITORIA */}
            {activeLog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-slate-900 border border-white/10 rounded-xl max-w-3xl w-full p-6 space-y-4 shadow-2xl relative">
                        <div className="flex items-center justify-between border-b border-white/10 pb-4">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Code className="w-5 h-5 text-blue-400" /> Detalhes do Log de Conversão
                                </h3>
                                <p className="text-xs text-slate-400 font-mono">ID Log: {activeLog.id}</p>
                            </div>
                            <button
                                onClick={() => setActiveLog(null)}
                                className="text-slate-400 hover:text-white p-1 rounded-lg bg-white/5 hover:bg-white/10"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                            <div>
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Payload Enviado para Graph API</label>
                                <pre className="bg-slate-950 p-3 rounded-lg text-[11px] font-mono text-slate-200 border border-white/5 overflow-x-auto whitespace-pre-wrap">
                                    {JSON.stringify(activeLog.payload_sent, null, 2)}
                                </pre>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">Resposta da Meta Graph API</label>
                                <pre className={`p-3 rounded-lg text-[11px] font-mono border overflow-x-auto whitespace-pre-wrap ${activeLog.status === 'SUCCESS' ? 'bg-emerald-950/30 border-emerald-500/20 text-emerald-200' : 'bg-rose-950/30 border-rose-500/20 text-rose-200'}`}>
                                    {JSON.stringify(activeLog.response_payload, null, 2)}
                                </pre>
                            </div>

                            {activeLog.error_message && (
                                <div>
                                    <label className="text-xs font-semibold text-rose-400 uppercase tracking-wider block mb-1">Mensagem de Erro</label>
                                    <div className="bg-rose-950/50 text-rose-200 border border-rose-500/30 p-3 rounded-lg text-xs">
                                        {activeLog.error_message}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end pt-2 border-t border-white/10">
                            <button
                                onClick={() => setActiveLog(null)}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
