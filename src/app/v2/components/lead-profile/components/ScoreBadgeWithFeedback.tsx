import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Zap, AlertTriangle, CheckCircle2, MessageSquare, Target, Ghost, Flame, RefreshCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ScoreFeedbackProps {
    lead: any;
    score: number;
    scoreLabel: string; // 'quente', 'morno', 'frio', 'fervendo'
    userName: string;
    onScoreUpdated?: () => void;
}

const FEEDBACK_OPTIONS = [
    {
        category: 'score_alto_demais',
        label: 'Score alto demais',
        emoji: '📉',
        icon: Target,
        description: 'Lead está frio mas o score diz que é quente',
        correctLabel: 'frio',
        color: '#f59e0b'
    },
    {
        category: 'score_baixo_demais',
        label: 'Score baixo demais',
        emoji: '📈',
        icon: Flame,
        description: 'Lead está quente mas o score diz que é frio',
        correctLabel: 'quente',
        color: '#dc2626'
    },
    {
        category: 'lead_morto',
        label: 'Lead não é real',
        emoji: '💀',
        icon: Ghost,
        description: 'Número errado, spam, ou não tem interesse real',
        correctLabel: 'descartado',
        color: '#6b7280'
    },
    {
        category: 'lead_quente_ignorado',
        label: 'Lead pronto para fechar',
        emoji: '🔥',
        icon: Flame,
        description: 'Cliente quer fechar agora mas sistema não priorizou',
        correctLabel: 'fervendo',
        color: '#ef4444'
    },
    {
        category: 'status_errado',
        label: 'Estágio errado no funil',
        emoji: '🔄',
        icon: RefreshCcw,
        description: 'Lead deveria estar em outra etapa do pipeline',
        correctLabel: 'reclassificar',
        color: '#3b82f6'
    },
];

