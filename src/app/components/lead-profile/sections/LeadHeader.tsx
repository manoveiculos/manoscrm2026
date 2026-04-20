'use client';
import React, { useState } from 'react';
import { Lead } from '../types';
import { MessageCircle, Facebook, Instagram, Search, Globe, Car, LayoutGrid, Smartphone, MessageSquare, Pencil, Check, X } from 'lucide-react';
import { formatPhoneBR } from '@/lib/shared_utils/helpers';

interface LeadHeaderProps {
    lead: Lead;
    isAdmin?: boolean;
    onSave: (field: string, value: string) => Promise<void>;
    score?: number;
    scoreInfo?: { color: string; label: string };
}

const SOURCE_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
    facebook:  { icon: Facebook,     color: '#1877F2', label: 'Facebook'  },
    fb:        { icon: Facebook,     color: '#1877F2', label: 'Facebook'  },
    instagram: { icon: Instagram,    color: '#E4405F', label: 'Instagram' },
    ig:        { icon: Instagram,    color: '#E4405F', label: 'Instagram' },
    whatsapp:  { icon: MessageSquare, color: '#25D366', label: 'WhatsApp' },
    wpp:       { icon: MessageSquare, color: '#25D366', label: 'WhatsApp' },
    google:    { icon: Search,       color: '#EA4335', label: 'Google'    },
    olx:       { icon: LayoutGrid,   color: '#6E0AD6', label: 'OLX'       },
    icarros:   { icon: Car,          color: '#FF7020', label: 'iCarros'   },
    crm26:     { icon: Smartphone,   color: '#dc2626', label: 'V1'        },
};

function getSourceConfig(source?: string) {
    if (!source) return { icon: Globe, color: '#64748b', label: 'Web' };
    const key = Object.keys(SOURCE_CONFIG).find(k => source.toLowerCase().includes(k));
    return key ? SOURCE_CONFIG[key] : { icon: Globe, color: '#64748b', label: source };
}

function InlineEdit({
    value,
    onSave,
    isAdmin,
    renderView,
}: {
    value: string;
    onSave: (v: string) => Promise<void>;
    isAdmin?: boolean;
    renderView: (onClick: () => void) => React.ReactNode;
}) {
    const [editing, setEditing] = useState(false);
    const [tmp, setTmp] = useState(value);
    const [saving, setSaving] = useState(false);

    const commit = async () => {
        setSaving(true);
        await onSave(tmp);
        setSaving(false);
        setEditing(false);
    };

    if (!isAdmin || !editing) return <>{renderView(() => isAdmin && setEditing(true))}</>;

    return (
        <div className="flex items-center gap-1.5 flex-1">
            <input
                autoFocus
                value={tmp}
                onChange={e => setTmp(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
                className="flex-1 bg-white/[0.06] border border-white/20 rounded-lg px-2 py-1 text-white text-[13px] outline-none min-w-0"
            />
            <button onClick={commit} disabled={saving} className="h-6 w-6 flex items-center justify-center rounded-md bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white transition-all">
                {saving ? '…' : <Check size={11} />}
            </button>
            <button onClick={() => setEditing(false)} className="h-6 w-6 flex items-center justify-center rounded-md bg-white/[0.05] text-white/30 hover:text-white/60 transition-all">
                <X size={11} />
            </button>
        </div>
    );
}

export const LeadHeader: React.FC<LeadHeaderProps> = ({ lead, isAdmin, onSave, score = 0, scoreInfo }) => {
    const src = getSourceConfig(lead.source || lead.origem);
    const SrcIcon = src.icon;

    // Score bar color
    const barColor = score >= 70 ? '#E31E24' : score >= 40 ? '#F59E0B' : '#55555F';

    return (
        <div className="flex items-start gap-3 mb-4">
            {/* Avatar — ícone da origem */}
            <div
                className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0 border"
                style={{ backgroundColor: `${src.color}18`, borderColor: `${src.color}30` }}
            >
                <SrcIcon size={24} style={{ color: src.color }} />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 space-y-1">
                {/* Nome */}
                <InlineEdit
                    value={lead.name}
                    isAdmin={isAdmin}
                    onSave={v => onSave('nome', v)}
                    renderView={(onClick) => (
                        <div className="flex items-center gap-2 group" onClick={onClick}>
                            <h2 className={`text-[17px] font-bold text-white leading-tight truncate ${isAdmin ? 'cursor-pointer' : ''}`}>
                                {lead.name}
                            </h2>
                            {isAdmin && (
                                <Pencil size={11} className="text-white/20 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                            )}
                        </div>
                    )}
                />

                {/* Telefone + origem */}
                <div className="flex items-center gap-3 flex-wrap">
                    <InlineEdit
                        value={lead.phone || ''}
                        isAdmin={isAdmin}
                        onSave={v => onSave('telefone', v)}
                        renderView={(onClick) => (
                            <div className="flex items-center gap-1.5 group" onClick={onClick}>
                                <a
                                    href={`https://wa.me/55${lead.phone?.replace(/\D/g, '')}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={async (e) => {
                                        e.stopPropagation();
                                        // Registro silencioso do touch
                                        try {
                                            await fetch('/api/leads/touch', {
                                                method: 'POST',
                                                body: JSON.stringify({ leadId: lead.id })
                                            });
                                        } catch (err) {
                                            console.warn('Failed to record touch:', err);
                                        }
                                    }}
                                    className="flex items-center gap-1.5 text-[13px] text-white/55 hover:text-emerald-400 transition-colors"
                                >
                                    <MessageCircle size={13} className="text-emerald-500 shrink-0" />
                                    {formatPhoneBR(lead.phone || '')}
                                </a>
                                {isAdmin && (
                                    <Pencil size={10} className="text-white/20 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" />
                                )}
                            </div>
                        )}
                    />

                    {/* Badge origem */}
                    <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border"
                        style={{ color: src.color, backgroundColor: `${src.color}12`, borderColor: `${src.color}25` }}
                    >
                        <SrcIcon size={9} />
                        {src.label}
                    </span>
                </div>

                {/* Score bar */}
                {score > 0 && (
                    <div className="flex items-center gap-2 pt-0.5">
                        <div className="flex-1 h-1 bg-white/[0.06] rounded-full overflow-hidden max-w-[120px]">
                            <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${score}%`, backgroundColor: barColor }}
                            />
                        </div>
                        <span className="text-[11px] font-semibold tabular-nums" style={{ color: barColor }}>
                            {score}%
                        </span>
                        {scoreInfo && (
                            <span className="text-[10px] font-medium px-1.5 py-px rounded" style={{ color: scoreInfo.color, backgroundColor: `${scoreInfo.color}12` }}>
                                {scoreInfo.label}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
