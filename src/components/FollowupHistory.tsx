'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { History, Check, X, Clock, Bot, Send, MessageSquare } from 'lucide-react';

/**
 * FollowupHistory — aba/bloco com o histórico de follow-ups da IA pro lead.
 *
 * Mostra cada tentativa (1ª, 2ª, 3ª) da IA com:
 *   - Quando enviou
 *   - Qual abordagem (soft / agendar / closing)
 *   - Veículo ofertado + preço real do estoque
 *   - Mensagem completa
 *   - Se cliente respondeu (e o que respondeu)
 *
 * Realtime: novas linhas aparecem ao vivo.
 */

interface FollowupRow {
    id: string;
    attempt_number: number;
    mensagem_enviada: string;
    resposta_cliente: string | null;
    veiculo_ofertado: string | null;
    preco_real_estoque: number | null;
    abordagem: string | null;
    instance_used: string | null;
    enviado_em: string;
    respondido_em: string | null;
}

const ABORDAGEM_LABELS: Record<string, { label: string; color: string }> = {
    soft: { label: 'Lembrete leve', color: 'bg-blue-900/40 text-blue-200 border-blue-700' },
    agendar: { label: 'Convite p/ visita', color: 'bg-amber-900/40 text-amber-200 border-amber-700' },
    closing: { label: 'Última chance', color: 'bg-red-900/40 text-red-200 border-red-700' },
    urgencia: { label: 'Urgência', color: 'bg-orange-900/40 text-orange-200 border-orange-700' },
    preco: { label: 'Argumento preço', color: 'bg-purple-900/40 text-purple-200 border-purple-700' },
};

function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
}

