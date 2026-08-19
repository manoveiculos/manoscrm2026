'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, UserCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Consultant {
    id: string;
    name: string;
    email?: string;
    role?: string;
    recebe_leads?: boolean;
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
    const [mounted, setMounted] = useState(false);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => { setMounted(true); }, []);

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

    // Lista pela rota server-side (service_role): a RLS de consultants_manos_crm
    // pode esconder gente do client e o dropdown ficava incompleto.
    useEffect(() => {
        if (!isAdmin || !showMenu) return;
        const fetchAll = async () => {
            try {
                const res = await fetch('/api/lead/consultants');
                const json = await res.json();
                if (json?.success && Array.isArray(json.consultants)) {
                    // Time da roleta primeiro: em ordem alfabética pura, Victor,
                    // Sergio e Wilson caem no fim da lista — quem transfere na
                    // pressa nem chega neles.
                    const ordenada = [...json.consultants].sort((a: Consultant, b: Consultant) => {
                        const pa = a.recebe_leads ? 0 : 1;
                        const pb = b.recebe_leads ? 0 : 1;
                        if (pa !== pb) return pa - pb;
                        return (a.name || '').localeCompare(b.name || '', 'pt-BR');
                    });
                    setAllConsultants(ordenada);
                }
            } catch (e) {
                console.error('[ConsultantBadge] falha ao listar consultores:', e);
            }
        };
        fetchAll();
    }, [isAdmin, showMenu]);

    const calculatePosition = useCallback(() => {
        if (!buttonRef.current) return;
        const rect = buttonRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const dropdownHeight = 380; // cabeçalho + max-h-80 da lista
        const openUpward = rect.bottom + dropdownHeight > viewportHeight;
        // Abrindo pra cima, o topo pode ficar negativo e os primeiros nomes
        // saem da tela — justamente os do time de vendas, que vêm primeiro.
        const top = openUpward
            ? Math.max(8, rect.top - dropdownHeight)
            : Math.min(rect.bottom + 6, viewportHeight - dropdownHeight - 8);

        setDropdownStyle({
            position: 'fixed',
            top: Math.max(8, top),
            left: Math.max(0, rect.right - 208),
            width: 208,
            zIndex: 99999,
        });
    }, []);

    const handleToggle = () => {
        if (!isAdmin) return;
        calculatePosition();
        setShowMenu(prev => !prev);
    };

    // Fecha ao rolar a PÁGINA (o menu é position:fixed e ficaria solto no ar).
    // O listener é capture, então também pega o scroll de dentro do próprio
    // dropdown — sem esta checagem, tentar rolar a lista fechava o menu e nunca
    // se chegava nos últimos nomes da ordem alfabética.
    useEffect(() => {
        if (!showMenu) return;
        const close = (e?: Event) => {
            const alvo = e?.target as Node | null;
            if (alvo && dropdownRef.current?.contains(alvo)) return; // scroll interno: deixa rolar
            setShowMenu(false);
        };
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        return () => {
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
        };
    }, [showMenu]);

    /**
     * Transferência via /api/lead/transfer (service_role no servidor).
     *
     * Antes isto dava UPDATE direto do client em leads_master/leads_manos_crm —
     * nunca em leads_distribuicao_crm_26, que é onde está a maior parte dos
     * leads. Como o erro não era checado, a UI dizia "trocado" e nada tinha
     * mudado no banco. A rota resolve a tabela certa, sincroniza a roleta e
     * devolve erro de verdade quando não encontra o lead.
     */
    const handleSelect = async (c: Consultant) => {
        setSaving(true);
        try {
            const res = await fetch('/api/lead/transfer', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lead_id: lead.id,
                    lead_table: lead.source_table || lead.table_name || undefined,
                    target_consultant_id: c.id,
                }),
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok || !data.success) {
                alert(`Não foi possível transferir: ${data.error || 'tente novamente'}`);
                return;
            }

            setConsultant(c);
            setShowMenu(false);
            onUpdate?.(c.id, c.name);
        } catch (e: any) {
            alert(`Erro de conexão ao transferir: ${e?.message || 'tente novamente'}`);
        } finally {
            setSaving(false);
        }
    };

    const initials = consultant?.name
        ? consultant.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
        : '?';

    return (
        <div className="relative">
            <button
                ref={buttonRef}
                onClick={handleToggle}
                title={consultant?.name || 'Sem consultor'}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border transition-all text-[11px] font-semibold ${
                    isAdmin
                        ? 'border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] cursor-pointer'
                        : 'border-white/[0.06] bg-white/[0.03] cursor-default'
                }`}
            >
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

            {/* AnimatePresence DENTRO do portal */}
            {mounted && createPortal(
                <AnimatePresence>
                    {showMenu && (
                        <>
                            <div
                                style={{ position: 'fixed', inset: 0, zIndex: 99998 }}
                                onClick={() => setShowMenu(false)}
                            />
                            <motion.div
                                ref={dropdownRef}
                                key="consultant-dropdown"
                                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 6, scale: 0.97 }}
                                transition={{ duration: 0.15 }}
                                style={dropdownStyle}
                                className="bg-[#141418] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden"
                            >
                                <div className="px-3 py-2 border-b border-white/[0.06]">
                                    <p className="text-[10px] text-white/30 uppercase tracking-widest font-semibold">Alterar consultor</p>
                                </div>
                                <div className="max-h-80 overflow-y-auto overscroll-contain">
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
                                                    <p className="text-white/30 text-[10px] truncate">
                                                        {c.recebe_leads ? '🎯 na roleta' : (c.role || 'consultor')}
                                                    </p>
                                                </div>
                                                {consultant?.id === c.id && (
                                                    <Check size={11} className="text-red-400 shrink-0" />
                                                )}
                                            </button>
                                        ))
                                    )}
                                </div>
                            </motion.div>
                        </>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
};
