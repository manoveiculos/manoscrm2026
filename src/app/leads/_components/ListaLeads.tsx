'use client';

import { useState } from 'react';
import { Zap, Target } from 'lucide-react';
import type { Lead, LeadStatus } from '@/lib/types';
import { getStatusConfig } from '@/constants/status';
import { formatPhoneBR } from '@/lib/shared_utils/helpers';
import { safeDisplayName, safePhone, safeWhatsAppUrl, safeFirstName } from '@/lib/shared_utils/safeLead';
import { MoveMenu } from '@/components/shared_leads/MoveMenu';
import { ROTULO_GRUPO, type Enriquecimento, type GrupoUrgencia } from '@/lib/leads/urgencia';

export interface LinhaLead { lead: Lead; grupo: GrupoUrgencia }

const COR_GRUPO: Record<GrupoUrgencia, string> = {
    esperando_loja: 'bg-red-600/20 text-red-300 border-red-500/30',
    visita: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30',
    retorno: 'bg-amber-600/20 text-amber-300 border-amber-500/30',
    novo_hoje: 'bg-blue-600/20 text-blue-300 border-blue-500/30',
    sem_contato: 'bg-zinc-700/40 text-zinc-300 border-zinc-600/40',
    normal: '', encerrado: 'bg-zinc-800 text-zinc-500 border-zinc-700',
};

const dataCurta = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';
const horaCurta = (iso?: string | null) => iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';

const DE: Record<string, string> = { cliente: 'Cliente', laura: 'Laura', vendedor: 'Vendedor' };

const ha = (iso: string | null | undefined) => {
    if (!iso) return '';
    const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
    if (min < 1) return 'agora';
    if (min < 60) return `${min} min`;
    if (min < 1440) return `${Math.floor(min / 60)} h`;
    return `${Math.floor(min / 1440)} d`;
};

/** Temperatura simples no lugar do "score %" (que quase não separava os leads). */
function temperatura(lead: Lead): { rotulo: string; cls: string } | null {
    const s = Number(lead.ai_score) || 0;
    if (s >= 80) return { rotulo: 'Quente', cls: 'text-red-300' };
    if (s >= 60) return { rotulo: 'Morno', cls: 'text-amber-300' };
    if (s > 0) return { rotulo: 'Frio', cls: 'text-sky-300' };
    return null;
}

interface Props {
    linhas: LinhaLead[];
    enriq: (lead: Lead) => Enriquecimento | undefined;
    consultants: { id: string; name: string }[];
    onView: (lead: Lead) => void;
    onStatusChange: (leadId: string, status: LeadStatus) => void;
}

/**
 * Lista de leads da aba Leads (Fase B): o que quer, onde está, quem falou por último, de quem é.
 * A ordem vem pronta (por urgência). Clique na linha = gaveta de resumo.
 */
