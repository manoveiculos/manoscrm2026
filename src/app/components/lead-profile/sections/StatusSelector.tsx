import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ALL_STATUS, getStatusConfig, normalizeStatus } from '@/constants/status';
import { ChevronDown, Check } from 'lucide-react';
import { ScoreBadgeWithFeedback } from '../components/ScoreBadgeWithFeedback';

interface StatusSelectorProps {
    lead: any;
    currentStatus: string;
    onChange: (newStatus: string, reason?: string) => void;
    scoreInfo: { color: string; label: string };
    displayScore: number;
    userName: string;
    onScoreUpdated?: () => void;
}

export const StatusSelector: React.FC<StatusSelectorProps> = ({
    lead,
    currentStatus,
    onChange,
    scoreInfo,
    displayScore,
    userName,
    onScoreUpdated
}) => {
    const [showStatusMenu, setShowStatusMenu] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
    const [pendingStatus, setPendingStatus] = useState<string | null>(null);
    const [lossReason, setLossReason] = useState('');
    const buttonRef = useRef<HTMLButtonElement>(null);
    const normalizedId = normalizeStatus(currentStatus);
    const statusConfig = getStatusConfig(currentStatus);

    useEffect(() => { setMounted(true); }, []);

    const calculatePosition = useCallback(() => {
        if (!buttonRef.current) return;
        const rect = buttonRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const dropdownHeight = Math.min(ALL_STATUS.length * 40 + 12, 400);
        const openUpward = rect.bottom + dropdownHeight > viewportHeight;

        setDropdownStyle({
            position: 'fixed',
            top: openUpward ? rect.top - dropdownHeight : rect.bottom + 6,
            left: rect.left,
            width: 208,
            zIndex: 99999,
        });
    }, []);

    const handleToggle = () => {
        calculatePosition();
        setShowStatusMenu(prev => !prev);
    };

    useEffect(() => {
        if (!showStatusMenu) return;
        const close = () => setShowStatusMenu(false);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        return () => {
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
        };
    }, [showStatusMenu]);

    return (
        <div className="flex gap-3 items-center">
            <div className="relative">
                <button
                    ref={buttonRef}
                    onClick={handleToggle}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider hover:brightness-110 transition-all border"
                    style={{
                        backgroundColor: `${statusConfig.color}12`,
                        borderColor: `${statusConfig.color}25`,
                        color: statusConfig.color || '#ffffff'
                    }}
                >
                    <span>{statusConfig.icon}</span>
                    {statusConfig.label}
                    <ChevronDown size={11} className="ml-0.5 opacity-60" />
                </button>

                {/* AnimatePresence DENTRO do portal */}
                {mounted && createPortal(
                    <AnimatePresence>
                        {showStatusMenu && (
                            <>
                                <div
                                    style={{ position: 'fixed', inset: 0, zIndex: 99998 }}
                                    onClick={() => setShowStatusMenu(false)}
                                />
                                <motion.div
                                    key="status-dropdown"
                                    initial={{ opacity: 0, y: 6, scale: 0.97 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 6, scale: 0.97 }}
                                    transition={{ duration: 0.15 }}
                                    style={dropdownStyle}
                                    className="bg-[#141418] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden"
                                >
                                    {!pendingStatus ? (
                                        ALL_STATUS.map(s => (
                                            <button
                                                key={s.id}
                                                onClick={() => {
                                                    if (s.id === 'perdido' && s.id !== normalizedId) {
                                                        setPendingStatus('perdido');
                                                    } else {
                                                        onChange(s.id);
                                                        setShowStatusMenu(false);
                                                    }
                                                }}
                                                className="w-full text-start px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider hover:bg-white/[0.04] transition-colors flex items-center gap-3 border-b border-white/[0.04] last:border-0"
                                                style={{ color: s.id === normalizedId ? s.color : 'rgba(255,255,255,0.35)' }}
                                            >
                                                <span className="text-sm opacity-70">{s.icon}</span>
                                                {s.label}
                                                {s.id === normalizedId && <Check size={10} className="ml-auto" />}
                                            </button>
                                        ))
                                    ) : (
                                        <div className="p-4 flex flex-col gap-3">
                                            <div className="flex items-center gap-2 text-red-400 text-[10px] font-bold uppercase tracking-widest mb-1">
                                                <span>💀</span> Motivo da Perda
                                            </div>
                                            <textarea
                                                autoFocus
                                                value={lossReason}
                                                onChange={(e) => setLossReason(e.target.value)}
                                                placeholder="Por que este lead foi perdido? (Ex: comprou em outra loja, sem crédito...)"
                                                className="w-full bg-white/[0.03] border border-white/10 rounded-lg p-3 text-[11px] text-white outline-none focus:border-red-500/50 min-h-[80px] resize-none"
                                            />
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => {
                                                        setPendingStatus(null);
                                                        setLossReason('');
                                                    }}
                                                    className="flex-1 py-2 rounded-lg text-[10px] font-bold uppercase bg-white/5 hover:bg-white/10 transition-colors"
                                                >
                                                    Voltar
                                                </button>
                                                <button
                                                    disabled={!lossReason.trim()}
                                                    onClick={() => {
                                                        onChange('perdido', lossReason);
                                                        setPendingStatus(null);
                                                        setLossReason('');
                                                        setShowStatusMenu(false);
                                                    }}
                                                    className="flex-3 py-2 rounded-lg text-[10px] font-bold uppercase bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 transition-colors disabled:opacity-30"
                                                >
                                                    Confirmar Perda
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            </>
                        )}
                    </AnimatePresence>,
                    document.body
                )}
            </div>

            <ScoreBadgeWithFeedback
                lead={lead}
                score={displayScore}
                scoreLabel={scoreInfo.label.toLowerCase()}
                userName={userName}
                onScoreUpdated={onScoreUpdated}
            />
        </div>
    );
};
