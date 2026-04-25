'use client';

import { useState } from 'react';
import { AlertTriangle, Play, ShieldCheck, Loader2 } from 'lucide-react';

/**
 * /admin/rescue
 *
 * Tela do gestor pra disparar o resgate retroativo de leads parados.
 * Sempre começa com dry-run pra ver o que aconteceria. Depois libera
 * o envio real.
 *
 * Requer CRON_SECRET (digitado no campo) — não persiste em lugar nenhum.
 */

interface SampleRow {
    uid: string;
    name: string | null;
    phone: string | null;
    outcome: string;
}

interface RescueResult {
    scanned: number;
    eligible: number;
    sent: number;
    skipped: number;
    failed: number;
    perTable: Record<string, { scanned: number; eligible: number; sent: number; skipped: number; failed: number }>;
    samples: SampleRow[];
}

export default function RescuePage() {
    const [secret, setSecret] = useState('');
    const [days, setDays] = useState(7);
    const [limit, setLimit] = useState(50);
    const [dryRun, setDryRun] = useState(true);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<RescueResult | null>(null);
    const [args, setArgs] = useState<any>(null);

    async function run() {
        if (!secret) {
            setError('Informe o CRON_SECRET.');
            return;
        }
        setRunning(true);
        setError(null);
        setResult(null);
        setArgs(null);
        try {
            const res = await fetch('/api/leads/rescue-stale', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${secret}`,
                },
                body: JSON.stringify({ days, limit, dry_run: dryRun }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data?.error || `HTTP ${res.status}`);
            } else {
                setResult(data.result);
                setArgs(data.args);
            }
        } catch (e: any) {
            setError(e?.message || 'erro de rede');
        } finally {
            setRunning(false);
        }
    }

    return (
        <div className="p-4 max-w-5xl mx-auto">
            <h1 className="text-2xl font-bold text-white mb-1">Resgate de leads parados</h1>
            <p className="text-sm text-gray-400 mb-6">
                Roda o AI SDR retroativamente em leads que nunca receberam primeiro contato.
                Comece sempre com <strong>dry-run</strong> pra ver o tamanho do estrago antes de disparar.
            </p>

            <div className="bg-zinc-900 rounded-lg p-4 grid gap-3 md:grid-cols-4 mb-4">
                <label className="block">
                    <span className="text-xs text-gray-400">CRON_SECRET</span>
                    <input
                        type="password"
                        value={secret}
                        onChange={e => setSecret(e.target.value)}
                        placeholder="Bearer token"
                        className="mt-1 w-full p-2 rounded bg-zinc-800 text-white"
                    />
                </label>
                <label className="block">
                    <span className="text-xs text-gray-400">Dias para trás (1-30)</span>
                    <input
                        type="number"
                        value={days}
                        onChange={e => setDays(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                        className="mt-1 w-full p-2 rounded bg-zinc-800 text-white"
                    />
                </label>
                <label className="block">
                    <span className="text-xs text-gray-400">Limite (1-200)</span>
                    <input
                        type="number"
                        value={limit}
                        onChange={e => setLimit(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                        className="mt-1 w-full p-2 rounded bg-zinc-800 text-white"
                    />
                </label>
                <label className="flex items-end gap-2 pb-2">
                    <input
                        type="checkbox"
                        checked={dryRun}
                        onChange={e => setDryRun(e.target.checked)}
                        className="w-4 h-4"
                    />
                    <span className="text-sm text-gray-300">Dry-run (não envia)</span>
                </label>
            </div>

            <div className="flex items-center gap-3 mb-6">
                <button
                    disabled={running}
                    onClick={run}
                    className={`flex items-center gap-2 px-4 py-2 rounded font-bold ${dryRun ? 'bg-blue-600 hover:bg-blue-500' : 'bg-red-700 hover:bg-red-600'} disabled:bg-gray-700 text-white`}
                >
                    {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    {running ? 'Executando…' : dryRun ? 'Simular (dry-run)' : 'Disparar de verdade'}
                </button>
                {!dryRun && (
                    <span className="text-xs text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4" /> Vai mandar WhatsApp pra clientes reais.
                    </span>
                )}
            </div>

            {error && (
                <div className="bg-red-900/40 border border-red-700 text-red-200 p-3 rounded mb-4 text-sm">
                    Erro: {error}
                </div>
            )}

            {result && (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <Kpi label="Varridos" value={result.scanned} />
                        <Kpi label="Elegíveis" value={result.eligible} />
                        <Kpi label="Enviados" value={result.sent} good />
                        <Kpi label="Pulados" value={result.skipped} />
                        <Kpi label="Falhas" value={result.failed} bad />
                    </div>

                    {args?.dryRun && (
                        <div className="bg-blue-900/30 border border-blue-800 p-3 rounded text-sm text-blue-200 flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4" />
                            Dry-run: nada foi enviado. Desmarque o checkbox pra disparar.
                        </div>
                    )}

                    <div className="bg-zinc-900 rounded-lg overflow-hidden">
                        <div className="px-4 py-2 border-b border-zinc-800 text-xs font-semibold text-gray-300">Por tabela</div>
                        <table className="w-full text-sm">
                            <thead className="text-gray-400 text-left">
                                <tr>
                                    <th className="px-4 py-2">Tabela</th>
                                    <th className="px-4 py-2 text-right">Varridos</th>
                                    <th className="px-4 py-2 text-right">Elegíveis</th>
                                    <th className="px-4 py-2 text-right">Enviados</th>
                                    <th className="px-4 py-2 text-right">Pulados</th>
                                    <th className="px-4 py-2 text-right">Falhas</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(result.perTable).map(([t, s]) => (
                                    <tr key={t} className="border-t border-zinc-800 text-gray-200">
                                        <td className="px-4 py-2 font-mono">{t}</td>
                                        <td className="px-4 py-2 text-right">{s.scanned}</td>
                                        <td className="px-4 py-2 text-right">{s.eligible}</td>
                                        <td className="px-4 py-2 text-right text-green-400">{s.sent}</td>
                                        <td className="px-4 py-2 text-right">{s.skipped}</td>
                                        <td className="px-4 py-2 text-right text-red-400">{s.failed}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {result.samples.length > 0 && (
                        <div className="bg-zinc-900 rounded-lg overflow-hidden">
                            <div className="px-4 py-2 border-b border-zinc-800 text-xs font-semibold text-gray-300">
                                Amostra ({result.samples.length})
                            </div>
                            <table className="w-full text-sm">
                                <thead className="text-gray-400 text-left">
                                    <tr>
                                        <th className="px-4 py-2">UID</th>
                                        <th className="px-4 py-2">Nome</th>
                                        <th className="px-4 py-2">Telefone</th>
                                        <th className="px-4 py-2">Resultado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.samples.slice(0, 200).map(s => (
                                        <tr key={s.uid} className="border-t border-zinc-800 text-gray-200">
                                            <td className="px-4 py-2 font-mono text-xs">{s.uid}</td>
                                            <td className="px-4 py-2">{s.name || '—'}</td>
                                            <td className="px-4 py-2 font-mono text-xs">{s.phone || '—'}</td>
                                            <td className={`px-4 py-2 ${s.outcome.startsWith('sent') ? 'text-green-400' : s.outcome.startsWith('fail') ? 'text-red-400' : 'text-gray-400'}`}>
                                                {s.outcome}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function Kpi({ label, value, good, bad }: { label: string; value: number; good?: boolean; bad?: boolean }) {
    const color = good ? 'text-green-400' : bad ? 'text-red-400' : 'text-white';
    return (
        <div className="bg-zinc-900 rounded p-3">
            <div className="text-xs text-gray-400">{label}</div>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
        </div>
    );
}
