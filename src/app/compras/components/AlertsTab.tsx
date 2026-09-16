'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Sparkles, Phone, User, Car, Bell, Trash2, AlertTriangle, CheckCircle2,
    Activity, ToggleLeft, ToggleRight, Search, X, Send, RefreshCw, Clock,
    ShieldAlert, Radio, History, UserCheck,
} from 'lucide-react';
import { tentarNormalizarCelular } from '@/lib/compras/alertas/telefone';

interface ResumoDisparos {
    enviados: number;
    falhas: number;
    ultimo: string | null;
}

interface AlertaCliente {
    id: string;
    nome_cliente: string;
    telefone_cliente: string;
    cliente_final: string | null;
    marca: string;
    modelo: string;
    valor_minimo: number | null;
    valor_maximo: number | null;
    ano_minimo: number | null;
    ano_maximo: number | null;
    cor: string | null;
    cambio: string | null;
    combustivel: string | null;
    km_minimo: number | null;
    km_maximo: number | null;
    ativo: boolean;
    criado_em: string;
    criado_por: string | null;
    disparos?: ResumoDisparos;
}

interface StatusMotor {
    saude: 'ok' | 'atencao' | 'critico';
    diagnostico: string[];
    metricas: {
        carros_24h: number;
        alertas_ativos: number;
        avisos_enviados_24h: number;
        avisos_pendentes: number;
        falhas_24h: number;
        duplicados_barrados_24h: number;
        ultimo_carro: string | null;
        minutos_desde_ultimo_carro: number | null;
    };
    historico: Array<{
        id: string;
        destinatario: string | null;
        veiculo_descricao: string | null;
        veiculo_preco: number | null;
        status: string;
        erro: string | null;
        criado_em: string;
    }>;
}

const BRANDS = [
    'CHEVROLET', 'FIAT', 'FORD', 'HONDA', 'HYUNDAI', 'JEEP', 'MITSUBISHI',
    'NISSAN', 'RENAULT', 'TOYOTA', 'VOLKSWAGEN', 'TODAS',
];

const ROTULO_STATUS: Record<string, { texto: string; classe: string }> = {
    enviado: { texto: 'Entregue', classe: 'text-emerald-400 border-emerald-500/20 bg-emerald-950/20' },
    teste: { texto: 'Teste', classe: 'text-sky-400 border-sky-500/20 bg-sky-950/20' },
    pendente: { texto: 'Na fila', classe: 'text-amber-400 border-amber-500/20 bg-amber-950/20' },
    falhou: { texto: 'Falhou', classe: 'text-red-400 border-red-500/20 bg-red-950/20' },
    telefone_invalido: { texto: 'WhatsApp inválido', classe: 'text-red-400 border-red-500/20 bg-red-950/20' },
    bloqueado_limite: { texto: 'Limite diário', classe: 'text-orange-400 border-orange-500/20 bg-orange-950/20' },
    duplicado: { texto: 'Repetido', classe: 'text-zinc-400 border-zinc-800 bg-zinc-900/40' },
    expirado: { texto: 'Expirou', classe: 'text-zinc-400 border-zinc-800 bg-zinc-900/40' },
};

