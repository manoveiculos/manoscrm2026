'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
    X, Upload, FileText, Camera, Play, Loader2, Copy, Check, AlertTriangle,
    Download, FileSearch, Radar, Repeat, MessageCircle,
} from 'lucide-react';

type Squad = 'perito' | 'vitrine' | 'sentinela' | 'captador' | 'recepcao';

const TABS: Array<{ key: Squad; label: string; icon: any; ready: boolean }> = [
    { key: 'perito', label: 'Perito', icon: FileSearch, ready: true },
    { key: 'vitrine', label: 'Vitrine', icon: Camera, ready: true },
    { key: 'sentinela', label: 'Sentinela', icon: Radar, ready: false },
    { key: 'captador', label: 'Captador', icon: Repeat, ready: false },
    { key: 'recepcao', label: 'Recepção', icon: MessageCircle, ready: false },
];

const DEFAULT_INSTRUCAO = 'Uniformize o fundo e a iluminação da foto, mantendo o carro real exatamente como está, sem adicionar nem remover nada do veículo.';

export function ExecuteModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
    const supabase = createClient();
    const [squad, setSquad] = useState<Squad>('perito');
    const [file, setFile] = useState<File | null>(null);
    const [fipe, setFipe] = useState('');
    const [valorPedido, setValorPedido] = useState('');
    const [notas, setNotas] = useState('');
    const [instrucao, setInstrucao] = useState(DEFAULT_INSTRUCAO);
    const [step, setStep] = useState<'idle' | 'uploading' | 'processing' | 'done' | 'error'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [resultText, setResultText] = useState<string | null>(null);
    const [pendenteDado, setPendenteDado] = useState(false);
    const [outputUrl, setOutputUrl] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const busy = step === 'uploading' || step === 'processing';

    function reset() {
        setFile(null); setFipe(''); setValorPedido(''); setNotas(''); setInstrucao(DEFAULT_INSTRUCAO);
        setStep('idle'); setError(null); setResultText(null); setPendenteDado(false); setOutputUrl(null); setCopied(false);
    }

    function switchSquad(s: Squad) {
        if (!TABS.find(t => t.key === s)?.ready) return;
        setSquad(s);
        reset();
    }

    async function execute() {
        if (!file) return;
        setError(null);
        try {
            setStep('uploading');
            const urlRes = await fetch('/api/marketing/execute/upload-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ squad, filename: file.name }),
            });
            const urlJson = await urlRes.json();
            if (!urlRes.ok || !urlJson.success) throw new Error(urlJson.error || 'falha ao preparar upload');

            const { error: upErr } = await supabase.storage
                .from(urlJson.bucket)
                .uploadToSignedUrl(urlJson.path, urlJson.token, file);
            if (upErr) throw new Error(upErr.message);

            setStep('processing');
            const execRes = await fetch('/api/marketing/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    squad,
                    skill: squad === 'perito' ? 'laudo-relampago' : 'vitrine-trata-foto',
                    storagePath: urlJson.path,
                    fipe: fipe ? Number(fipe) : undefined,
                    valorPedido: valorPedido ? Number(valorPedido) : undefined,
                    notas: notas || undefined,
                    instrucao: squad === 'vitrine' ? instrucao : undefined,
                }),
            });
            const execJson = await execRes.json();
            if (!execRes.ok || !execJson.success) throw new Error(execJson.error || 'falha ao executar');

            if (squad === 'perito') {
                setResultText(execJson.resultText);
                setPendenteDado(!!execJson.pendenteDado);
            } else {
                setOutputUrl(execJson.outputUrl);
            }
            setStep('done');
            onDone();
        } catch (e: any) {
            setError(e?.message || 'erro inesperado');
            setStep('error');
        }
    }

    function copyResult() {
        if (!resultText) return;
        navigator.clipboard.writeText(resultText).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div
                className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-[#0C0C0F] border border-white/[0.08] shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                    <h2 className="text-lg font-bold flex items-center gap-2 text-white">
                        <Play className="w-5 h-5 text-red-500" /> Executar squad
                    </h2>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* TABS */}
                <div className="flex gap-1.5 px-5 pt-4 flex-wrap">
                    {TABS.map((t) => {
                        const Icon = t.icon;
                        const active = squad === t.key;
                        return (
                            <button
                                key={t.key}
                                disabled={!t.ready}
                                onClick={() => switchSquad(t.key)}
                                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${
                                    active ? 'bg-red-500/15 border-red-500/30 text-red-400'
                                    : t.ready ? 'border-white/[0.08] text-zinc-400 hover:text-white hover:border-white/20'
                                    : 'border-white/[0.04] text-zinc-700 cursor-not-allowed'
                                }`}
                            >
                                <Icon className="w-3.5 h-3.5" /> {t.label}
                                {!t.ready && <span className="text-[9px] uppercase tracking-wider">em breve</span>}
                            </button>
                        );
                    })}
                </div>

                <div className="p-5 space-y-4">
                    {step !== 'done' && (
                        <>
                            {/* DROPZONE */}
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
                                className="border-2 border-dashed border-white/[0.1] hover:border-red-500/30 rounded-xl p-6 text-center cursor-pointer transition-colors"
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    className="hidden"
                                    accept={squad === 'perito' ? 'application/pdf,image/*' : 'image/*'}
                                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                                />
                                {file ? (
                                    <div className="flex items-center justify-center gap-2 text-sm text-white">
                                        {file.type === 'application/pdf' ? <FileText className="w-5 h-5 text-red-400" /> : <Camera className="w-5 h-5 text-red-400" />}
                                        {file.name}
                                    </div>
                                ) : (
                                    <div className="text-zinc-500 text-sm flex flex-col items-center gap-2">
                                        <Upload className="w-6 h-6" />
                                        {squad === 'perito' ? 'Arraste o laudo (PDF ou foto) ou clique pra escolher' : 'Arraste a foto do veículo ou clique pra escolher'}
                                    </div>
                                )}
                            </div>

                            {squad === 'perito' && (
                                <div className="grid grid-cols-2 gap-3">
                                    <label className="block">
                                        <span className="text-xs text-zinc-400">FIPE (R$)</span>
                                        <input value={fipe} onChange={(e) => setFipe(e.target.value)} type="number" placeholder="52000"
                                            className="w-full mt-1 p-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm" />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs text-zinc-400">Valor pedido (R$)</span>
                                        <input value={valorPedido} onChange={(e) => setValorPedido(e.target.value)} type="number" placeholder="45000"
                                            className="w-full mt-1 p-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm" />
                                    </label>
                                    <label className="col-span-2 block">
                                        <span className="text-xs text-zinc-400">Observações (opcional)</span>
                                        <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="ex.: pneus gastos, único dono"
                                            className="w-full mt-1 p-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm" />
                                    </label>
                                    <p className="col-span-2 text-[11px] text-zinc-500">Sem FIPE/valor pedido o Perito só devolve os apontamentos e pede os dois antes de montar a proposta.</p>
                                </div>
                            )}

                            {squad === 'vitrine' && (
                                <label className="block">
                                    <span className="text-xs text-zinc-400">Instrução pro tratamento</span>
                                    <textarea value={instrucao} onChange={(e) => setInstrucao(e.target.value)} rows={2}
                                        className="w-full mt-1 p-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white text-sm" />
                                </label>
                            )}

                            {error && (
                                <div className="flex items-start gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
                                </div>
                            )}

                            <button
                                onClick={execute}
                                disabled={!file || busy}
                                className="w-full flex items-center justify-center gap-2 font-bold text-sm py-3 rounded-xl bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white transition-colors"
                            >
                                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                                {step === 'uploading' ? 'Enviando arquivo…' : step === 'processing' ? (squad === 'perito' ? 'Analisando laudo…' : 'Tratando foto…') : 'Executar'}
                            </button>
                        </>
                    )}

                    {step === 'done' && squad === 'perito' && (
                        <div className="space-y-3">
                            {pendenteDado && (
                                <div className="flex items-start gap-2 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> Faltou FIPE/valor pedido — preencha os dois e execute de novo pra ter a proposta.
                                </div>
                            )}
                            <div className="rounded-xl bg-black/40 border border-white/[0.08] p-4">
                                <pre className="whitespace-pre-wrap text-sm text-zinc-100 font-mono leading-relaxed">{resultText}</pre>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={copyResult} className="flex-1 flex items-center justify-center gap-1.5 text-sm font-bold py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/10 text-white transition-colors">
                                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />} {copied ? 'Copiado!' : 'Copiar pro WhatsApp'}
                                </button>
                                <button onClick={reset} className="flex-1 text-sm font-bold py-2.5 rounded-xl border border-white/[0.1] text-zinc-300 hover:bg-white/[0.04] transition-colors">
                                    Nova execução
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'done' && squad === 'vitrine' && (
                        <div className="space-y-3">
                            {outputUrl && (
                                <div className="rounded-xl overflow-hidden border border-white/[0.08]">
                                    <img src={outputUrl} alt="Foto tratada" className="w-full object-contain max-h-[400px] bg-black" />
                                </div>
                            )}
                            <div className="flex gap-2">
                                {outputUrl && (
                                    <a href={outputUrl} target="_blank" rel="noreferrer" className="flex-1 flex items-center justify-center gap-1.5 text-sm font-bold py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/10 text-white transition-colors">
                                        <Download className="w-4 h-4" /> Baixar foto tratada
                                    </a>
                                )}
                                <button onClick={reset} className="flex-1 text-sm font-bold py-2.5 rounded-xl border border-white/[0.1] text-zinc-300 hover:bg-white/[0.04] transition-colors">
                                    Nova execução
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
