import React from 'react';
import { Trophy, CarFront, Flag, Clock, AlertTriangle, TrendingDown, MessageCircle } from 'lucide-react';
import { InfoGrid } from '../sections/InfoGrid';
import { TacticalAction } from '../sections/TacticalAction';
import { QuickActions } from '../sections/QuickActions';
import { Lead } from '../types';

interface DashboardTabProps {
    lead: Lead;
    isEditing: boolean;
    editedLead: any;
    setEditedLead: (lead: any) => void;
    isManagement?: boolean;
    setIsEditing: (val: boolean) => void;
    handleUpdateLead: () => void;
    ultimaInteracao?: any;
    showFinishing: boolean;
    setShowFinishing: (val: boolean) => void;
    finishType: string | null;
    setFinishType: (type: 'venda' | 'compra' | 'perda') => void;
    vehicleDetails: string;
    setVehicleDetails: (val: string) => void;
    lossReason: string;
    setLossReason: (val: string) => void;
    handleSaveFinish: () => Promise<void>;
    loadingStatus: 'idle' | 'analyzing' | 'matching' | 'finalizing';
    recalculateStrategy: () => void;
    handleExecuteAIDirective: () => void;
    onTabChange: (tab: any) => void;
    getAcaoTaticaFallback: (lead: any) => any;
    calcularTempoFunil: (date: string) => string;
    calcularDiffHoras: (date: string) => number;
    onSaveField: (field: string, value: string) => Promise<void>;
    scriptOptions?: { tipo: string; label: string; mensagem: string }[];
    aiStale?: boolean;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
    lead,
    isEditing,
    editedLead,
    setEditedLead,
    isManagement,
    setIsEditing,
    handleUpdateLead,
    ultimaInteracao,
    showFinishing,
    setShowFinishing,
    finishType,
    setFinishType,
    vehicleDetails,
    setVehicleDetails,
    lossReason,
    setLossReason,
    handleSaveFinish,
    loadingStatus,
    recalculateStrategy,
    handleExecuteAIDirective,
    onTabChange,
    getAcaoTaticaFallback,
    calcularTempoFunil,
    calcularDiffHoras,
    onSaveField,
    scriptOptions = [],
    aiStale = false,
}) => {
    // ── TELA DE CONCLUSÃO DE MISSÃO (estilo poker app) ──
    if (showFinishing) {
        const FINISH_OPTIONS = [
            {
                id: 'venda',
                icon: Trophy,
                title: 'Venda Realizada',
                desc: 'Registre o veículo vendido ao cliente',
                color: '#22c55e',
            },
            {
                id: 'compra',
                icon: CarFront,
                title: 'Compra de Troca',
                desc: 'Cliente traz veículo na negociação',
                color: '#3b82f6',
            },
            {
                id: 'perda',
                icon: Flag,
                title: 'Lead Perdido',
                desc: 'Registre o motivo da não conversão',
                color: '#ef4444',
            },
        ] as const;

        return (
            <div className="space-y-6">
                <button
                    onClick={() => setShowFinishing(false)}
                    className="text-[11px] text-white/30 hover:text-white/60 transition-colors flex items-center gap-1.5"
                >
                    ← Voltar
                </button>

                <div>
                    <h3 className="text-[18px] font-bold text-white leading-tight">Conclusão</h3>
                    <p className="text-[12px] text-white/35 mt-0.5">Qual foi o desfecho desta negociação?</p>
                </div>

                {/* Lista estilo poker app */}
                <div className="bg-[#141418] border border-white/[0.07] rounded-xl overflow-hidden">
                    {FINISH_OPTIONS.map((opt, i) => (
                        <button
                            key={opt.id}
                            onClick={() => setFinishType(opt.id as any)}
                            className={`w-full flex items-center gap-4 px-4 py-4 border-b border-white/[0.05] last:border-0 hover:bg-white/[0.03] transition-colors group text-left ${
                                finishType === opt.id ? 'bg-white/[0.04]' : ''
                            }`}
                        >
                            <div
                                className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border"
                                style={{ backgroundColor: `${opt.color}12`, borderColor: `${opt.color}25`, color: opt.color }}
                            >
                                <opt.icon size={18} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[14px] font-semibold text-white">{opt.title}</p>
                                <p className="text-[12px] text-white/40 mt-0.5">{opt.desc}</p>
                            </div>
                            <div
                                className="h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                                style={{
                                    borderColor: finishType === opt.id ? opt.color : 'rgba(255,255,255,0.15)',
                                    backgroundColor: finishType === opt.id ? `${opt.color}20` : 'transparent',
                                }}
                            >
                                {finishType === opt.id && (
                                    <div className="h-2 w-2 rounded-full" style={{ backgroundColor: opt.color }} />
                                )}
                            </div>
                        </button>
                    ))}
                </div>

                {/* Campo adicional conforme seleção */}
                {finishType && (
                    <div className="space-y-3">
                        {finishType !== 'perda' ? (
                            <div className="space-y-1.5">
                                <label className="text-[11px] text-white/40 uppercase tracking-widest">Modelo do veículo</label>
                                <input
                                    type="text"
                                    placeholder="Ex: Chevrolet Prisma 1.0 2020..."
                                    value={vehicleDetails}
                                    onChange={e => setVehicleDetails(e.target.value)}
                                    className="w-full bg-[#141418] border border-white/[0.09] rounded-xl px-4 py-3 text-white text-[13px] outline-none focus:border-white/20 transition-colors"
                                />
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                <label className="text-[11px] text-white/40 uppercase tracking-widest">Motivo da perda</label>
                                <textarea
                                    value={lossReason}
                                    placeholder="Por que este lead não converteu?"
                                    onChange={e => setLossReason(e.target.value)}
                                    rows={3}
                                    className="w-full bg-[#141418] border border-white/[0.09] rounded-xl px-4 py-3 text-white text-[13px] outline-none resize-none focus:border-white/20 transition-colors"
                                />
                            </div>
                        )}
                        <button
                            onClick={handleSaveFinish}
                            className="w-full py-3.5 bg-red-600 hover:bg-red-500 text-white font-semibold text-[13px] rounded-xl transition-colors active:scale-[0.98]"
                        >
                            {loadingStatus === 'finalizing' ? 'Salvando...' : 'Confirmar'}
                        </button>
                    </div>
                )}
            </div>
        );
    }

    // ── CHURN RISK HELPERS ──
    const churn = Number((lead as any).churn_probability) || 0;
    const hoursInactive = Math.round(
        (Date.now() - new Date((lead as any).updated_at || lead.created_at).getTime()) / 3_600_000
    );
    const aiScore = Number(lead.ai_score) || 0;

    const churnColor  = churn >= 80 ? '#ef4444' : churn >= 60 ? '#f59e0b' : churn >= 40 ? '#f97316' : '#22c55e';
    const churnLabel  = churn >= 80 ? 'Crítico' : churn >= 60 ? 'Alto' : churn >= 40 ? 'Moderado' : 'Baixo';
    const churnBgRing = churn >= 80 ? 'border-red-500/20 bg-red-950/10'
                      : churn >= 60 ? 'border-amber-500/20 bg-amber-950/10'
                      : churn >= 40 ? 'border-orange-500/20 bg-orange-950/10'
                      : 'border-emerald-500/15 bg-emerald-950/10';

    const churnSuggestion = hoursInactive > 72
        ? `Lead inativo há ${hoursInactive}h. Envie uma mensagem de reengajamento agora.`
        : aiScore > 0 && aiScore < 40
        ? 'Score IA baixo. Qualifique o interesse: pergunte sobre prazo e orçamento.'
        : 'Mantenha contato regular para reduzir o risco de abandono.';

    // ── TELA PRINCIPAL ──
    return (
        <div className="space-y-4">
            <InfoGrid
                lead={lead}
                isAdmin={!!isManagement}
                onSave={onSaveField}
                calcularTempoFunil={calcularTempoFunil}
                calcularDiffHoras={calcularDiffHoras}
            />

            <TacticalAction
                lead={lead}
                loadingStatus={loadingStatus}
                recalculateStrategy={recalculateStrategy}
                handleExecuteAIDirective={handleExecuteAIDirective}
                onTabChange={onTabChange}
                fallbackAction={getAcaoTaticaFallback(lead)}
                scriptOptions={scriptOptions}
                aiStale={aiStale}
            />

            {/* ── RISCO DE CHURN ── (exibe quando churn > 0) */}
            {churn > 0 && (
                <div className={`rounded-xl border overflow-hidden ${churnBgRing}`}>
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
                        <div className="flex items-center gap-2">
                            {churn >= 60
                                ? <AlertTriangle size={13} style={{ color: churnColor }} />
                                : <TrendingDown size={13} style={{ color: churnColor }} />
                            }
                            <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: churnColor }}>
                                Risco de Abandono
                            </span>
                        </div>
                        <span className="text-[11px] font-black" style={{ color: churnColor }}>
                            {churnLabel} · {churn}%
                        </span>
                    </div>
                    <div className="px-4 pt-3 pb-4 space-y-3">
                        {/* Barra de progresso */}
                        <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                            <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${churn}%`, backgroundColor: churnColor, boxShadow: `0 0 8px ${churnColor}60` }}
                            />
                        </div>
                        {/* Sugestão de ação */}
                        <div className="flex items-start gap-2">
                            <MessageCircle size={12} className="text-white/30 mt-0.5 shrink-0" />
                            <p className="text-[11px] text-white/50 leading-relaxed">{churnSuggestion}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Agendamentos ativos */}
            {(lead as any)?.followups && ((lead as any).followups as any[]).filter((f: any) => f?.status === 'pending').length > 0 && (
                <div className="bg-[#141418] border border-white/[0.07] rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05]">
                        <Clock size={13} className="text-white/30" />
                        <span className="text-[11px] font-semibold text-white/50 uppercase tracking-widest">Agendamentos</span>
                    </div>
                    {((lead as any).followups as any[]).filter((f: any) => f?.status === 'pending').map((fu: any) => (
                        <div key={fu.id} className="flex items-center justify-between px-4 py-3 border-b border-white/[0.04] last:border-0">
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-lg bg-amber-400/10 border border-amber-400/20 flex items-center justify-center shrink-0">
                                    <Clock size={14} className="text-amber-400" />
                                </div>
                                <div>
                                    <p className="text-[13px] font-semibold text-white/80">
                                        {fu.type === 'visit' ? 'AGENDA' : fu.type.toUpperCase()}
                                    </p>
                                    {fu.note && <p className="text-[11px] text-white/35 mt-0.5">{fu.note}</p>}
                                </div>
                            </div>
                            <span className="text-[11px] font-medium text-amber-400 tabular-nums">
                                {new Date(fu.scheduled_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Última interação */}
            {ultimaInteracao && (
                <div className="bg-[#141418] border border-white/[0.07] rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
                        <div className="flex items-center gap-2">
                            <div className={`h-1.5 w-1.5 rounded-full ${
                                ultimaInteracao.type?.includes('whatsapp_in') ? 'bg-emerald-400' :
                                ultimaInteracao.type?.includes('whatsapp') ? 'bg-sky-400' :
                                ultimaInteracao.type?.includes('call') ? 'bg-purple-400' :
                                'bg-white/20'
                            }`} />
                            <span className="text-[11px] font-semibold text-white/40 uppercase tracking-widest">Último contato</span>
                        </div>
                        <span className="text-[11px] text-white/25 tabular-nums">
                            {ultimaInteracao.created_at
                                ? new Date(ultimaInteracao.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                                : '—'}
                        </span>
                    </div>
                    <div className="px-4 py-3">
                        {(() => {
                            // TimelineEvent usa .description; interações legadas usam .notes
                            const raw = (ultimaInteracao.description || ultimaInteracao.notes || '').trim();
                            // Remove prefixos de sistema: [WILSON] bla, [IA AUTO] bla, [HANDOFF] bla
                            const clean = raw.replace(/^\[.*?\]\s*/g, '').trim();
                            return (
                                <p className="text-[13px] text-white/60 leading-relaxed italic">
                                    "{clean || (ultimaInteracao.title !== 'Evento' ? ultimaInteracao.title : 'Sem conteúdo registrado.')}"
                                </p>
                            );
                        })()}
                        <span className="text-[10px] text-white/25 uppercase tracking-wider mt-1.5 block">
                            {ultimaInteracao.type === 'whatsapp_in'  ? 'WHATSAPP — Cliente'  :
                             ultimaInteracao.type === 'whatsapp_out' ? 'WHATSAPP — Consultor' :
                             ultimaInteracao.type === 'note'         ? 'Nota interna'        :
                             ultimaInteracao.type === 'call'         ? 'Ligação'             :
                             ultimaInteracao.type === 'ai_analysis'  ? 'Análise IA'          :
                             (ultimaInteracao.type || 'Interação').replace(/_/g, ' ')}
                        </span>
                    </div>
                </div>
            )}

            <QuickActions onOpenFinish={(type) => { setShowFinishing(true); setFinishType(type); }} />
        </div>
    );
};
