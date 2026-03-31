'use client';
import React, { useState, useEffect } from 'react';
import { CreditCard, Calculator, ShieldCheck, History, AlertCircle, CheckCircle2, Loader2, Search } from 'lucide-react';
import { Lead } from '@/lib/types';
import { validateCPF, formatCPF } from '@/lib/shared_utils/cpf';
import { logCreditConsultation } from '@/lib/services/leadCrud';
import { supabase } from '@/lib/services/supabaseClients';

interface FinancingTabProps {
    lead: Lead;
    onSaveField: (field: string, value: string) => Promise<void>;
}

export const FinancingTab: React.FC<FinancingTabProps> = ({ lead, onSaveField }) => {
    const [cpf, setCpf] = useState(lead.cpf || '');
    const [isValid, setIsValid] = useState(false);
    const [loading, setLoading] = useState(false);
    const [scoreResult, setScoreResult] = useState<{ original: number; reduced: number } | null>(null);
    const [lastConsult, setLastConsult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const [currentConsultant, setCurrentConsultant] = useState<{ id: string; name: string } | null>(null);

    // Obter o consultor logado no momento
    useEffect(() => {
        const fetchLoggedUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data } = await supabase
                    .from('consultants_manos_crm')
                    .select('id, name')
                    .eq('auth_id', user.id)
                    .maybeSingle();
                
                if (data) {
                    setCurrentConsultant(data);
                }
            }
        };
        fetchLoggedUser();
    }, []);

    // Carregar última consulta do histórico
    useEffect(() => {
        const fetchHistory = async () => {
            const { data, error } = await supabase
                .from('audit_credit_consultations')
                .select('*, consultants_manos_crm(name)')
                .eq('lead_id', lead.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (data) {
                setLastConsult(data);
                if (data.cpf_consultado) setCpf(formatCPF(data.cpf_consultado));
                if (data.status_consulta === 'sucesso') {
                    setScoreResult({
                        original: data.score_original,
                        reduced: data.score_com_redutor
                    });
                }
            }
        };
        fetchHistory();
    }, [lead.id]);

    // Validar CPF, buscar histórico por CPF e persistir automaticamente
    useEffect(() => {
        const cleanCpf = cpf.replace(/\D/g, '');
        const valid = validateCPF(cleanCpf);
        setIsValid(valid);

        if (valid) {
            // Persistência automática se mudou
            if (cleanCpf !== (lead.cpf || '').replace(/\D/g, '')) {
                onSaveField('cpf', cleanCpf);
            }

            // Buscar se ESTE CPF específico já foi consultado (em qualquer lead ou neste mesmo)
            const checkExisting = async () => {
                const { data } = await supabase
                    .from('audit_credit_consultations')
                    .select('*, consultants_manos_crm(name)')
                    .eq('cpf_consultado', cleanCpf)
                    .eq('status_consulta', 'sucesso')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (data) {
                    setLastConsult(data);
                    setScoreResult({
                        original: data.score_original,
                        reduced: data.score_com_redutor
                    });
                    setError(null);
                }
            };
            checkExisting();
        } else {
            setScoreResult(null);
            setError(null);
        }
    }, [cpf, lead.cpf, onSaveField, lead.id]);

    const handleConsultScan = async () => {
        if (!isValid) return;
        setLoading(true);
        setError(null);

        try {
            const response = await fetch('https://n8n.drivvoo.com/webhook/consultascore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    cpf: cpf.replace(/\D/g, ''),
                    lead_id: lead.id,
                    consultant_id: lead.assigned_consultant_id 
                })
            });

            if (!response.ok) throw new Error('Falha na comunicação com o provedor');

            const data = await response.json();
            const scoreRaw = data.score || data.valor || 0;
            
            if (scoreRaw > 0) {
                const reduced = scoreRaw - 200;
                setScoreResult({ original: scoreRaw, reduced });

                // Determinar o ID do consultor (preferência para o logado)
                const consultantId = currentConsultant?.id || lead.assigned_consultant_id || 'portal';

                // Gravar auditoria
                await logCreditConsultation({
                    consultant_id: consultantId,
                    lead_id: lead.id,
                    cpf_consultado: cpf.replace(/\D/g, ''),
                    status_consulta: 'sucesso',
                    score_original: scoreRaw,
                    score_com_redutor: reduced
                });

                // Atualizar histórico local
                setLastConsult({
                    created_at: new Date().toISOString(),
                    status_consulta: 'sucesso',
                    score_com_redutor: reduced,
                    cpf_consultado: cpf.replace(/\D/g, ''),
                    consultants_manos_crm: { name: currentConsultant?.name || 'Sistema' }
                });
            } else {
                throw new Error('Retorno de score inválido');
            }

        } catch (err: any) {
            setError(err.message || 'Erro ao realizar consulta');
            // Gravar falha na auditoria se possível
            try {
                const consultantId = currentConsultant?.id || lead.assigned_consultant_id || 'portal';
                await logCreditConsultation({
                    consultant_id: consultantId,
                    lead_id: lead.id,
                    cpf_consultado: cpf.replace(/\D/g, ''),
                    status_consulta: 'falha'
                });
            } catch (e) {}
        } finally {
            setLoading(false);
        }
    };

    const isAlreadyConsulted = scoreResult !== null && lastConsult?.status_consulta === 'sucesso' && lastConsult?.cpf_consultado === cpf.replace(/\D/g, '');

    return (
        <div className="space-y-6">
            {/* Header Informativo */}
            <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4 flex gap-4">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                    <ShieldCheck className="text-blue-400" size={20} />
                </div>
                <div>
                    <h4 className="text-white font-medium text-sm">Consulta de Crédito Segura</h4>
                    <p className="text-white/40 text-xs mt-1">
                        Valide o CPF do cliente para realizar uma pré-análise de score. 
                        As consultas são auditadas para controle interno.
                    </p>
                </div>
            </div>

            {/* Input de CPF */}
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 space-y-4">
                <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold text-white/30 uppercase tracking-widest flex items-center gap-2">
                        <CreditCard size={12} />
                        CPF do Cliente
                    </label>
                    <div className="relative">
                        <input
                            type="text"
                            value={cpf}
                            onChange={(e) => setCpf(formatCPF(e.target.value))}
                            placeholder="000.000.000-00"
                            className={`w-full bg-black/40 border ${isValid ? 'border-emerald-500/30 grow-emerald-500/10' : cpf.length >= 14 ? 'border-red-500/30' : 'border-white/10'} rounded-xl px-4 py-3 text-white text-lg font-mono focus:outline-none focus:ring-2 focus:ring-red-500/20 transition-all`}
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2">
                            {isValid ? (
                                <CheckCircle2 size={20} className="text-emerald-500" />
                            ) : cpf.length >= 14 ? (
                                <AlertCircle size={20} className="text-red-500" />
                            ) : null}
                        </div>
                    </div>
                    {isValid && (
                        <p className="text-[10px] text-emerald-500/60 font-medium flex items-center gap-1">
                            <CheckCircle2 size={10} /> CPF Válido e persistido automaticamente
                        </p>
                    )}
                </div>

                <button
                    onClick={handleConsultScan}
                    disabled={!isValid || loading || isAlreadyConsulted}
                    className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                        isValid && !loading && !isAlreadyConsulted
                            ? 'bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-600/20'
                            : isAlreadyConsulted 
                                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 cursor-default'
                                : 'bg-white/5 text-white/20 cursor-not-allowed'
                    }`}
                >
                    {loading ? (
                        <Loader2 size={20} className="animate-spin" />
                    ) : isAlreadyConsulted ? (
                        <>
                            <CheckCircle2 size={20} />
                            SCORE JÁ CONSULTADO
                        </>
                    ) : (
                        <>
                            <Search size={20} />
                            CONSULTAR SCORE AGORA
                        </>
                    )}
                </button>
                
                {error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-500 text-xs">
                        <AlertCircle size={14} />
                        {error}
                    </div>
                )}
            </div>

            {/* Resultado do Score (Visual Premium) */}
            {scoreResult && (
                <div className="relative group overflow-hidden bg-gradient-to-br from-red-600/10 via-[#1A1A22] to-black border border-red-600/20 rounded-[32px] p-8 shadow-2xl shadow-red-900/10 transition-all">
                    {/* Brilho de fundo */}
                    <div className="absolute -top-24 -right-24 w-48 h-48 bg-red-500/10 blur-[80px] rounded-full group-hover:bg-red-500/20 transition-all duration-700" />
                    
                    <div className="relative flex flex-col items-center text-center">
                        <div className="relative">
                            <div className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em] mb-1">
                                CPF {cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")} 
                            </div>
                            {/* Score Principal */}
                            <div className="text-7xl font-black text-white tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.15)]">
                                {scoreResult.reduced}
                            </div>
                            <div className="text-[11px] font-bold text-white/30 uppercase tracking-[0.2em] mt-1">
                                Pontuação Geral
                            </div>
                        </div>

                        {/* Barra de Nível / Saúde do Score */}
                        <div className="w-full max-w-[200px] mt-8 space-y-3">
                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden flex">
                                <div 
                                    className={`h-full transition-all duration-1000 ${
                                        scoreResult.reduced < 400 ? 'bg-red-500' : 
                                        scoreResult.reduced < 700 ? 'bg-amber-500' : 'bg-emerald-500'
                                    }`}
                                    style={{ width: `${Math.min((scoreResult.reduced / 1000) * 100, 100)}%` }}
                                />
                            </div>
                            <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                                <span className={scoreResult.reduced < 400 ? 'text-red-500' : 'text-white/20'}>Risco</span>
                                <span className={scoreResult.reduced >= 400 && scoreResult.reduced < 700 ? 'text-amber-500' : 'text-white/20'}>Médio</span>
                                <span className={scoreResult.reduced >= 700 ? 'text-emerald-500' : 'text-white/20'}>Excelente</span>
                            </div>
                        </div>

                        {/* Selo de Verificação no canto */}
                        <div className="absolute top-6 right-8">
                            <CheckCircle2 size={16} className="text-red-500/30" />
                        </div>
                    </div>
                </div>
            )}

            {/* Histórico e Auditoria */}
            {lastConsult && (
                <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4">
                    <h5 className="text-white/40 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 mb-3">
                        <History size={12} />
                        Última Consulta Realizada
                    </h5>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-white/5 flex items-center justify-center">
                                <Calculator size={14} className="text-white/30" />
                            </div>
                            <div>
                                <div className="text-white/60 text-xs font-medium">
                                    {lastConsult.consultants_manos_crm?.name || 'Consultor'}
                                </div>
                                <div className="text-white/20 text-[10px]">
                                    {new Date(lastConsult.created_at).toLocaleString('pt-BR')}
                                </div>
                            </div>
                        </div>
                        <div className={`px-2 py-1 rounded text-[9px] font-bold uppercase ${
                            lastConsult.status_consulta === 'sucesso' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                        }`}>
                            {lastConsult.status_consulta}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
