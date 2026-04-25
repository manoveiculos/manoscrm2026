'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Save } from 'lucide-react';

/**
 * /admin/users
 *
 * Tela do gestor pra gerenciar consultores.
 * Foco: garantir que personal_whatsapp e user_id estejam preenchidos —
 * sem isso, push e modal bloqueante NÃO funcionam pro vendedor.
 */

interface Consultant {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    personal_whatsapp: string | null;
    user_id: string | null;
    is_active: boolean;
    role: string | null;
    missing: { personal_whatsapp: boolean; user_id: boolean; phone: boolean };
}

export default function UsersPage() {
    const [secret, setSecret] = useState('');
    const [list, setList] = useState<Consultant[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<Record<string, Partial<Consultant>>>({});

    async function load() {
        if (!secret) {
            setError('Informe o CRON_SECRET pra carregar.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/consultants', { headers: { 'x-admin-secret': secret } });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
            setList(json.consultants || []);
            setDrafts({});
        } catch (e: any) {
            setError(e?.message || 'erro');
        } finally {
            setLoading(false);
        }
    }

    function setDraft(id: string, key: keyof Consultant, value: any) {
        setDrafts(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [key]: value } }));
    }

    async function save(c: Consultant) {
        const draft = drafts[c.id];
        if (!draft) return;
        setSaving(c.id);
        try {
            const res = await fetch('/api/admin/consultants', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
                body: JSON.stringify({ id: c.id, ...draft }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
            await load();
        } catch (e: any) {
            setError(`Falha ao salvar ${c.name}: ${e?.message}`);
        } finally {
            setSaving(null);
        }
    }

    useEffect(() => { /* manual load */ }, []);

    const flagged = list.filter(c => c.is_active && (c.missing.personal_whatsapp || c.missing.user_id));

    return (
        <div className="p-4 max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold text-white mb-1">Consultores</h1>
            <p className="text-sm text-gray-400 mb-4">
                Vendedor sem <code className="text-yellow-400">personal_whatsapp</code> não recebe push de SLA.
                Sem <code className="text-yellow-400">user_id</code> não recebe modal bloqueante.
            </p>

            <div className="bg-zinc-900 rounded-lg p-3 flex gap-2 items-center mb-4">
                <input
                    type="password"
                    placeholder="CRON_SECRET"
                    value={secret}
                    onChange={e => setSecret(e.target.value)}
                    className="flex-1 p-2 rounded bg-zinc-800 text-white text-sm"
                />
                <button
                    onClick={load}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white text-sm rounded font-bold"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Carregar'}
                </button>
            </div>

            {error && <div className="bg-red-900/40 border border-red-700 text-red-200 p-3 rounded mb-4 text-sm">{error}</div>}

            {flagged.length > 0 && (
                <div className="bg-amber-900/30 border border-amber-700 text-amber-200 p-3 rounded mb-4 text-sm flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                        <strong>{flagged.length}</strong> consultor(es) ativo(s) com configuração incompleta — eles não recebem alertas críticos.
                    </div>
                </div>
            )}

            {list.length > 0 && (
                <div className="bg-zinc-900 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="text-gray-400 text-left">
                            <tr>
                                <th className="px-3 py-2">Nome</th>
                                <th className="px-3 py-2">Email</th>
                                <th className="px-3 py-2">Phone</th>
                                <th className="px-3 py-2">Personal WhatsApp</th>
                                <th className="px-3 py-2">user_id (auth)</th>
                                <th className="px-3 py-2">Role</th>
                                <th className="px-3 py-2 text-center">Ativo</th>
                                <th className="px-3 py-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.map(c => {
                                const d = drafts[c.id] || {};
                                const dirty = Object.keys(d).length > 0;
                                return (
                                    <tr key={c.id} className={`border-t border-zinc-800 ${c.is_active ? 'text-gray-200' : 'text-gray-500'}`}>
                                        <td className="px-3 py-2">
                                            <input
                                                defaultValue={c.name}
                                                onChange={e => setDraft(c.id, 'name', e.target.value)}
                                                className="bg-transparent w-full"
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <input
                                                defaultValue={c.email || ''}
                                                onChange={e => setDraft(c.id, 'email', e.target.value)}
                                                className="bg-transparent w-full text-xs"
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <input
                                                defaultValue={c.phone || ''}
                                                onChange={e => setDraft(c.id, 'phone', e.target.value)}
                                                className={`bg-transparent w-full font-mono text-xs ${c.missing.phone ? 'border-b border-amber-600' : ''}`}
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <input
                                                defaultValue={c.personal_whatsapp || ''}
                                                placeholder="55 49 9..."
                                                onChange={e => setDraft(c.id, 'personal_whatsapp', e.target.value)}
                                                className={`bg-transparent w-full font-mono text-xs ${c.missing.personal_whatsapp ? 'border-b border-red-600' : ''}`}
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <input
                                                defaultValue={c.user_id || ''}
                                                placeholder="UUID do auth.users"
                                                onChange={e => setDraft(c.id, 'user_id', e.target.value)}
                                                className={`bg-transparent w-full font-mono text-[10px] ${c.missing.user_id ? 'border-b border-red-600' : ''}`}
                                            />
                                        </td>
                                        <td className="px-3 py-2">
                                            <select
                                                defaultValue={c.role || ''}
                                                onChange={e => setDraft(c.id, 'role', e.target.value)}
                                                className="bg-zinc-800 text-white text-xs rounded p-1"
                                            >
                                                <option value="">—</option>
                                                <option value="vendedor">vendedor</option>
                                                <option value="admin">admin</option>
                                            </select>
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            <input
                                                type="checkbox"
                                                defaultChecked={c.is_active}
                                                onChange={e => setDraft(c.id, 'is_active', e.target.checked)}
                                            />
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            {dirty && (
                                                <button
                                                    disabled={saving === c.id}
                                                    onClick={() => save(c)}
                                                    className="px-3 py-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 rounded text-xs font-bold flex items-center gap-1"
                                                >
                                                    {saving === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Salvar
                                                </button>
                                            )}
                                            {!dirty && !c.missing.personal_whatsapp && !c.missing.user_id && c.is_active && (
                                                <CheckCircle2 className="w-4 h-4 text-green-500 inline" />
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
