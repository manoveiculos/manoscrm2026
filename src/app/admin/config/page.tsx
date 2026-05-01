'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
    Settings, Zap, Clock, Shield, Save, 
    RefreshCw, AlertCircle, CheckCircle2,
    Activity, Timer, BellRing, Wifi
} from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * /admin/config — Centro de Comando SDR
 */

interface Config {
    ai_paused: boolean;
    ai_config: {
        followup_enabled: boolean;
        max_leads_per_day: number;
        start_hour: string;
        end_hour: string;
        cooldown_hours: number;
    };
}

const DEFAULT_CONFIG: Config = {
    ai_paused: false,
    ai_config: {
        followup_enabled: true,
        max_leads_per_day: 100,
        start_hour: '08:00',
        end_hour: '20:00',
        cooldown_hours: 24
    }
};

export default function ConfigPage() {
    const supabase = createClient();
    const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const loadConfig = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('system_settings')
            .select('*');
        
        if (data) {
            const newConfig = { ...DEFAULT_CONFIG };
            data.forEach((item: any) => {
                if (item.id === 'global') newConfig.ai_paused = item.ai_paused;
                if (item.id === 'ai_config') newConfig.ai_config = { ...DEFAULT_CONFIG.ai_config, ...item.value };
            });
            setConfig(newConfig);
        }
        setLoading(false);
    }, [supabase]);

    useEffect(() => {
        loadConfig();
    }, [loadConfig]);

    async function handleSave() {
        setSaving(true);
        setMessage(null);
        try {
            const updates = [
                supabase.from('system_settings').upsert({ id: 'global', ai_paused: config.ai_paused, updated_at: new Date().toISOString() }),
                supabase.from('system_settings').upsert({ id: 'ai_config', value: config.ai_config, updated_at: new Date().toISOString() })
            ];
            
            const results = await Promise.all(updates);
            const error = results.find(r => r.error);
            
            if (error) throw error.error;
            
            setMessage({ type: 'success', text: 'Configurações salvas com sucesso!' });
            setTimeout(() => setMessage(null), 3000);
        } catch (err: any) {
            setMessage({ type: 'error', text: `Erro ao salvar: ${err.message}` });
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8 pb-20">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black text-white flex items-center gap-3">
                        <Settings className="text-blue-500" /> Configurações SDR
                    </h1>
                    <p className="text-zinc-500 text-sm mt-1">Controle global do comportamento da Inteligência Artificial.</p>
                </div>
                <button 
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 transition-all active:scale-95 shadow-xl shadow-blue-900/20"
                >
                    {saving ? <RefreshCw className="animate-spin w-4 h-4" /> : <Save className="w-4 h-4" />}
                    {saving ? 'SALVANDO...' : 'SALVAR ALTERAÇÕES'}
                </button>
            </header>

            {message && (
                <motion.div 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-4 rounded-2xl flex items-center gap-3 border ${message.type === 'success' ? 'bg-emerald-950/20 border-emerald-500/50 text-emerald-400' : 'bg-red-950/20 border-red-500/50 text-red-400'}`}
                >
                    {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                    <span className="font-bold text-sm">{message.text}</span>
                </motion.div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* STATUS DA IA */}
                <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${config.ai_paused ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'}`}>
                            <Zap size={20} />
                        </div>
                        <h2 className="text-lg font-bold text-white">Status da IA</h2>
                    </div>

                    <div className="space-y-4">
                        <label className="flex items-center justify-between p-4 bg-zinc-950 rounded-2xl cursor-pointer hover:bg-zinc-800 transition-colors">
                            <div>
                                <div className="font-bold text-white">IA SDR Geral</div>
                                <div className="text-xs text-zinc-500">Pausa todos os envios automáticos imediatamente.</div>
                            </div>
                            <input 
                                type="checkbox" 
                                checked={!config.ai_paused} 
                                onChange={e => setConfig({ ...config, ai_paused: !e.target.checked })}
                                className="w-6 h-6 rounded-lg accent-blue-500"
                            />
                        </label>

                        <label className="flex items-center justify-between p-4 bg-zinc-950 rounded-2xl cursor-pointer hover:bg-zinc-800 transition-colors">
                            <div>
                                <div className="font-bold text-white">Auto Follow-up</div>
                                <div className="text-xs text-zinc-500">IA tenta reaquecer leads parados automaticamente.</div>
                            </div>
                            <input 
                                type="checkbox" 
                                checked={config.ai_config.followup_enabled} 
                                onChange={e => setConfig({ ...config, ai_config: { ...config.ai_config, followup_enabled: e.target.checked } })}
                                className="w-6 h-6 rounded-lg accent-blue-500"
                            />
                        </label>
                    </div>
                </section>

                {/* LIMITES OPERACIONAIS */}
                <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-orange-500/10 text-orange-500 flex items-center justify-center">
                            <Activity size={20} />
                        </div>
                        <h2 className="text-lg font-bold text-white">Limites SDR</h2>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-black text-zinc-500 uppercase tracking-widest">Máximo de Leads/Dia</label>
                            <input 
                                type="number" 
                                value={config.ai_config.max_leads_per_day}
                                onChange={e => setConfig({ ...config, ai_config: { ...config.ai_config, max_leads_per_day: Number(e.target.value) } })}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-white font-bold focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black text-zinc-500 uppercase tracking-widest">Cooldown de Perda (Horas)</label>
                            <input 
                                type="number" 
                                value={config.ai_config.cooldown_hours}
                                onChange={e => setConfig({ ...config, ai_config: { ...config.ai_config, cooldown_hours: Number(e.target.value) } })}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-white font-bold focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                            />
                        </div>
                    </div>
                </section>

                {/* HORÁRIO DE FUNCIONAMENTO */}
                <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                            <Clock size={20} />
                        </div>
                        <h2 className="text-lg font-bold text-white">Janela de Atendimento</h2>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-black text-zinc-500 uppercase tracking-widest">Início</label>
                            <input 
                                type="time" 
                                value={config.ai_config.start_hour}
                                onChange={e => setConfig({ ...config, ai_config: { ...config.ai_config, start_hour: e.target.value } })}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-white font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-black text-zinc-500 uppercase tracking-widest">Fim</label>
                            <input 
                                type="time" 
                                value={config.ai_config.end_hour}
                                onChange={e => setConfig({ ...config, ai_config: { ...config.ai_config, end_hour: e.target.value } })}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-white font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </div>
                </section>

                {/* INTEGRAÇÕES */}
                <section className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                            <Wifi size={20} />
                        </div>
                        <h2 className="text-lg font-bold text-white">Integrações (API)</h2>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-black text-zinc-500 uppercase tracking-widest">Webhook Universal</label>
                            <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 font-mono text-[10px] text-zinc-400 break-all select-all">
                                https://manoscrm.com.br/api/webhook/universal
                            </div>
                            <p className="text-[10px] text-zinc-600">Use esta URL no Zapier, n8n ou Pipedream para enviar leads de qualquer fonte.</p>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
