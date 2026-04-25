'use client';

import { useState } from 'react';
import { Bot, Loader2, AlertTriangle, Wand2, Package } from 'lucide-react';

/**
 * /admin/sdr-bench
 *
 * Itere o prompt do AI SDR sem queimar lead real. Veja a mensagem que
 * sairia, quais carros do estoque entraram no contexto, se foi LLM ou
 * fallback, e quantos caracteres ficou.
 */

interface Preview {
    message: string;
    matches: Array<{ marca: string | null; modelo: string | null; ano: number | null; preco: number | null; line: string }>;
    usedLLM: boolean;
    fallback: boolean;
    chars: number;
    senderConfigured: boolean;
}

const SAMPLES = [
    { label: 'SUV usado, lead Facebook', leadName: 'Carlos Mendes', vehicleInterest: 'Tracker LTZ 2022 prata', source: 'Facebook Ads', consultantName: 'Felipe', flow: 'venda' as const },
    { label: 'Hatch novo', leadName: 'Ana Silva', vehicleInterest: 'Onix LT', source: 'Instagram', consultantName: 'Karoline', flow: 'venda' as const },
    { label: 'Fluxo compra (vender carro)', leadName: 'Pedro', vehicleInterest: 'Civic 2018 automático', source: 'WhatsApp Direto', consultantName: 'Felipe', flow: 'compra' as const },
];

export default function SdrBenchPage() {
    const [secret, setSecret] = useState('');
    const [leadName, setLeadName] = useState('Carlos Mendes');
    const [vehicleInterest, setVehicleInterest] = useState('Tracker LTZ 2022');
    const [source, setSource] = useState('Facebook Ads');
    const [consultantName, setConsultantName] = useState('Felipe');
    const [flow, setFlow] = useState<'venda' | 'compra'>('venda');

    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<Preview | null>(null);

    function loadSample(s: typeof SAMPLES[number]) {
        setLeadName(s.leadName);
        setVehicleInterest(s.vehicleInterest);
        setSource(s.source);
        setConsultantName(s.consultantName);
        setFlow(s.flow);
    }

    async function run() {
        if (!secret) {
            setError('Informe o CRON_SECRET.');
            return;
        }
        setRunning(true);
        setError(null);
        setPreview(null);
        try {
            const res = await fetch('/api/admin/sdr-preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
                body: JSON.stringify({ leadName, vehicleInterest, source, consultantName, flow }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
            setPreview(json.preview);
        } catch (e: any) {
            setError(e?.message || 'erro');
        } finally {
            setRunning(false);
        }
    }

    return (
        <div className="p-4 max-w-5xl mx-auto">
            <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
                <Bot className="w-6 h-6" /> SDR Bench
            </h1>
            <p className="text-sm text-gray-400 mb-6">
                Simule um lead falso e veja a mensagem que a IA mandaria. Não envia nada,
                não grava nada. Use pra calibrar o prompt antes de mexer em produção.
            </p>

            <div className="bg-zinc-900 rounded-lg p-4 mb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="CRON_SECRET">
                        <input type="password" value={secret} onChange={e => setSecret(e.target.value)} className="w-full p-2 rounded bg-zinc-800 text-white" />
                    </Field>
                    <Field label="Fluxo">
                        <select value={flow} onChange={e => setFlow(e.target.value as any)} className="w-full p-2 rounded bg-zinc-800 text-white">
                            <option value="venda">venda (lead querendo COMPRAR)</option>
                            <option value="compra">compra (lead querendo VENDER carro)</option>
                        </select>
                    </Field>
                    <Field label="Nome do lead">
                        <input value={leadName} onChange={e => setLeadName(e.target.value)} className="w-full p-2 rounded bg-zinc-800 text-white" />
                    </Field>
                    <Field label="Consultor">
                        <input value={consultantName} onChange={e => setConsultantName(e.target.value)} className="w-full p-2 rounded bg-zinc-800 text-white" />
                    </Field>
                    <Field label="Veículo de interesse">
                        <input value={vehicleInterest} onChange={e => setVehicleInterest(e.target.value)} className="w-full p-2 rounded bg-zinc-800 text-white" />
                    </Field>
                    <Field label="Origem">
                        <input value={source} onChange={e => setSource(e.target.value)} className="w-full p-2 rounded bg-zinc-800 text-white" />
                    </Field>
                </div>

                <div className="flex flex-wrap gap-2 mt-4">
                    <button
                        onClick={run}
                        disabled={running}
                        className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white px-4 py-2 rounded font-bold flex items-center gap-2"
                    >
                        {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                        Gerar mensagem
                    </button>
                    {SAMPLES.map(s => (
                        <button
                            key={s.label}
                            onClick={() => loadSample(s)}
                            className="text-xs px-3 py-2 rounded border border-zinc-700 text-gray-300 hover:bg-zinc-800"
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            {error && (
                <div className="bg-red-900/40 border border-red-700 text-red-200 p-3 rounded mb-4 text-sm">
                    {error}
                </div>
            )}

            {preview && (
                <div className="space-y-4">
                    {!preview.senderConfigured && (
                        <div className="bg-amber-900/30 border border-amber-700 text-amber-200 p-3 rounded text-sm flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            Provider de WhatsApp não configurado. A mensagem vai ser GERADA mas, em produção, NÃO seria enviada.
                            Defina <code>WHATSAPP_CLOUD_TOKEN</code>+<code>WHATSAPP_PHONE_NUMBER_ID</code> ou <code>WHATSAPP_SEND_WEBHOOK_URL</code>.
                        </div>
                    )}

                    <div className="bg-zinc-900 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-sm font-semibold text-gray-300">Mensagem gerada</h2>
                            <div className="text-xs text-gray-500 flex gap-3">
                                <span>{preview.chars} chars</span>
                                {preview.usedLLM
                                    ? <span className="text-green-400">via LLM</span>
                                    : <span className="text-amber-400">fallback</span>}
                            </div>
                        </div>
                        <div className="bg-emerald-900/20 border border-emerald-800 rounded p-4">
                            <p className="text-emerald-50 whitespace-pre-line">{preview.message}</p>
                        </div>
                        {preview.fallback && (
                            <p className="text-[11px] text-amber-400 mt-2">
                                ⚠️ Fallback acionado — provavelmente OPENAI_API_KEY ausente, mensagem muito curta, ou exceção no LLM.
                            </p>
                        )}
                    </div>

                    <div className="bg-zinc-900 rounded-lg p-4">
                        <h2 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
                            <Package className="w-4 h-4" /> Estoque que entrou no contexto ({preview.matches.length})
                        </h2>
                        {preview.matches.length === 0 ? (
                            <p className="text-xs text-gray-500">Nenhum carro do estoque bateu com o interesse. Mensagem fica genérica.</p>
                        ) : (
                            <ul className="space-y-1 text-sm text-gray-200">
                                {preview.matches.map((m, i) => (
                                    <li key={i} className="font-mono text-xs">{i + 1}. {m.line}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="text-xs text-gray-400">{label}</span>
            <div className="mt-1">{children}</div>
        </label>
    );
}
