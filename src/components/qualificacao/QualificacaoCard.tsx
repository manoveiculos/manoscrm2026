'use client';

import { useEffect, useState } from 'react';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import {
    PRAZOS_COMPRA, SEM_ENTRADA, SEM_TROCA, ROTULO_CAMPO, classificarLead,
    type QualificacaoCampos,
} from '@/lib/qualificacao';
import { SeloQualificacao } from './SeloQualificacao';
import type { QualificacaoItem } from '@/hooks/useQualificacao';

interface Props {
    /** "tabela:id" (formato da view leads_unified). */
    uid: string;
    /** Chamado depois de salvar, com a classificação nova. */
    onSaved?: (item: QualificacaoItem) => void;
    /** Texto do botão (ex.: "Salvar e agendar visita"). */
    saveLabel?: string;
    className?: string;
}

type Form = Record<keyof QualificacaoCampos, string>;
const vazio: Form = { vehicle_interest: '', valor_investimento: '', carro_troca: '', prazo_compra: '' };

/**
 * Qualificação obrigatória do lead: as 4 perguntas + o selo calculado.
 * Usado na tela /lead/[id], no perfil do Pipeline e no Kanban (antes de
 * avançar para visita).
 */
export function QualificacaoCard({ uid, onSaved, saveLabel = 'Salvar qualificação', className = '' }: Props) {
    const [form, setForm] = useState<Form>(vazio);
    const [piso, setPiso] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [aviso, setAviso] = useState<string | null>(null);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        let vivo = true;
        setLoading(true);
        fetch(`/api/lead/qualificacao?uids=${encodeURIComponent(uid)}`, { cache: 'no-store' })
            .then(r => r.json())
            .then(d => {
                if (!vivo || !d?.success) return;
                setPiso(d.piso ?? null);
                const c = d.items?.[uid]?.campos || {};
                setForm({
                    vehicle_interest: c.vehicle_interest || '',
                    valor_investimento: c.valor_investimento || '',
                    carro_troca: c.carro_troca || '',
                    prazo_compra: c.prazo_compra || '',
                });
            })
            .catch(() => { if (vivo) setErro('Não consegui carregar a qualificação.'); })
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
    }, [uid]);

    // Selo ao vivo enquanto o vendedor digita.
    const r = classificarLead(form, piso);
    const set = (k: keyof QualificacaoCampos, v: string) => { setForm(f => ({ ...f, [k]: v })); setAviso(null); setErro(null); };

    async function salvar() {
        setSaving(true);
        setErro(null);
        try {
            const res = await fetch('/api/lead/qualificacao', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid, ...form }),
            });
            const d = await res.json();
            if (!res.ok || !d.success) throw new Error(d.error || `erro ${res.status}`);
            setAviso(d.ignorados?.includes('prazo_compra')
                ? 'Salvo — o prazo ainda não grava no banco (falta aplicar a atualização do banco).'
                : 'Qualificação salva.');
            onSaved?.({ campos: d.campos, selo: d.selo, faltando: d.faltando, completa: d.completa, entrada: d.entrada, troca: d.troca, faixaMaxima: d.faixaMaxima, motivo: d.motivo });
        } catch (e: any) {
            setErro('Não salvou: ' + (e?.message || 'tente de novo'));
        } finally {
            setSaving(false);
        }
    }

    const input = 'w-full rounded-lg bg-zinc-950/80 border border-zinc-700 text-sm text-white px-3 py-2 focus:outline-none focus:border-blue-500/60';
    const chip = (ativo: boolean) => `px-2.5 py-1.5 rounded-lg text-xs font-bold border transition ${ativo ? 'bg-blue-500/20 border-blue-400 text-white' : 'bg-zinc-950/60 border-zinc-700 text-zinc-300 hover:border-zinc-500'}`;

    return (
        <section className={`rounded-xl border p-4 ${r.completa ? 'border-zinc-800 bg-zinc-900/60' : 'border-amber-600/50 bg-amber-950/20'} ${className}`}>
            <div className="flex items-center justify-between gap-2 mb-1">
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <ClipboardCheck className="w-4 h-4" /> Qualificação
                </h3>
                {!loading && <SeloQualificacao selo={r.selo} motivo={r.motivo} />}
            </div>
            {!loading && !r.completa && (
                <p className="text-[11px] text-amber-300 mb-3">
                    Obrigatória para sair da triagem. Falta: {r.faltando.map(f => ROTULO_CAMPO[f]).join(' · ')}
                </p>
            )}
            {!loading && r.completa && <p className="text-[11px] text-zinc-400 mb-3">{r.motivo}</p>}

            {loading ? (
                <div className="flex items-center gap-2 text-xs text-zinc-400 py-4"><Loader2 className="w-4 h-4 animate-spin" /> carregando…</div>
            ) : (
                <div className="space-y-3">
                    <div>
                        <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-bold mb-1">Carro / faixa de valor</label>
                        <input className={input} value={form.vehicle_interest} onChange={e => set('vehicle_interest', e.target.value)} placeholder="Ex.: Onix 2020 até 60 mil" />
                        {r.faixaMaxima != null && (
                            <p className="text-[10px] text-zinc-500 mt-1">Faixa detectada: até R$ {r.faixaMaxima.toLocaleString('pt-BR')}{piso ? ` · estoque a partir de R$ ${piso.toLocaleString('pt-BR')}` : ''}</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-bold mb-1">Entrada (R$)</label>
                        <div className="flex gap-1.5">
                            <input className={input} value={form.valor_investimento} onChange={e => set('valor_investimento', e.target.value)} placeholder="Ex.: 10.000" inputMode="text" />
                            <button type="button" className={chip(r.entrada === 0)} onClick={() => set('valor_investimento', SEM_ENTRADA)}>Sem entrada</button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-bold mb-1">Carro na troca</label>
                        <div className="flex gap-1.5">
                            <input className={input} value={form.carro_troca} onChange={e => set('carro_troca', e.target.value)} placeholder="Ex.: Gol 2012" />
                            <button type="button" className={chip(r.troca === false)} onClick={() => set('carro_troca', SEM_TROCA)}>Sem troca</button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-bold mb-1">Prazo de compra</label>
                        <div className="grid grid-cols-2 gap-1.5">
                            {PRAZOS_COMPRA.map(p => (
                                <button key={p.v} type="button" className={chip(form.prazo_compra === p.v)} onClick={() => set('prazo_compra', p.v)}>{p.l}</button>
                            ))}
                        </div>
                    </div>
                    {erro && <p className="text-xs text-red-400">{erro}</p>}
                    {aviso && <p className="text-xs text-emerald-400">{aviso}</p>}
                    <button
                        type="button"
                        onClick={salvar}
                        disabled={saving}
                        className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-black disabled:opacity-50"
                    >
                        {saving ? 'Salvando…' : saveLabel}
                    </button>
                </div>
            )}
        </section>
    );
}
