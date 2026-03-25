'use client';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, UserCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Consultant {
    id: string;
    name: string;
    email: string;
    role?: string;
}

interface ConsultantBadgeProps {
    lead: any;
    isAdmin?: boolean;
    onUpdate?: (consultantId: string, consultantName: string) => void;
}

export const ConsultantBadge: React.FC<ConsultantBadgeProps> = ({ lead, isAdmin, onUpdate }) => {
    const supabase = createClient();
    const [consultant, setConsultant] = useState<Consultant | null>(null);
    const [allConsultants, setAllConsultants] = useState<Consultant[]>([]);
    const [showMenu, setShowMenu] = useState(false);
    const [saving, setSaving] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Fetch consultant assigned to lead
    useEffect(() => {
        const fetchConsultant = async () => {
            const rawId = lead.assigned_consultant_id;
            if (!rawId) return;
            const cleanId = rawId.toString().replace(/^(main_|crm26_|dist_|lead_|crm25_)/, '');
            const { data } = await supabase
                .from('consultants_manos_crm')
                .select('id, name, email, role')
                .eq('id', cleanId)
                .single();
            if (data) setConsultant(data);
        };
        fetchConsultant();
    }, [lead.assigned_consultant_id]);

    // Fetch all consultants for admin dropdown
    useEffect(() => {
        if (!isAdmin || !showMenu) return;
        const fetchAll = async () => {
            const { data } = await supabase
                .from('consultants_manos_crm')
                .select('id, name, email, role')
                .order('name');
            if (data) setAllConsultants(data);
        };
        fetchAll();
    }, [isAdmin, showMenu]);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowMenu(false);
            }
        };
        if (showMenu) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showMenu]);

    const handleSelect = async (c: Consultant) => {
        setSaving(true);
        try {
            const cleanLeadId = lead.id.toString().replace(/^(main_|crm26_|dist_|lead_|crm25_)/, '');
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(cleanLeadId);
            const tables = isUUID
                ? ['leads_master', 'leads_manos_crm']
                : ['leads_manos_crm', 'leads_master'];

            for (const table of tables) {
                await supabase
                    .from(table)
                    .update({ assigned_consultant_id: c.id })
                    .eq('id', cleanLeadId);
            }

            setConsultant(c);
            setShowMenu(false);
            onUpdate?.(c.id, c.name);
        } finally {
            setSaving(false);
        }
    };

    const initials = consultant?.name
        ? consultant.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
        : '?';

    return (
        <div className="relative" ref={menuRef}>
            <button
                onClick={() => isAdmin && setShowMenu(prev => !prev)}
                title={consultant?.name || 'Sem consultor'}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border transition-all text-[11px] font-semibold ${
                    isAdmin
                        ? 'border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] cursor-pointer'
                        : 'border-white/[0.06] bg-white/[0.03] cursor-default'
                }`}
            >
                {/* Avatar miniatura */}
                <div className="h-5 w-5 rounded-full bg-red-600/20 border border-red-500/25 flex items-center justify-center text-[9px] font-bold text-red-400 shrink-0">
                    {consultant ? initials : <UserCircle2 size={12} className="text-white/30" />}
                </div>
                <span className="text-white/60 max-w-[80px] truncate">
                    {consultant?.name?.split(' ')[0] || 'Sem consultor'}
                </span>
                {isAdmin && (
                    <ChevronDown size={10} className="text-white/30 shrink-0" />
                )}
            </button>

            <AnimatePresence>
                {showMenu && (
                    <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full right-0 mt-1.5 w-52 bg-[#141418] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden z-[70]"
                    >
                        <div className="px-3 py-2 border-b border-white/[0.06]">
                            <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold">Alterar consultor</p>
                        </div>
                        <div className="max-h-60 overflow-y-auto">
                            {allConsultants.length === 0 ? (
                                <p className="px-4 py-3 text-[11px] text-white/30">Carregando...</p>
                            ) : (
                                allConsultants.map(c => (
                                    <button
                                        key={c.id}
                                        onClick={() => !saving && handleSelect(c)}
                                        disabled={saving}
                                        className="w-full text-start px-4 py-2.5 text-[12px] hover:bg-white/[0.04] transition-colors flex items-center gap-3 border-b border-white/[0.04] last:border-0"
                                    >
                                        <div className="h-6 w-6 rounded-full bg-red-600/20 border border-red-500/20 flex items-center justify-center text-[9px] font-bold text-red-400 shrink-0">
                                            {c.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white/80 font-medium truncate">{c.name}</p>
                                            <p className="text-white/30 text-[10px] truncate">{c.role || 'consultor'}</p>
                                        </div>
                                        {consultant?.id === c.id && (
                                            <Check size={11} className="text-red-400 shrink-0" />
                                        )}
                                    </button>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