export function ListaLeads({ linhas, enriq, consultants, onView, onStatusChange }: Props) {
    const [menu, setMenu] = useState<string | null>(null);

    if (!linhas.length) {
        return (
            <div className="py-16 text-center bg-[#141418] border border-white/[0.07] rounded-2xl">
                <Target size={20} className="mx-auto mb-3 text-white/10" />
                <p className="text-[11px] text-white/30 uppercase tracking-widest">Nenhum lead nesse filtro</p>
            </div>
        );
    }

    const dono = (l: Lead) => {
        const id = String(l.assigned_consultant_id || '').replace(/^(main_|crm26_|dist_|lead_|crm25_|master_|compra_)/i, '').toLowerCase().trim();
        return consultants.find(c => c.id.toLowerCase().trim() === id)?.name || l.consultant_name || l.vendedor || '';
    };
    const whats = (e: React.MouseEvent, l: Lead) => {
        e.stopPropagation();
        const url = safeWhatsAppUrl(l.phone, `Olá ${safeFirstName(l.name)}, tudo bem?`);
        if (url) window.open(url, '_blank');
    };
    const interesse = (l: Lead) => (l.vehicle_interest && l.vehicle_interest !== '---' && !/não especificado|analisar perfil/i.test(l.vehicle_interest)) ? l.vehicle_interest : null;

    const Selo = ({ grupo, e }: { grupo: GrupoUrgencia; e?: Enriquecimento }) => (
        <div className="flex flex-col gap-1 min-w-0">
            {grupo !== 'normal' && grupo !== 'encerrado' && (
                <span className={`self-start text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-md border ${COR_GRUPO[grupo]}`}>{ROTULO_GRUPO[grupo]}</span>
            )}
            {e?.rotuloSituacao ? <span className="text-[11px] text-white/50 truncate">{e.rotuloSituacao}</span>
                : grupo === 'normal' ? <span className="text-[11px] text-white/25">{e ? 'Sem análise' : 'Sem conversa'}</span> : null}
        </div>
    );

    const Ultima = ({ e }: { e?: Enriquecimento }) => e?.ultimaDe ? (
        <div className="min-w-0">
            <p className="text-[11px] text-white/45"><b className={e.ultimaDe === 'cliente' ? 'text-red-300' : 'text-white/70'}>{DE[e.ultimaDe]}</b> · há {ha(e.ultimaEm)}</p>
            {e.ultimaTexto && <p className="text-[12px] text-white/60 truncate">{e.ultimaTexto}</p>}
        </div>
    ) : <span className="text-[11px] text-white/20">—</span>;

    return (
        <div className="w-full">
            {/* celular: cartões */}
            <div className="flex flex-col gap-2 md:hidden">
                {linhas.map(({ lead, grupo }) => {
                    const e = enriq(lead); const st = getStatusConfig(lead.status || ''); const t = temperatura(lead);
                    return (
                        <div key={lead.id} onClick={() => onView(lead)} className="bg-[#141418] border border-white/[0.07] rounded-xl p-3 space-y-2 cursor-pointer active:bg-white/[0.04]">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-[14px] font-semibold text-white truncate">{safeDisplayName(lead.name)}</p>
                                    <p className="text-[11px] text-white/35 truncate">{formatPhoneBR(safePhone(lead.phone))}{interesse(lead) ? ` · ${interesse(lead)}` : ''}</p>
                                </div>
                                <button onClick={ev => whats(ev, lead)} aria-label="Chamar no WhatsApp" className="shrink-0 h-9 w-9 rounded-lg bg-emerald-600/15 border border-emerald-500/25 text-emerald-300 flex items-center justify-center"><Zap size={14} /></button>
                            </div>
                            <Selo grupo={grupo} e={e} />
                            <Ultima e={e} />
                            <div className="flex items-center justify-between text-[10px] uppercase tracking-wide">
                                <span style={{ color: st.color }}>{st.label}</span>
                                <span className="text-white/30">{dataCurta(lead.created_at)} {horaCurta(lead.created_at)} · {dono(lead) || 'Sem vendedor'}{t ? <> · <span className={t.cls}>{t.rotulo}</span></> : null}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* computador: tabela */}
            <div className="hidden md:block bg-[#141418] border border-white/[0.07] rounded-2xl overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse table-fixed min-w-[1040px]">
                        <thead>
                            <tr className="border-b border-white/[0.06] bg-[#0F0F12] text-[10px] font-semibold text-white/30 uppercase tracking-widest">
                                <th className="px-3 py-3 w-12" />
                                <th className="px-3 py-3 w-[19%]">Nome</th>
                                <th className="px-3 py-3 w-[16%]">O que quer</th>
                                <th className="px-3 py-3 w-[15%]">Situação</th>
                                <th className="px-3 py-3 w-[20%]">Última mensagem</th>
                                <th className="px-3 py-3 w-[10%]">Consultor</th>
                                <th className="px-3 py-3 w-[10%] text-center">Etapa</th>
                                <th className="px-3 py-3 w-[10%] text-right">Entrada</th>
                            </tr>
                        </thead>
                        <tbody>
                            {linhas.map(({ lead, grupo }) => {
                                const e = enriq(lead); const st = getStatusConfig(lead.status || ''); const t = temperatura(lead);
                                return (
                                    <tr key={lead.id} onClick={() => onView(lead)} className="group cursor-pointer border-b border-white/[0.04] hover:bg-white/[0.03] align-top">
                                        <td className="px-3 py-3">
                                            <button onClick={ev => whats(ev, lead)} title="Chamar no WhatsApp" aria-label="Chamar no WhatsApp" className="h-7 w-7 rounded-lg bg-emerald-600/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-600 hover:text-white flex items-center justify-center"><Zap size={12} /></button>
                                        </td>
                                        <td className="px-3 py-3 min-w-0">
                                            <p className="text-[13px] font-semibold text-white/90 truncate">{safeDisplayName(lead.name)}</p>
                                            <p className="text-[11px] text-white/30 tabular-nums">{formatPhoneBR(safePhone(lead.phone))}{t ? <> · <span className={t.cls}>{t.rotulo}</span></> : null}</p>
                                        </td>
                                        <td className="px-3 py-3 text-[12px] text-white/60 min-w-0"><p className="line-clamp-2">{interesse(lead) || <span className="text-white/20">Não informado</span>}</p></td>
                                        <td className="px-3 py-3"><Selo grupo={grupo} e={e} /></td>
                                        <td className="px-3 py-3"><Ultima e={e} /></td>
                                        <td className="px-3 py-3 text-[12px] text-white/50 truncate">{dono(lead) || <span className="text-amber-300/80">Sem vendedor</span>}</td>
                                        <td className="px-3 py-3 text-center">
                                            <div className="relative inline-block">
                                                <button onClick={ev => { ev.stopPropagation(); setMenu(menu === lead.id ? null : lead.id); }}
                                                    className="px-2 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wide hover:brightness-125"
                                                    style={{ color: st.color, backgroundColor: `${st.color}12`, border: `1px solid ${st.color}20` }}>{st.label}</button>
                                                <MoveMenu isOpen={menu === lead.id} currentStatus={lead.status as LeadStatus}
                                                    onStatusChange={s => { onStatusChange(lead.id, s); setMenu(null); }} onClose={() => setMenu(null)} />
                                            </div>
                                        </td>
                                        <td className="px-3 py-3 text-right tabular-nums">
                                            <p className="text-[12px] text-white/70">{dataCurta(lead.created_at)}</p>
                                            <p className="text-[10px] text-white/30">{horaCurta(lead.created_at)}</p>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
