'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Clock, PlayCircle, AlertTriangle, MessageCircle } from 'lucide-react';

interface AtendimentoLead {
    uid: string;
    table_name: string;
    native_id: string;
    name: string | null;
    phone: string | null;
    vehicle_interest: string | null;
    status: string | null;
    atendimento_iniciado_em: string | null;
    assigned_consultant_id: string | null;
}

function formatAge(iso: string | null): { text: string; color: string; urgent: boolean } {
    if (!iso) return { text: '—', color: 'text-zinc-500', urgent: false };
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < 60) return { text: `${mins}min`, color: 'text-emerald-400', urgent: false };
    if (mins < 120) return { text: `${Math.floor(mins/60)}h ${mins%60}min`, color: 'text-emerald-300', urgent: false };
    if (mins < 240) return { text: `${Math.floor(mins/60)}h`, color: 'text-yellow-300', urgent: false };
    if (mins < 1440) return { text: `${Math.floor(mins/60)}h`, color: 'text-orange-400', urgent: true };
    const dias = Math.floor(mins / 1440);
    return { text: `${dias}d`, color: 'text-red-400', urgent: true };
}

export default function AtendimentoPage() {
    const router = useRouter();
    const supabase = createClient();
    const [leads, setLeads] = useState<AtendimentoLead[]>([]);
    const [loading, setLoading] = useState(true);
    const [consultantId, setConsultantId] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        const timeoutId = setTimeout(() => { if (alive) setLoading(false); }, 10000);

        (async () => {
            try {
                const { data: auth } = await supabase.auth.getUser();
                if (!auth?.user) { router.push('/login'); return; }

                const { data: cons } = await supabase
                    .from('consultants_manos_crm')
                    .select('id')
                    .eq('user_id', auth.user.id)
                    .maybeSingle();
                const cid = cons?.id || null;
                if (!alive) return;
                setConsultantId(cid);

                if (!cid) {
                    setLeads([]);
                    return;
                }

                const { data, error } = await supabase
                    .from('leads_unified_active')
                    .select('uid, table_name, native_id, name, phone, vehicle_interest, status, atendimento_iniciado_em, assigned_consultant_id')
                    .eq('assigned_consultant_id', cid)
                    .not('atendimento_iniciado_em', 'is', null)
                    .order('atendimento_iniciado_em', { ascending: true })
                    .limit(100);

                if (error) {
                    console.error('[Atendimento] erro:', error.message);
                }

                if (alive) setLeads((data as AtendimentoLead[]) || []);
            } catch (e) {
                console.error('[Atendimento] exception:', e);
            } finally {
                clearTimeout(timeoutId);
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; clearTimeout(timeoutId); };
    }, [supabase, router]);

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <div className="mb-6">
                <h1 className="text-3xl font-black text-white flex items-center gap-3">
                    <PlayCircle className="w-8 h-8 text-blue-400" />
                    Atendimento
                </h1>
                <p className="text-sm text-zinc-400 mt-1">Leads que você assumiu — finalize, justifique ou agende cada um.</p>
            </div>

            {loading ? (
                <p className="text-zinc-400">Carregando...</p>
            ) : leads.length === 0 ? (
                <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800 p-8 text-center">
                    <p className="text-lg text-zinc-300">Nenhum lead em atendimento.</p>
                    <p className="text-sm text-zinc-500 mt-2">
                        Quando você clicar "INICIAR ATENDIMENTO" num lead, ele aparece aqui pra você acompanhar.
                    </p>
                    <Link href="/inbox" className="inline-block mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold">
                        Voltar pro Inbox →
                    </Link>
                </div>
            ) : (
                <ul className="space-y-3">
                    {leads.map(lead => {
                        const age = formatAge(lead.atendimento_iniciado_em);
                        return (
                            <li key={lead.uid}>
                                <Link
                                    href={`/lead/${encodeURIComponent(lead.uid)}`}
                                    className={`block rounded-xl border bg-zinc-900/40 hover:bg-zinc-900/70 transition p-4 ${age.urgent ? 'border-orange-700/50 ring-1 ring-orange-500/20' : 'border-zinc-800'}`}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="text-lg font-bold text-white truncate">{lead.name || 'Sem nome'}</h3>
                                                {age.urgent && <AlertTriangle className="w-4 h-4 text-orange-400" />}
                                            </div>
                                            <div className="text-sm text-zinc-400 truncate">
                                                {lead.vehicle_interest || lead.phone || '—'}
                                            </div>
                                            <div className="text-xs text-zinc-500 mt-1">
                                                Status: {lead.status || '—'}
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Atendendo há</div>
                                            <div className={`text-lg font-bold flex items-center gap-1.5 justify-end ${age.color}`}>
                                                <Clock className="w-4 h-4" /> {age.text}
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