function formatPrice(n: number | null): string {
    if (!n) return '';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

interface Props {
    leadNativeId: string; // ex: '08f805ad-b410-...' ou '1611'
}

export default function FollowupHistory({ leadNativeId }: Props) {
    const supabase = useMemo(() => createClient(), []);
    const [rows, setRows] = useState<FollowupRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let alive = true;
        async function load() {
            const { data } = await supabase
                .from('historico_followup')
                .select('id, attempt_number, mensagem_enviada, resposta_cliente, veiculo_ofertado, preco_real_estoque, abordagem, instance_used, enviado_em, respondido_em')
                .eq('lead_id', leadNativeId)
                .order('enviado_em', { ascending: true })
                .limit(20);
            if (alive) {
                setRows((data as FollowupRow[]) || []);
                setLoading(false);
            }
        }
        if (leadNativeId) load();
        return () => { alive = false; };
    }, [leadNativeId, supabase]);

    // Realtime: novo follow-up disparado OU resposta de cliente registrada
    useEffect(() => {
        if (!leadNativeId) return;
        const channel = supabase
            .channel(`followup-history-${leadNativeId}`)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'historico_followup', filter: `lead_id=eq.${leadNativeId}` },
                (payload: any) => {
                    if (payload.eventType === 'INSERT' && payload.new) {
                        setRows(prev => prev.some(r => r.id === payload.new.id) ? prev : [...prev, payload.new]);
                    } else if (payload.eventType === 'UPDATE' && payload.new) {
                        setRows(prev => prev.map(r => r.id === payload.new.id ? payload.new : r));
                    }
                }
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [leadNativeId, supabase]);

    if (loading) {
        return (
            <div className="bg-zinc-900 rounded-lg p-4 border-l-4 border-zinc-700">
                <div className="text-xs text-gray-500">Carregando histórico de follow-up…</div>
            </div>
        );
    }

    if (rows.length === 0) {
        return (
            <div className="bg-zinc-900 rounded-lg p-4 border-l-4 border-zinc-800">
                <h3 className="text-sm font-semibold text-gray-400 flex items-center gap-2 mb-1">
                    <History className="w-4 h-4" /> Histórico de Follow-up IA
                </h3>
                <p className="text-xs text-gray-600">Nenhuma mensagem automática enviada ainda.</p>
            </div>
        );
    }

    const responded = rows.some(r => r.respondido_em);
    const headerColor = responded ? 'border-emerald-600' : 'border-purple-600';

    return (
        <div className={`bg-zinc-900 rounded-lg p-4 border-l-4 ${headerColor}`}>
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <History className="w-4 h-4 text-purple-400" />
                    Histórico de Follow-up IA
                </h3>
                <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-gray-400">
                        {rows.length} de 3 tentativas
                    </span>
                    {responded && (
                        <span className="bg-emerald-900/40 text-emerald-300 px-2 py-0.5 rounded font-bold">
                            ✅ CLIENTE RESPONDEU
                        </span>
                    )}
                </div>
            </div>

            <ol className="space-y-3">
                {rows.map((r) => {
                    const abord = r.abordagem ? ABORDAGEM_LABELS[r.abordagem] : null;
                    return (
                        <li key={r.id} className="relative pl-7">
                            {/* Linha vertical timeline */}
                            <div className="absolute left-2 top-6 bottom-0 w-px bg-zinc-700" />

                            {/* Bolinha numerada */}
                            <div className="absolute left-0 top-0 w-5 h-5 rounded-full bg-purple-700 text-white text-[10px] font-bold flex items-center justify-center">
                                {r.attempt_number}
                            </div>

                            {/* Card da tentativa */}
                            <div className="bg-zinc-800/50 rounded p-3">
                                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                                    <span className="text-[10px] text-gray-400 flex items-center gap-1">
                                        <Send className="w-3 h-3" /> Tentativa {r.attempt_number} · {formatDateTime(r.enviado_em)}
                                    </span>
                                    {abord && (
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded border ${abord.color}`}>
                                            {abord.label}
                                        </span>
                                    )}
                                </div>

                                {/* Mensagem da IA */}
                                <div className="bg-blue-950/40 rounded p-2 text-sm text-blue-100 mb-2 flex items-start gap-2">
                                    <Bot className="w-3.5 h-3.5 mt-0.5 text-blue-400 shrink-0" />
                                    <span>{r.mensagem_enviada}</span>
                                </div>

                                {/* Veículo + preço (se ofertou) */}
                                {(r.veiculo_ofertado || r.preco_real_estoque) && (
                                    <div className="text-[11px] text-gray-400 mb-2 flex flex-wrap gap-2">
                                        {r.veiculo_ofertado && (
                                            <span className="bg-zinc-900 rounded px-2 py-0.5">🚗 {r.veiculo_ofertado}</span>
                                        )}
                                        {r.preco_real_estoque && (
                                            <span className="bg-zinc-900 rounded px-2 py-0.5">💰 {formatPrice(r.preco_real_estoque)}</span>
                                        )}
                                    </div>
                                )}

                                {/* Resposta do cliente */}
                                {r.respondido_em ? (
                                    <div className="bg-emerald-950/40 rounded p-2 text-sm text-emerald-100 flex items-start gap-2">
                                        <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-emerald-400 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[10px] text-emerald-400 mb-0.5 flex items-center gap-1">
                                                <Check className="w-3 h-3" /> Cliente respondeu em {formatDateTime(r.respondido_em)}
                                            </div>
                                            <div>{r.resposta_cliente || <em className="text-gray-500">(viu mensagem mas resposta não capturada)</em>}</div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-[11px] text-gray-500 flex items-center gap-1">
                                        <Clock className="w-3 h-3" /> Aguardando resposta…
                                    </div>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ol>

            {rows.length >= 3 && !responded && (
                <div className="mt-3 text-[11px] text-amber-300/80 flex items-start gap-1.5 bg-amber-950/30 rounded p-2 border border-amber-800/50">
                    <X className="w-3 h-3 mt-0.5 shrink-0" />
                    <span>Limite de 3 tentativas atingido sem resposta. Lead marcado como <strong>frio</strong> — IA não enviará mais mensagens automáticas.</span>
                </div>
            )}
        </div>
    );
}