function tempoRelativo(iso: string | null): string {
    if (!iso) return 'nunca';
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return 'agora';
    if (min < 60) return `há ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `há ${h}h`;
    return `há ${Math.round(h / 24)}d`;
}

export default function AlertsTab() {
    const [alerts, setAlerts] = useState<AlertaCliente[]>([]);
    const [status, setStatus] = useState<StatusMotor | null>(null);
    const [usuario, setUsuario] = useState<{ email: string; nome: string | null; whatsapp: string | null } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [mostrarHistorico, setMostrarHistorico] = useState(false);
    const [testando, setTestando] = useState<string | null>(null);

    // Filtros
    const [searchTerm, setSearchTerm] = useState('');
    const [filterBrand, setFilterBrand] = useState('TODAS');
    const [filterStatus, setFilterStatus] = useState('TODOS');

    // Formulário
    const [nome, setNome] = useState('');
    const [telefone, setTelefone] = useState('');
    const [clienteFinal, setClienteFinal] = useState('');
    const [marca, setMarca] = useState('');
    const [modelo, setModelo] = useState('');
    const [valorMinimo, setValorMinimo] = useState('');
    const [valorMaximo, setValorMaximo] = useState('');
    const [anoMinimo, setAnoMinimo] = useState('');
    const [anoMaximo, setAnoMaximo] = useState('');
    const [cor, setCor] = useState('');
    const [cambio, setCambio] = useState('');
    const [combustivel, setCombustivel] = useState('');
    const [kmMinimo, setKmMinimo] = useState('');
    const [kmMaximo, setKmMaximo] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const carregar = useCallback(async () => {
        try {
            const [resAlertas, resStatus] = await Promise.all([
                fetch('/api/compras/alertas'),
                fetch('/api/compras/alertas/status'),
            ]);

            const dataAlertas = await resAlertas.json();
            if (!resAlertas.ok || !dataAlertas.success) {
                throw new Error(dataAlertas.error || 'Erro ao carregar os alertas.');
            }
            setAlerts(dataAlertas.alerts || []);
            setUsuario(dataAlertas.usuario || null);

            if (resStatus.ok) {
                const dataStatus = await resStatus.json();
                if (dataStatus.success) setStatus(dataStatus);
            }
        } catch (err: any) {
            setError(err.message || 'Falha ao buscar alertas ativos do banco.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        carregar();
        const timer = setInterval(carregar, 60000);
        return () => clearInterval(timer);
    }, [carregar]);

    const telefoneValidado = telefone ? tentarNormalizarCelular(telefone) : null;
    const telefoneRuim = telefone.replace(/\D/g, '').length >= 10 && !telefoneValidado;

    const filteredAlerts = alerts.filter(alerta => {
        const busca = searchTerm.toLowerCase();
        const matchesSearch =
            alerta.nome_cliente.toLowerCase().includes(busca) ||
            alerta.modelo.toLowerCase().includes(busca) ||
            (alerta.cliente_final || '').toLowerCase().includes(busca);
        const matchesBrand = filterBrand === 'TODAS' || alerta.marca?.toUpperCase() === filterBrand;
        const matchesStatus =
            filterStatus === 'TODOS' ||
            (filterStatus === 'ATIVOS' && alerta.ativo) ||
            (filterStatus === 'INATIVOS' && !alerta.ativo);
        return matchesSearch && matchesBrand && matchesStatus;
    });

    const formatPhoneNumber = (value: string) => {
        const n = value.replace(/\D/g, '').slice(0, 11);
        if (n.length < 3) return n;
        if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
        if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
        return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
    };

    const formatCurrencyInput = (value: string) => {
        const clean = value.replace(/\D/g, '');
        if (!clean) return '';
        return (parseFloat(clean) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    };

    const usarMeusDados = () => {
        if (usuario?.nome) setNome(usuario.nome);
        if (usuario?.whatsapp) setTelefone(formatPhoneNumber(usuario.whatsapp));
    };

    const limparFormulario = () => {
        setNome(''); setTelefone(''); setClienteFinal(''); setMarca(''); setModelo('');
        setValorMinimo(''); setValorMaximo(''); setAnoMinimo(''); setAnoMaximo('');
        setCor(''); setCambio(''); setCombustivel(''); setKmMinimo(''); setKmMaximo('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSuccessMsg(null);

        if (!nome || !telefone || !modelo) {
            setError('Preencha quem recebe o aviso, o WhatsApp e o modelo desejado.');
            return;
        }
        if (!telefoneValidado) {
            setError('O WhatsApp está incompleto. Sem número válido o aviso não sai do lugar.');
            return;
        }

        setSubmitting(true);
        const parseCurrency = (val: string) => {
            const raw = val.replace(/\D/g, '');
            return raw ? parseFloat(raw) / 100 : null;
        };

        try {
            const res = await fetch('/api/compras/alertas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nome_cliente: nome,
                    telefone_cliente: telefoneValidado.nacional,
                    cliente_final: clienteFinal,
                    marca, modelo,
                    valor_minimo: parseCurrency(valorMinimo),
                    valor_maximo: parseCurrency(valorMaximo),
                    ano_minimo: anoMinimo ? Number(anoMinimo) : null,
                    ano_maximo: anoMaximo ? Number(anoMaximo) : null,
                    cor, cambio, combustivel,
                    km_minimo: kmMinimo ? Number(kmMinimo) : null,
                    km_maximo: kmMaximo ? Number(kmMaximo) : null,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Erro ao criar alerta.');

            setAlerts(prev => [data.alert, ...prev]);
            setSuccessMsg(`Monitorando ${modelo}. O aviso vai para ${telefoneValidado.formatado} assim que o carro aparecer.`);
            limparFormulario();
            setTimeout(() => setSuccessMsg(null), 6000);
        } catch (err: any) {
            setError(err.message || 'Falha ao ativar monitoramento.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleToggleAlert = async (id: string, currentStatus: boolean) => {
        try {
            const res = await fetch('/api/compras/alertas', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, ativo: !currentStatus }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error);
            setAlerts(prev => prev.map(a => (a.id === id ? { ...a, ...data.alert } : a)));
        } catch {
            setError('Não foi possível alternar o status do alerta.');
        }
    };

    const handleDeleteAlert = async (id: string) => {
        if (!confirm('Deseja realmente excluir este monitoramento?')) return;
        try {
            const res = await fetch(`/api/compras/alertas?id=${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error);
            setAlerts(prev => prev.filter(a => a.id !== id));
        } catch {
            setError('Não foi possível remover o alerta.');
        }
    };

    const handleTestar = async (id: string) => {
        setTestando(id);
        setError(null);
        setSuccessMsg(null);
        try {
            const res = await fetch('/api/compras/alertas/testar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ alerta_id: id }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Falha no teste.');
            setSuccessMsg(data.message);
            setTimeout(() => setSuccessMsg(null), 6000);
            carregar();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setTestando(null);
        }
    };

    const formatDisplayPhone = (phone: string) => {
        const c = (phone || '').replace(/\D/g, '').replace(/^55/, '');
        if (c.length === 11) return `(${c.slice(0, 2)}) ${c.slice(2, 7)}-${c.slice(7)}`;
        if (c.length === 10) return `(${c.slice(0, 2)}) ${c.slice(2, 6)}-${c.slice(6)}`;
        return phone;
    };

    const coresSaude = {
        ok: 'border-emerald-500/20 bg-emerald-950/10',
        atencao: 'border-amber-500/25 bg-amber-950/10',
        critico: 'border-red-500/30 bg-red-950/15',
    };

    return (
        <div className="flex flex-col gap-6 w-full">
            {error && (
                <div className="p-4 bg-red-950/20 border border-red-500/20 text-red-400 text-sm rounded-xl flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="ml-auto text-red-400/60 hover:text-red-400 cursor-pointer">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {successMsg && (
                <div className="p-4 bg-emerald-950/20 border border-emerald-500/20 text-emerald-400 text-sm rounded-xl flex items-start gap-2.5">
                    <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
                    <span>{successMsg}</span>
                </div>
            )}

            {/* ── Saúde do motor ─────────────────────────────────────────── */}
            {status && (
                <section className={`glass-panel border rounded-2xl p-5 flex flex-col gap-4 ${coresSaude[status.saude]}`}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2.5">
                            <Radio className={`w-5 h-5 ${status.saude === 'ok' ? 'text-emerald-400' : status.saude === 'atencao' ? 'text-amber-400' : 'text-red-400'}`} />
                            <div>
                                <h2 className="font-bold text-white text-sm">
                                    {status.saude === 'ok' ? 'Radar no ar e avisando' : status.saude === 'atencao' ? 'Radar no ar, com pendências' : 'Radar com problema'}
                                </h2>
                                <p className="text-[11px] text-zinc-400 mt-0.5">
                                    {status.metricas.ultimo_carro
                                        ? `Último carro capturado: ${status.metricas.ultimo_carro} (${status.metricas.minutos_desde_ultimo_carro} min atrás)`
                                        : 'Nenhum carro capturado ainda'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setMostrarHistorico(v => !v)}
                                className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                            >
                                <History className="w-3.5 h-3.5" />
                                {mostrarHistorico ? 'Ocultar' : 'Ver'} últimos avisos
                            </button>
                            <button
                                onClick={carregar}
                                className="p-2 rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                                title="Atualizar"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {[
                            { rotulo: 'Carros captados 24h', valor: status.metricas.carros_24h, cor: 'text-white' },
                            { rotulo: 'Alertas ativos', valor: status.metricas.alertas_ativos, cor: 'text-white' },
                            { rotulo: 'Avisos entregues 24h', valor: status.metricas.avisos_enviados_24h, cor: status.metricas.avisos_enviados_24h > 0 ? 'text-emerald-400' : 'text-zinc-500' },
                            { rotulo: 'Na fila anti-ban', valor: status.metricas.avisos_pendentes, cor: 'text-amber-400' },
                            { rotulo: 'Falhas 24h', valor: status.metricas.falhas_24h, cor: status.metricas.falhas_24h > 0 ? 'text-red-400' : 'text-zinc-500' },
                        ].map(m => (
                            <div key={m.rotulo} className="bg-zinc-950/60 border border-zinc-900 rounded-xl px-3 py-2.5">
                                <span className={`block text-xl font-extrabold ${m.cor}`}>{m.valor}</span>
                                <span className="block text-[9px] font-bold text-zinc-500 uppercase tracking-wider mt-0.5">{m.rotulo}</span>
                            </div>
                        ))}
                    </div>

                    {status.diagnostico.length > 0 && (
                        <div className="flex flex-col gap-1.5 border-t border-zinc-900/60 pt-3">
                            {status.diagnostico.map((d, i) => (
                                <div key={i} className="flex items-start gap-2 text-[11px] text-amber-300/90">
                                    <ShieldAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                    <span>{d}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {mostrarHistorico && (
                        <div className="border-t border-zinc-900/60 pt-3 flex flex-col gap-1.5 max-h-72 overflow-y-auto">
                            {status.historico.length === 0 ? (
                                <span className="text-[11px] text-zinc-500 py-3 text-center">Nenhum aviso registrado ainda.</span>
                            ) : (
                                status.historico.map(h => {
                                    const rot = ROTULO_STATUS[h.status] || { texto: h.status, classe: 'text-zinc-400 border-zinc-800 bg-zinc-900/40' };
                                    return (
                                        <div key={h.id} className="flex items-center gap-3 text-[11px] py-1.5 border-b border-zinc-900/40 last:border-0">
                                            <span className={`shrink-0 font-bold px-2 py-0.5 rounded border ${rot.classe}`}>{rot.texto}</span>
                                            <span className="text-zinc-300 font-semibold truncate flex-1">{h.veiculo_descricao || '—'}</span>
                                            <span className="text-zinc-500 truncate hidden sm:block">→ {h.destinatario}</span>
                                            <span className="text-zinc-600 shrink-0">{tempoRelativo(h.criado_em)}</span>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </section>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* ── Formulário ─────────────────────────────────────────── */}
                <section className="lg:col-span-5">
                    <div className="glass-panel border border-zinc-850 rounded-2xl p-6 flex flex-col gap-5">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 bg-primary/10 border border-primary/20 rounded-xl text-primary">
                                <Bell className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="font-bold text-white text-lg">Novo Monitoramento</h2>
                                <p className="text-xs text-zinc-400 mt-0.5">O aviso cai no WhatsApp assim que o carro aparecer nos grupos</p>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Quem recebe o aviso *</label>
                                    {usuario?.nome && (
                                        <button
                                            type="button" onClick={usarMeusDados}
                                            className="inline-flex items-center gap-1 text-[10px] font-bold text-primary hover:text-primary/80 cursor-pointer bg-transparent border-0"
                                        >
                                            <UserCheck className="w-3 h-3" /> Sou eu
                                        </button>
                                    )}
                                </div>
                                <div className="relative">
                                    <User className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
                                    <input
                                        type="text" required placeholder="Ex: Wilson" value={nome}
                                        onChange={(e) => setNome(e.target.value)}
                                        className="w-full bg-zinc-950 border border-zinc-900 rounded-xl pl-9 pr-4 py-3 text-zinc-200 text-sm focus:outline-none focus:border-zinc-850 transition-colors"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">WhatsApp do vendedor *</label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
                                    <input
                                        type="tel" inputMode="numeric" required placeholder="(47) 99999-9999" value={telefone}
                                        onChange={(e) => setTelefone(formatPhoneNumber(e.target.value))}
                                        className={`w-full bg-zinc-950 border rounded-xl pl-9 pr-9 py-3 text-zinc-200 text-sm focus:outline-none transition-colors ${
                                            telefoneRuim ? 'border-red-500/40' : telefoneValidado ? 'border-emerald-500/30' : 'border-zinc-900 focus:border-zinc-850'
                                        }`}
                                    />
                                    {telefoneValidado && <CheckCircle2 className="absolute right-3 top-3.5 w-4 h-4 text-emerald-400" />}
                                </div>
                                {telefoneRuim && (
                                    <span className="text-[10px] text-red-400 font-semibold">
                                        Celular precisa de DDD + 9 dígitos. Sem isso o WhatsApp não é entregue.
                                    </span>
                                )}
                                {telefoneValidado?.corrigido && (
                                    <span className="text-[10px] text-amber-400 font-semibold">
                                        Faltava o 9 — vamos salvar como {telefoneValidado.formatado}.
                                    </span>
                                )}
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Cliente que está procurando</label>
                                <div className="relative">
                                    <User className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
                                    <input
                                        type="text" placeholder="Ex: Sr. Osmar (opcional)" value={clienteFinal}
                                        onChange={(e) => setClienteFinal(e.target.value)}
                                        className="w-full bg-zinc-950 border border-zinc-900 rounded-xl pl-9 pr-4 py-3 text-zinc-200 text-sm focus:outline-none focus:border-zinc-850 transition-colors"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Modelo / Palavra-chave *</label>
                                <input
                                    type="text" required placeholder="Ex: Hilux, Triton, S10" value={modelo}
                                    onChange={(e) => setModelo(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-900 rounded-xl px-4 py-3 text-zinc-200 text-sm focus:outline-none focus:border-zinc-850 transition-colors"
                                />
                                <span className="text-[10px] text-zinc-500">
                                    Pode separar por vírgula (Hilux, S10, Ranger). Erro de digitação o sistema corrige sozinho.
                                </span>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Marca (opcional)</label>
                                <div className="relative">
                                    <Car className="absolute left-3 top-3.5 w-4 h-4 text-zinc-500" />
                                    <input
                                        type="text" placeholder="Em branco = qualquer marca" value={marca}
                                        onChange={(e) => setMarca(e.target.value)}
                                        className="w-full bg-zinc-950 border border-zinc-900 rounded-xl pl-9 pr-4 py-3 text-zinc-200 text-sm focus:outline-none focus:border-zinc-850 transition-colors"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-2 my-1">
                                <div className="h-px bg-zinc-900 flex-1" />
                                <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">Filtros Avançados (Opcional)</span>
                                <div className="h-px bg-zinc-900 flex-1" />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <input type="number" placeholder="Ano Min" value={anoMinimo} onChange={(e) => setAnoMinimo(e.target.value)}
                                    className="bg-zinc-950 border border-zinc-900 rounded-xl px-3 py-2.5 text-zinc-200 text-xs focus:outline-none focus:border-zinc-850 transition-colors" />
                                <input type="number" placeholder="Ano Max" value={anoMaximo} onChange={(e) => setAnoMaximo(e.target.value)}
                                    className="bg-zinc-950 border border-zinc-900 rounded-xl px-3 py-2.5 text-zinc-200 text-xs focus:outline-none focus:border-zinc-850 transition-colors" />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <input type="number" placeholder="KM Min" value={kmMinimo} onChange={(e) => setKmMinimo(e.target.value)}
                                    className="bg-zinc-950 border border-zinc-900 rounded-xl px-3 py-2.5 text-zinc-200 text-xs focus:outline-none focus:border-zinc-850 transition-colors" />
                                <input type="number" placeholder="KM Max" value={kmMaximo} onChange={(e) => setKmMaximo(e.target.value)}
                                    className="bg-zinc-950 border border-zinc-900 rounded-xl px-3 py-2.5 text-zinc-200 text-xs focus:outline-none focus:border-zinc-850 transition-colors" />
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                <input type="text" placeholder="Cor" value={cor} onChange={(e) => setCor(e.target.value)}
                                    className="bg-zinc-950 border border-zinc-900 rounded-xl px-3 py-2.5 text-zinc-200 text-xs focus:outline-none focus:border-zinc-850 transition-colors" />
                                <select value={cambio} onChange={(e) => setCambio(e.target.value)}
                                    className="bg-zinc-950 border border-zinc-900 rounded-xl px-2 py-2.5 text-zinc-350 text-xs font-semibold focus:outline-none focus:border-zinc-850 transition-colors cursor-pointer">
                                    <option value="">Câmbio</option>
                                    <option value="AUTOMATICO">Automático</option>
                                    <option value="MANUAL">Manual</option>
                                </select>
                                <select value={combustivel} onChange={(e) => setCombustivel(e.target.value)}
                                    className="bg-zinc-950 border border-zinc-900 rounded-xl px-2 py-2.5 text-zinc-350 text-xs font-semibold focus:outline-none focus:border-zinc-850 transition-colors cursor-pointer">
                                    <option value="">Combustível</option>
                                    <option value="FLEX">Flex</option>
                                    <option value="GASOLINA">Gasolina</option>
                                    <option value="DIESEL">Diesel</option>
                                    <option value="HIBRIDO">Híbrido</option>
                                    <option value="ELETRICO">Elétrico</option>
                                </select>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Faixa de Preço</label>
                                <div className="flex items-center gap-2">
                                    <input type="text" placeholder="Mínimo" value={valorMinimo} onChange={(e) => setValorMinimo(formatCurrencyInput(e.target.value))}
                                        className="w-full bg-zinc-950 border border-zinc-900 rounded-xl px-3 py-2.5 text-zinc-200 text-xs focus:outline-none focus:border-zinc-850 transition-colors" />
                                    <span className="text-zinc-500 text-xs">até</span>
                                    <input type="text" placeholder="Máximo" value={valorMaximo} onChange={(e) => setValorMaximo(formatCurrencyInput(e.target.value))}
                                        className="w-full bg-zinc-950 border border-zinc-900 rounded-xl px-3 py-2.5 text-zinc-200 text-xs focus:outline-none focus:border-zinc-850 transition-colors" />
                                </div>
                            </div>

                            <button
                                type="submit" disabled={submitting || telefoneRuim}
                                className="w-full mt-2 py-3.5 px-6 rounded-xl bg-primary hover:bg-primary/95 text-white font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {submitting ? 'Ativando...' : 'Ativar Monitoramento 24h'}
                                <Sparkles className="w-4 h-4" />
                            </button>
                        </form>
                    </div>
                </section>

                {/* ── Listagem ───────────────────────────────────────────── */}
                <section className="lg:col-span-7 flex flex-col gap-5">
                    <div className="flex items-center justify-between">
                        <h3 className="font-bold text-white text-lg flex items-center gap-2">
                            <Activity className="w-5 h-5 text-emerald-400" /> Fila de Espera Ativa
                        </h3>
                        <span className="text-xs text-zinc-550 font-medium">{alerts.length} cadastrados</span>
                    </div>

                    {!loading && alerts.length > 0 && (
                        <div className="glass-panel border border-zinc-900 rounded-2xl p-3 flex flex-col sm:flex-row gap-3 items-center">
                            <div className="relative w-full sm:flex-1">
                                <Search className="absolute left-3 top-3 w-4 h-4 text-zinc-500" />
                                <input
                                    type="text" placeholder="Buscar vendedor, cliente ou modelo..." value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-900 rounded-xl pl-9 pr-9 py-2 text-zinc-200 text-xs focus:outline-none focus:border-zinc-850 transition-colors"
                                />
                                {searchTerm && (
                                    <button onClick={() => setSearchTerm('')} className="absolute right-3 top-2.5 text-zinc-550 cursor-pointer">
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            <select value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)}
                                className="w-full sm:w-40 bg-zinc-950 border border-zinc-900 rounded-xl px-3 py-2 text-zinc-350 text-xs font-semibold focus:outline-none cursor-pointer">
                                <option value="TODAS">TODAS AS MARCAS</option>
                                {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                            </select>

                            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                                className="w-full sm:w-32 bg-zinc-950 border border-zinc-900 rounded-xl px-3 py-2 text-zinc-350 text-xs font-semibold focus:outline-none cursor-pointer">
                                <option value="TODOS">TODOS</option>
                                <option value="ATIVOS">ATIVOS</option>
                                <option value="INATIVOS">INATIVOS</option>
                            </select>
                        </div>
                    )}

                    {loading ? (
                        <div className="glass-panel border border-zinc-900 rounded-2xl p-16 flex flex-col items-center justify-center text-center">
                            <div className="w-10 h-10 border-2 border-primary/20 border-t-primary rounded-full animate-spin mb-3" />
                            <span className="text-xs text-zinc-400">Carregando monitoramentos...</span>
                        </div>
                    ) : filteredAlerts.length === 0 ? (
                        <div className="glass-panel border border-zinc-900 border-dashed rounded-2xl p-12 text-center text-zinc-500">
                            Nenhum alerta encontrado.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {filteredAlerts.map(alerta => {
                                const telOk = !!tentarNormalizarCelular(alerta.telefone_cliente);
                                const disparos = alerta.disparos || { enviados: 0, falhas: 0, ultimo: null };
                                return (
                                    <div
                                        key={alerta.id}
                                        className={`glass-panel border rounded-2xl p-5 flex flex-col justify-between gap-4 transition-all relative overflow-hidden ${
                                            alerta.ativo ? 'border-zinc-850 bg-zinc-900/10' : 'border-zinc-900/60 bg-zinc-950/20 opacity-50'
                                        }`}
                                    >
                                        {alerta.ativo && <div className="absolute top-0 right-0 w-2 h-2 bg-emerald-500 rounded-full m-3 animate-pulse" />}

                                        <div className="flex flex-col gap-2.5">
                                            <div className="flex justify-between items-start gap-2">
                                                <div className="min-w-0">
                                                    <span className="font-extrabold text-sm text-white block truncate">{alerta.nome_cliente}</span>
                                                    <span className={`text-[10px] font-semibold block mt-0.5 ${telOk ? 'text-zinc-500' : 'text-red-400'}`}>
                                                        {formatDisplayPhone(alerta.telefone_cliente)}
                                                        {!telOk && ' · número inválido'}
                                                    </span>
                                                </div>
                                                <span className="text-[9px] font-bold px-2 py-0.5 rounded border uppercase border-zinc-800 bg-zinc-900/50 text-zinc-400 shrink-0">
                                                    {alerta.marca || 'TODAS'}
                                                </span>
                                            </div>

                                            <div className="h-px bg-zinc-900/60" />

                                            <div className="flex flex-col gap-1 text-xs">
                                                <div className="flex justify-between text-zinc-400">
                                                    <span>Procura:</span>
                                                    <span className="text-zinc-200 font-bold capitalize truncate ml-2">{alerta.modelo}</span>
                                                </div>
                                                {alerta.cliente_final && (
                                                    <div className="flex justify-between text-zinc-400">
                                                        <span>Cliente:</span>
                                                        <span className="text-zinc-300 font-semibold truncate ml-2">{alerta.cliente_final}</span>
                                                    </div>
                                                )}
                                                <div className="flex justify-between text-zinc-400">
                                                    <span>Preço:</span>
                                                    <span className="text-emerald-400 font-bold">
                                                        {alerta.valor_minimo || alerta.valor_maximo
                                                            ? `${alerta.valor_minimo ? alerta.valor_minimo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : 'R$ 0'} - ${alerta.valor_maximo ? alerta.valor_maximo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }) : 'Sem limite'}`
                                                            : 'Qualquer valor'}
                                                    </span>
                                                </div>
                                            </div>

                                            {(alerta.ano_minimo || alerta.ano_maximo || alerta.km_maximo || alerta.cor || alerta.cambio || alerta.combustivel) && (
                                                <div className="flex flex-wrap gap-1.5 mt-1">
                                                    {(alerta.ano_minimo || alerta.ano_maximo) && (
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-950 text-zinc-400">
                                                            Ano: {alerta.ano_minimo || '—'} a {alerta.ano_maximo || '—'}
                                                        </span>
                                                    )}
                                                    {alerta.km_maximo && (
                                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-950 text-zinc-400">
                                                            Até {alerta.km_maximo.toLocaleString('pt-BR')} km
                                                        </span>
                                                    )}
                                                    {alerta.cor && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-950 text-zinc-400 capitalize">Cor: {alerta.cor}</span>}
                                                    {alerta.cambio && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-zinc-850 bg-primary/10 text-primary uppercase">{alerta.cambio === 'AUTOMATICO' ? 'AUT' : 'MAN'}</span>}
                                                    {alerta.combustivel && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-zinc-850 bg-emerald-950/30 text-emerald-400 uppercase">{alerta.combustivel}</span>}
                                                </div>
                                            )}

                                            {/* Prova de entrega: o que esse alerta já fez */}
                                            <div className="flex items-center gap-3 text-[10px] text-zinc-500 border-t border-zinc-900/60 pt-2.5">
                                                <span className="inline-flex items-center gap-1">
                                                    <Send className="w-3 h-3" />
                                                    <strong className={disparos.enviados > 0 ? 'text-emerald-400' : 'text-zinc-500'}>{disparos.enviados}</strong> avisos
                                                </span>
                                                <span className="inline-flex items-center gap-1">
                                                    <Clock className="w-3 h-3" /> {tempoRelativo(disparos.ultimo)}
                                                </span>
                                                {disparos.falhas > 0 && (
                                                    <span className="inline-flex items-center gap-1 text-red-400">
                                                        <AlertTriangle className="w-3 h-3" /> {disparos.falhas}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between border-t border-zinc-900/60 pt-3">
                                            <button
                                                type="button" onClick={() => handleToggleAlert(alerta.id, alerta.ativo)}
                                                className="inline-flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 hover:text-white transition-colors cursor-pointer border-0 bg-transparent"
                                            >
                                                {alerta.ativo ? <ToggleRight className="w-5 h-5 text-emerald-400" /> : <ToggleLeft className="w-5 h-5 text-zinc-650" />}
                                                {alerta.ativo ? 'Ativo' : 'Inativo'}
                                            </button>

                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button" onClick={() => handleTestar(alerta.id)} disabled={testando === alerta.id}
                                                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-300 hover:text-white hover:border-zinc-700 transition-all cursor-pointer disabled:opacity-50"
                                                    title="Enviar um WhatsApp de teste agora"
                                                >
                                                    <Send className="w-3 h-3" />
                                                    {testando === alerta.id ? 'Enviando...' : 'Testar'}
                                                </button>
                                                <button
                                                    type="button" onClick={() => handleDeleteAlert(alerta.id)}
                                                    className="p-1.5 rounded-lg border border-zinc-900 hover:border-red-900 bg-zinc-950 hover:bg-red-950/20 text-zinc-500 hover:text-red-400 transition-all cursor-pointer"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