export function ScoreBadgeWithFeedback({ lead, score, scoreLabel, userName, onScoreUpdated }: ScoreFeedbackProps) {
    const [showFeedback, setShowFeedback] = useState(false);
    const [step, setStep] = useState<'options' | 'details' | 'submitted'>('options');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [correctLabel, setCorrectLabel] = useState('');
    const [reason, setReason] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const popoverRef = useRef<HTMLDivElement>(null);

    // Fechar ao clicar fora
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                setShowFeedback(false);
                setStep('options');
            }
        }
        if (showFeedback) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showFeedback]);

    const scoreColor = score >= 70 ? '#dc2626' : score >= 40 ? '#f59e0b' : '#6b7280';

    async function handleSubmitFeedback() {
        if (!selectedCategory || !reason.trim()) return;
        setSubmitting(true);

        const cleanId = lead.id?.toString().replace(/^(main_|crm26_|dist_)/, '') || lead.id;

        // Contexto para IA
        const daysInFunnel = lead.created_at
            ? Math.floor((Date.now() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24))
            : 0;

        let totalInteractions = 0;
        let lastInteractionDays = 999;

        try {
            const { count } = await supabase
                .from('interactions_manos_crm')
                .select('*', { count: 'exact', head: true })
                .or(`lead_id.eq.${lead.id},lead_id.eq.${cleanId}`);
            totalInteractions = count || 0;

            const { data: lastInt } = await supabase
                .from('interactions_manos_crm')
                .select('created_at')
                .or(`lead_id.eq.${lead.id},lead_id.eq.${cleanId}`)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (lastInt?.created_at) {
                lastInteractionDays = Math.floor(
                    (Date.now() - new Date(lastInt.created_at).getTime()) / (1000 * 60 * 60 * 24)
                );
            }
        } catch (e) { console.warn('Context fetch error:', e); }

        const selectedOpt = FEEDBACK_OPTIONS.find(o => o.category === selectedCategory);

        // Salvar feedback
        const { error } = await supabase
            .from('ai_feedback')
            .insert({
                lead_id: cleanId,
                lead_name: lead.name || lead.nome || '',
                lead_phone: lead.phone || '',
                reported_score: score,
                reported_label: scoreLabel,
                correct_label: correctLabel || selectedOpt?.correctLabel || '',
                reason: reason.trim(),
                category: selectedCategory,
                lead_status: lead.status || '',
                lead_origin: lead.source || lead.origem || '',
                lead_interest: lead.vehicle_interest || '',
                days_in_funnel: daysInFunnel,
                total_interactions: totalInteractions,
                last_interaction_days: lastInteractionDays,
                reported_by: userName,
            });

        if (!error) {
            // Timeline
            await supabase.from('interactions_manos_crm').insert({
                lead_id: cleanId,
                type: 'ai_feedback',
                notes: `⚠️ FEEDBACK DE SCORE: ${selectedOpt?.label}. Motivo: "${reason.trim()}". IA disse: ${score}% (${scoreLabel}). Vendedor diz: ${correctLabel}.`,
                user_name: userName,
                created_at: new Date().toISOString(),
            });

            setStep('submitted');
            if (onScoreUpdated) onScoreUpdated();

            setTimeout(() => {
                setShowFeedback(false);
                setStep('options');
                setSelectedCategory('');
                setReason('');
                setSubmitting(false);
            }, 2500);
        } else {
            console.error('Feedback error:', error);
            setSubmitting(false);
        }
    }

    return (
        <div style={{ position: 'relative' }} ref={popoverRef} className="z-50">
            {/* Badge Tático Clicável */}
            <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowFeedback(!showFeedback)}
                style={{
                    padding: '4px 12px',
                    borderRadius: '24px',
                    background: `${scoreColor}15`,
                    border: `1px solid ${scoreColor}40`,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.2s',
                    boxShadow: showFeedback ? `0 0 15px ${scoreColor}30` : 'none'
                }}
            >
                <Zap size={10} fill={scoreColor} style={{ color: scoreColor }} className={score >= 70 ? "animate-pulse" : ""} />
                <span style={{ fontSize: '11px', fontWeight: 900, color: scoreColor, letterSpacing: '0.05em' }}>
                    {score}%
                </span>
                <span style={{ fontSize: '9px', fontWeight: 800, color: `${scoreColor}99`, textTransform: 'uppercase' }}>
                    {scoreLabel}
                </span>
            </motion.div>

            {/* Popover de Feedback (Wow Design) */}
            <AnimatePresence>
                {showFeedback && (
                    <motion.div
                        initial={{ opacity: 0, y: 15, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        style={{
                            position: 'absolute',
                            top: 'calc(100% + 12px)',
                            right: 0,
                            width: '380px',
                            background: 'rgba(12, 12, 14, 0.95)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '24px',
                            boxShadow: '0 25px 80px -15px rgba(0,0,0,0.9), 0 0 40px rgba(0,0,0,0.5)',
                            overflow: 'hidden',
                            backdropFilter: 'blur(30px)',
                            padding: '1px' // Para efeito de borda gradiente sutil
                        }}
                    >
                        {/* Header do Popover (Premium Glass) */}
                        <div style={{
                            padding: '20px 24px',
                            background: 'linear-gradient(135deg, rgba(255,255,255,0.05), transparent)',
                            borderBottom: '1px solid rgba(255,255,255,0.08)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}>
                            <div className="flex flex-col">
                                <span style={{ 
                                    fontSize: '10px', 
                                    fontWeight: 900, 
                                    letterSpacing: '0.2em', 
                                    color: 'rgba(255,255,255,0.4)', 
                                    textTransform: 'uppercase',
                                    marginBottom: '4px'
                                }}>
                                    Centro de Treinamento IA
                                </span>
                                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '-0.02em' }}>
                                    Ajustar Score
                                </h4>
                            </div>
                            <div style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '16px',
                                background: 'rgba(0,0,0,0.4)',
                                border: `1px solid ${scoreColor}40`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: `0 0 20px ${scoreColor}20`
                            }}>
                                <span style={{ fontSize: '14px', fontVariantNumeric: 'tabular-nums', fontWeight: 900, color: scoreColor }}>{score}%</span>
                            </div>
                        </div>

                        {/* STEP 1: OPTIONS */}
                        {step === 'options' && (
                            <div style={{ padding: '12px' }} className="space-y-1">
                                {FEEDBACK_OPTIONS.map(opt => (
                                    <motion.div
                                        key={opt.category}
                                        whileHover={{ x: 4, background: 'rgba(255,255,255,0.03)' }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={() => {
                                            setSelectedCategory(opt.category);
                                            setCorrectLabel(opt.correctLabel);
                                            setStep('details');
                                        }}
                                        style={{
                                            padding: '16px 20px',
                                            borderRadius: '16px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '16px',
                                            transition: 'border 0.2s',
                                            border: '1px solid transparent'
                                        }}
                                        className="group hover:border-white/10"
                                    >
                                        <div style={{
                                            width: '40px',
                                            height: '40px',
                                            borderRadius: '12px',
                                            background: `${opt.color}15`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: opt.color,
                                            border: `1px solid ${opt.color}25`
                                        }}>
                                            <opt.icon size={18} />
                                        </div>
                                        <div className="flex-1">
                                            <div style={{ fontSize: '13px', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.01em' }}>
                                                {opt.label}
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '4px', lineHeight: '1.4' }}>
                                                {opt.description}
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}

                        {/* STEP 2: DETAILS */}
                        {step === 'details' && (
                            <div style={{ padding: '24px' }} className="animate-in fade-in slide-in-from-right-8 duration-300">
                                <div style={{ marginBottom: '20px' }}>
                                    <div className="flex justify-between items-end mb-3">
                                        <label style={{ fontSize: '10px', fontWeight: 900, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Justificativa do Especialista</label>
                                        <span className="text-[10px] text-white/20 font-mono">{reason.length}/200</span>
                                    </div>
                                    <textarea
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        placeholder="Descreva por que a IA errou e como deve ser classificado nas próximas vezes..."
                                        autoFocus
                                        maxLength={200}
                                        style={{
                                            width: '100%',
                                            background: 'rgba(0,0,0,0.3)',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            borderRadius: '16px',
                                            padding: '16px',
                                            color: '#fff',
                                            fontSize: '13px',
                                            height: '120px',
                                            resize: 'none',
                                            outline: 'none',
                                            lineHeight: '1.6'
                                        }}
                                        className="focus:border-blue-500/30 transition-all placeholder:text-white/10"
                                    />
                                </div>

                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button
                                        onClick={() => { setStep('options'); setSelectedCategory(''); setReason(''); }}
                                        style={{ flex: 1, height: '48px', padding: '0 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', color: 'rgba(255,255,255,0.6)', fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s' }}
                                        className="hover:bg-white/5 active:scale-95"
                                    >
                                        Voltar
                                    </button>
                                    <button
                                        onClick={handleSubmitFeedback}
                                        disabled={!reason.trim() || submitting}
                                        style={{
                                            flex: 2,
                                            height: '48px',
                                            padding: '0 16px',
                                            background: '#fff',
                                            borderRadius: '14px',
                                            color: '#000',
                                            fontSize: '11px',
                                            fontWeight: 900,
                                            textTransform: 'uppercase',
                                            border: 'none',
                                            cursor: 'pointer',
                                            opacity: submitting ? 0.3 : 1,
                                            transition: 'all 0.2s'
                                        }}
                                        className="shadow-xl shadow-white/5 hover:scale-[1.02] active:scale-95 disabled:hover:scale-100"
                                    >
                                        {submitting ? 'Gravando...' : 'Calibrar Inteligência'}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* STEP 3: SUBMITTED */}
                        {step === 'submitted' && (
                            <div style={{ padding: '60px 32px', textAlign: 'center' }} className="animate-in zoom-in-95 duration-500">
                                <div style={{ 
                                    width: '64px', 
                                    height: '64px', 
                                    borderRadius: '50%', 
                                    background: 'rgba(34,197,94,0.1)', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    margin: '0 auto 24px', 
                                    color: '#22c55e', 
                                    border: '1px solid rgba(34,197,94,0.2)',
                                    boxShadow: '0 0 30px rgba(34,197,94,0.1)'
                                }}>
                                    <CheckCircle2 size={32} />
                                </div>
                                <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: '-0.02em' }}>Sucesso Global</h3>
                                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: 0, lineHeight: '1.6' }}>
                                    Seu feedback foi processado. A IA calibrou os pesos neurais para este lead com base na sua orientação.
                                </p>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
