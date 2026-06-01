'use client';

import { useEffect, useState } from 'react';
import { 
    AlertCircle, CheckCircle2, Loader2, Save, Trash2, 
    UserCheck, UserX, Search, Shield, ShieldAlert, Key, 
    Phone, Mail, Check, X, ShieldCheck, UserCheck2, RefreshCw,
    UserMinus, Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * /admin/users
 *
 * Tela de Gestão de Usuários e Acessos do CRM.
 * Permite aprovar novos consultores, editar dados críticos,
 * bloquear acessos ou deletar contas permanentemente.
 */

interface Consultant {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    personal_whatsapp: string | null;
    user_id: string | null;
    auth_id: string | null;
    is_active: boolean;
    role: string | null;
    status: 'pending' | 'active' | 'blocked' | null;
    is_unlinked?: boolean;
    missing: { personal_whatsapp: boolean; user_id: boolean; phone: boolean };
}

type TabType = 'pending' | 'active' | 'blocked' | 'all';

export default function UsersPage() {
    const [secret, setSecret] = useState('');
    const [list, setList] = useState<Consultant[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<Record<string, Partial<Consultant>>>({});
    const [activeTab, setActiveTab] = useState<TabType>('pending');
    const [search, setSearch] = useState('');
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    async function load() {
        if (!secret) {
            setError('Informe a Chave Admin (CRON_SECRET) para carregar.');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/consultants?t=${Date.now()}`, { 
                headers: { 'x-admin-secret': secret },
                cache: 'no-store'
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
            setList(json.consultants || []);
            setDrafts({});
            
            // Salva a chave admin no localStorage se funcionar
            localStorage.setItem('manos_admin_secret', secret);
        } catch (e: any) {
            setError(e?.message || 'Erro ao carregar consultores');
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
        setError(null);
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

    async function updateStatus(c: Consultant, newStatus: 'active' | 'blocked' | 'pending') {
        setSaving(c.id);
        setError(null);
        try {
            const res = await fetch('/api/admin/consultants', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
                body: JSON.stringify({ 
                    id: c.id, 
                    status: newStatus,
                    is_active: newStatus === 'active'
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
            await load();
        } catch (e: any) {
            setError(`Falha ao alterar status de ${c.name}: ${e?.message}`);
        } finally {
            setSaving(null);
        }
    }

    async function deleteUser(id: string) {
        setDeleting(id);
        setError(null);
        try {
            const res = await fetch(`/api/admin/consultants?id=${id}`, {
                method: 'DELETE',
                headers: { 'x-admin-secret': secret }
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
            
            // Sucesso
            setConfirmDeleteId(null);
            await load();
        } catch (e: any) {
            setError(`Falha ao excluir usuário: ${e?.message}`);
        } finally {
            setDeleting(null);
        }
    }

    // Carrega automático do localStorage na montagem
    useEffect(() => {
        const savedSecret = localStorage.getItem('manos_admin_secret');
        if (savedSecret) {
            setSecret(savedSecret);
            setLoading(true);
            fetch(`/api/admin/consultants?t=${Date.now()}`, { 
                headers: { 'x-admin-secret': savedSecret },
                cache: 'no-store'
            })
                .then(res => {
                    if (!res.ok) throw new Error();
                    return res.json();
                })
                .then(json => {
                    setList(json.consultants || []);
                    // Se houver usuários aguardando aprovação, já abre neles por padrão
                    const hasPending = (json.consultants || []).some((c: any) => c.status === 'pending');
                    if (hasPending) {
                        setActiveTab('pending');
                    } else {
                        setActiveTab('active');
                    }
                })
                .catch(() => {
                    setError('Chave anterior inválida ou expirada.');
                })
                .finally(() => setLoading(false));
        }
    }, []);

    // Contadores dinâmicos
    const countPending = list.filter(c => c.status === 'pending').length;
    const countActive = list.filter(c => c.status === 'active' || !c.status).length;
    const countBlocked = list.filter(c => c.status === 'blocked').length;
    const countAll = list.length;

    // Filtros e busca
    const filteredList = list.filter(c => {
        const matchesSearch = 
            c.name.toLowerCase().includes(search.toLowerCase()) || 
            (c.email || '').toLowerCase().includes(search.toLowerCase());
        
        const status = c.status || 'active';
        if (activeTab === 'pending') return matchesSearch && status === 'pending';
        if (activeTab === 'active') return matchesSearch && status === 'active';
        if (activeTab === 'blocked') return matchesSearch && status === 'blocked';
        return matchesSearch; // 'all'
    });

    const flaggedCount = list.filter(c => (c.status === 'active' || !c.status) && (c.missing.personal_whatsapp || c.missing.user_id)).length;

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 pb-20">
            {/* Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white flex items-center gap-3">
                        <Shield className="text-red-500" /> Controle de Acessos e Usuários
                    </h1>
                    <p className="text-zinc-500 text-sm mt-1">
                        Gerencie consultores do CRM. Novos cadastros iniciam como <span className="text-amber-400">pendentes</span> e precisam de liberação.
                    </p>
                </div>
            </header>

            {/* Chave de Segurança */}
            <div className="bg-[#141418] border border-white/5 rounded-2xl p-4 flex flex-col sm:flex-row gap-3 items-center">
                <div className="flex items-center gap-2 text-zinc-400 text-sm shrink-0 w-full sm:w-auto">
                    <Key size={16} className="text-red-500" />
                    <span className="font-bold">Chave Administrativa (CRON_SECRET):</span>
                </div>
                <input
                    type="password"
                    placeholder="Digite a chave de segurança para carregar a base..."
                    value={secret}
                    onChange={e => setSecret(e.target.value)}
                    className="flex-1 w-full p-2.5 rounded-xl bg-[#0C0C0F] border border-white/10 text-white text-sm focus:border-red-500/50 outline-none transition-all font-mono"
                />
                <button
                    onClick={load}
                    disabled={loading}
                    className="w-full sm:w-auto px-6 py-2.5 bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-red-950/20 active:scale-[0.98]"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Carregar Base
                </button>
            </div>

            {error && (
                <div className="bg-red-950/20 border border-red-500/30 text-red-400 p-4 rounded-2xl text-sm flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                        <span className="font-bold">Atenção:</span> {error}
                    </div>
                </div>
            )}

            {/* Aviso de Configuração Incompleta */}
            {flaggedCount > 0 && (
                <div className="bg-amber-950/20 border border-amber-500/30 text-amber-300 p-4 rounded-2xl text-sm flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                        Há <strong className="text-white">{flaggedCount}</strong> consultor(es) ativo(s) com configuração incompleta (sem WhatsApp pessoal ou ID do Auth). Eles não receberão alertas de SLA no celular ou modais de bloqueio.
                    </div>
                </div>
            )}

            {/* Painel Principal */}
            {list.length > 0 && (
                <div className="space-y-6">
                    {/* Barra de Filtros e Busca */}
                    <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between border-b border-white/5 pb-2">
                        {/* Abas */}
                        <div className="flex gap-2 overflow-x-auto pb-2 lg:pb-0 scrollbar-none">
                            {[
                                { id: 'pending', label: 'Pendentes de Aprovação', count: countPending, color: 'text-amber-500' },
                                { id: 'active', label: 'Ativos', count: countActive, color: 'text-emerald-500' },
                                { id: 'blocked', label: 'Bloqueados', count: countBlocked, color: 'text-red-500' },
                                { id: 'all', label: 'Todos', count: countAll, color: 'text-zinc-400' }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as TabType)}
                                    className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-all shrink-0 flex items-center gap-2 cursor-pointer ${
                                        activeTab === tab.id
                                            ? 'bg-white/5 border-white/10 text-white'
                                            : 'bg-transparent border-transparent text-zinc-500 hover:text-zinc-300'
                                    }`}
                                >
                                    <span>{tab.label}</span>
                                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold bg-[#141418] border border-white/5 ${tab.color}`}>
                                        {tab.count}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Busca */}
                        <div className="relative flex-1 max-w-md w-full">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600 w-4 h-4" />
                            <input
                                type="text"
                                placeholder="Buscar por nome ou e-mail..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full bg-[#141418] border border-white/5 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:border-red-500/50 outline-none transition-all"
                            />
                            {search && (
                                <button 
                                    onClick={() => setSearch('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Lista / Tabela */}
                    <div className="bg-[#141418] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
                        {filteredList.length === 0 ? (
                            <div className="p-12 text-center flex flex-col items-center justify-center space-y-3">
                                <UserMinus className="w-12 h-12 text-zinc-700" />
                                <h3 className="text-white font-bold text-base">Nenhum consultor encontrado</h3>
                                <p className="text-zinc-500 text-xs max-w-sm">
                                    Nenhum registro corresponde aos filtros ou termos de busca selecionados nesta aba.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="border-b border-white/5 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                            <th className="px-6 py-4">Usuário</th>
                                            <th className="px-6 py-4">Contato CRM</th>
                                            <th className="px-6 py-4">Celular Alerta SLA</th>
                                            <th className="px-6 py-4">IDs de Integração (Auth)</th>
                                            <th className="px-6 py-4">Status & Cargo</th>
                                            <th className="px-6 py-4 text-right">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {filteredList.map(c => {
                                            const d = drafts[c.id] || {};
                                            const dirty = Object.keys(d).length > 0;
                                            const isPending = (c.status || 'active') === 'pending';
                                            const isBlocked = c.status === 'blocked';
                                            const isActive = c.status === 'active' || !c.status;

                                            return (
                                                <tr key={c.id} className="hover:bg-white/[0.01] transition-colors text-sm text-zinc-300">
                                                    {/* Nome & Email */}
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col gap-1 min-w-[200px]">
                                                            <input
                                                                type="text"
                                                                defaultValue={c.name}
                                                                onChange={e => setDraft(c.id, 'name', e.target.value)}
                                                                className="bg-transparent text-white font-bold border-b border-transparent focus:border-red-500/40 focus:bg-[#0C0C0F] px-1 py-0.5 rounded transition-all outline-none"
                                                            />
                                                            <input
                                                                type="email"
                                                                defaultValue={c.email || ''}
                                                                placeholder="sem e-mail cadastrado"
                                                                onChange={e => setDraft(c.id, 'email', e.target.value)}
                                                                className="bg-transparent text-xs text-zinc-500 border-b border-transparent focus:border-red-500/40 focus:bg-[#0C0C0F] px-1 py-0.5 rounded transition-all outline-none"
                                                            />
                                                        </div>
                                                    </td>

                                                    {/* Telefone CRM */}
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col gap-1 min-w-[130px]">
                                                            <div className="flex items-center gap-1.5">
                                                                <Phone size={12} className="text-zinc-600 shrink-0" />
                                                                <input
                                                                    type="text"
                                                                    defaultValue={c.phone || ''}
                                                                    placeholder="Celular CRM"
                                                                    onChange={e => setDraft(c.id, 'phone', e.target.value)}
                                                                    className={`bg-transparent text-xs font-mono border-b border-transparent focus:border-red-500/40 focus:bg-[#0C0C0F] px-1 py-0.5 rounded transition-all outline-none ${c.missing.phone ? 'text-amber-400 border-amber-600/40' : ''}`}
                                                                />
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Personal Whatsapp */}
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-1.5 min-w-[130px]">
                                                            <Phone size={12} className="text-emerald-600 shrink-0" />
                                                            <input
                                                                type="text"
                                                                defaultValue={c.personal_whatsapp || ''}
                                                                placeholder="5549999999999"
                                                                onChange={e => setDraft(c.id, 'personal_whatsapp', e.target.value)}
                                                                className={`bg-transparent text-xs font-mono border-b border-transparent focus:border-red-500/40 focus:bg-[#0C0C0F] px-1 py-0.5 rounded transition-all outline-none ${c.missing.personal_whatsapp ? 'text-red-400 border-red-600/40' : ''}`}
                                                            />
                                                        </div>
                                                    </td>

                                                    {/* IDs do Auth */}
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col gap-1.5 min-w-[220px]">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-[9px] font-black text-zinc-600 uppercase shrink-0">user_id:</span>
                                                                <input
                                                                    type="text"
                                                                    defaultValue={c.user_id || ''}
                                                                    placeholder="UUID do auth.users (vendedor)"
                                                                    onChange={e => setDraft(c.id, 'user_id', e.target.value)}
                                                                    className={`bg-transparent text-[10px] font-mono border-b border-transparent focus:border-red-500/40 focus:bg-[#0C0C0F] px-1 py-0.5 rounded transition-all outline-none w-full ${c.missing.user_id ? 'text-red-400 border-red-600/40' : ''}`}
                                                                />
                                                            </div>
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-[9px] font-black text-zinc-600 uppercase shrink-0">auth_id:</span>
                                                                <input
                                                                    type="text"
                                                                    defaultValue={c.auth_id || ''}
                                                                    placeholder="UUID de login"
                                                                    onChange={e => setDraft(c.id, 'auth_id', e.target.value)}
                                                                    className="bg-transparent text-[10px] font-mono text-zinc-500 border-b border-transparent focus:border-red-500/40 focus:bg-[#0C0C0F] px-1 py-0.5 rounded transition-all outline-none w-full"
                                                                />
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Status & Role */}
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col gap-2 min-w-[130px]">
                                                            {/* Badge Status */}
                                                            {c.is_unlinked ? (
                                                                <span className="bg-violet-500/10 text-violet-400 border border-violet-500/20 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 w-fit shadow-[0_0_8px_rgba(139,92,246,0.15)]" title="Esta conta está cadastrada apenas no Supabase Auth (possivelmente do site de sorteios), sem registro correspondente no CRM.">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
                                                                    Sem Registro (Auth)
                                                                </span>
                                                            ) : (
                                                                <>
                                                                    {isPending && (
                                                                        <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 w-fit shadow-[0_0_8px_rgba(245,158,11,0.15)]">
                                                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                                                            Pendente
                                                                        </span>
                                                                    )}
                                                                    {isBlocked && (
                                                                        <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 w-fit">
                                                                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                                                            Bloqueado
                                                                        </span>
                                                                    )}
                                                                    {isActive && (
                                                                        <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 w-fit shadow-[0_0_8px_rgba(16,185,129,0.15)]">
                                                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                                            Ativo
                                                                        </span>
                                                                    )}
                                                                </>
                                                            )}

                                                            {/* Cargo / Role */}
                                                            <select
                                                                defaultValue={c.role || ''}
                                                                onChange={e => setDraft(c.id, 'role', e.target.value)}
                                                                className="bg-[#0C0C0F] text-zinc-300 text-xs rounded-lg border border-white/5 p-1.5 focus:border-red-500/40 outline-none cursor-pointer"
                                                            >
                                                                <option value="">Nenhum</option>
                                                                <option value="vendedor">Vendedor</option>
                                                                <option value="admin">Administrador</option>
                                                            </select>
                                                        </div>
                                                    </td>

                                                    {/* Ações */}
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            {/* Botão de Salvar Alterações */}
                                                            {dirty && (
                                                                <button
                                                                    disabled={saving === c.id}
                                                                    onClick={() => save(c)}
                                                                    className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-zinc-800 rounded-xl text-xs font-bold text-white flex items-center gap-1 transition-all"
                                                                >
                                                                    {saving === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                                                    Salvar
                                                                </button>
                                                            )}

                                                            {/* Ações Rápidas por Status */}
                                                            {isPending && (
                                                                <button
                                                                    disabled={saving === c.id}
                                                                    onClick={() => updateStatus(c, 'active')}
                                                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md shadow-emerald-950/20 active:scale-95 cursor-pointer"
                                                                    title="Aprovar Usuário"
                                                                >
                                                                    <UserCheck size={14} />
                                                                    Aprovar
                                                                </button>
                                                            )}

                                                            {isActive && (
                                                                <button
                                                                    disabled={saving === c.id}
                                                                    onClick={() => updateStatus(c, 'blocked')}
                                                                    className="px-3 py-1.5 bg-[#201618] hover:bg-[#34161B] text-red-400 border border-red-500/10 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                                                                    title="Bloquear Acesso"
                                                                >
                                                                    <UserX size={14} />
                                                                    Bloquear
                                                                </button>
                                                            )}

                                                            {isBlocked && (
                                                                <button
                                                                    disabled={saving === c.id}
                                                                    onClick={() => updateStatus(c, 'active')}
                                                                    className="px-3 py-1.5 bg-[#122018] hover:bg-[#163020] text-emerald-400 border border-emerald-500/10 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                                                                    title="Desbloquear Acesso"
                                                                >
                                                                    <UserCheck size={14} />
                                                                    Ativar
                                                                </button>
                                                            )}

                                                            {/* Excluir Permanente */}
                                                            <button
                                                                onClick={() => setConfirmDeleteId(c.id)}
                                                                disabled={deleting !== null || saving !== null}
                                                                className="p-2 bg-zinc-900 border border-white/5 hover:bg-red-950/40 hover:border-red-500/20 text-zinc-500 hover:text-red-400 rounded-xl transition-all cursor-pointer"
                                                                title="Excluir Usuário do CRM"
                                                            >
                                                                <Trash2 size={14} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal de Confirmação de Exclusão */}
            <AnimatePresence>
                {confirmDeleteId && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-[#141418] border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl relative overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-transparent" />
                            <div className="flex gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center shrink-0">
                                    <ShieldAlert size={24} />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-lg font-black text-white">Excluir Usuário?</h3>
                                    <p className="text-sm text-zinc-400 leading-relaxed">
                                        Tem certeza que deseja excluir o usuário <strong className="text-white">{list.find(c => c.id === confirmDeleteId)?.name}</strong>?
                                    </p>
                                    <p className="text-xs text-red-400/80 italic mt-2">
                                        Aviso: Esta ação apagará o consultor do banco de dados do CRM e removerá definitivamente sua conta de login correspondente no Supabase Auth.
                                    </p>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    onClick={() => setConfirmDeleteId(null)}
                                    disabled={deleting !== null}
                                    className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => confirmDeleteId && deleteUser(confirmDeleteId)}
                                    disabled={deleting !== null}
                                    className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:bg-zinc-800 text-white font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-lg shadow-red-950/20 cursor-pointer"
                                >
                                    {deleting !== null ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                    Excluir Registro
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
