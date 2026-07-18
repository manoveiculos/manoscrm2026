'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { AlertTriangle, Trash2, RefreshCw, ExternalLink } from 'lucide-react';
import ScootersApp from '@/app/renato/_app/ScootersApp';

const ADMIN_EMAILS = ['alexandre_gorges@hotmail.com'];

export default function AdminScootersPage() {
    const [allowed, setAllowed] = useState<boolean | null>(null);
    const [resetting, setResetting] = useState(false);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        (async () => {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            const email = (session?.user?.email || '').toLowerCase();
            if (ADMIN_EMAILS.includes(email)) { setAllowed(true); return; }
            if (session?.user?.id) {
                const { data: c } = await supabase.from('consultants_manos_crm').select('role').eq('auth_id', session.user.id).maybeSingle();
                setAllowed(c?.role === 'admin');
            } else setAllowed(false);
        })();
    }, []);

    const resetAll = async () => {
        if (!confirm('APAGAR TUDO do app do Renato (modelos, vendas, clientes, despesas)? Ação irreversível.')) return;
        if (!confirm('Tem certeza mesmo? Isso zera o negócio inteiro.')) return;
        setResetting(true);
        await fetch('/api/scooters', { method: 'DELETE' });
        setResetting(false);
        setReloadKey((k) => k + 1);
    };

    if (allowed === null) return <div className="p-6 text-gray-400">Verificando acesso…</div>;
    if (!allowed) return (
        <div className="p-10 text-center">
            <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h1 className="text-xl font-bold text-white">Acesso restrito</h1>
            <p className="text-gray-400 text-sm mt-1">Esta área é exclusiva do administrador.</p>
        </div>
    );

    return (
        <div className="p-4 md:p-8 max-w-5xl mx-auto w-full">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">🛴 RG Scooters <span className="text-sm font-normal text-zinc-500">controle admin</span></h1>
                    <p className="text-xs text-gray-500 mt-0.5">App exclusivo do Renato (<code className="text-zinc-400">/renato</code>). Aqui você vê e edita tudo.</p>
                </div>
                <div className="flex items-center gap-2">
                    <a href="/renato" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[12px] text-gray-200">
                        <ExternalLink className="w-4 h-4" /> Abrir como Renato
                    </a>
                    <button onClick={() => setReloadKey((k) => k + 1)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[12px] text-gray-200">
                        <RefreshCw className="w-4 h-4" /> Recarregar
                    </button>
                </div>
            </div>

            {/* App embutido (mesmo do Renato, controle total) */}
            <div className="rounded-2xl overflow-hidden border border-zinc-800 bg-white">
                <ScootersApp key={reloadKey} adminBadge />
            </div>

            {/* Zona de perigo */}
            <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                <div className="flex items-center gap-2 text-red-400 font-semibold text-sm mb-1"><AlertTriangle className="w-4 h-4" /> Zona de perigo</div>
                <p className="text-[12px] text-gray-400 mb-3">Apaga todos os modelos, vendas, clientes e despesas do Renato. Use só pra recomeçar do zero.</p>
                <button onClick={resetAll} disabled={resetting} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-[12px] font-semibold">
                    <Trash2 className="w-4 h-4" /> {resetting ? 'Apagando…' : 'Resetar dados do app'}
                </button>
            </div>
        </div>
    );
}
