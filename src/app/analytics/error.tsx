'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function AnalyticsError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[Analytics Error Boundary]', error);
    }, [error]);

    return (
        <div className="min-h-screen bg-[#0A0A0C] flex items-center justify-center p-6">
            <div className="max-w-md w-full bg-[#141418] border border-red-500/20 rounded-2xl p-8 text-center space-y-4">
                <div className="h-14 w-14 rounded-2xl bg-red-600/10 border border-red-500/20 flex items-center justify-center mx-auto">
                    <AlertTriangle size={24} className="text-red-500" />
                </div>
                <h2 className="text-lg font-bold text-white">Analytics travou</h2>
                <p className="text-sm text-white/40">
                    Um erro inesperado impediu o carregamento das métricas.
                </p>
                <button
                    onClick={reset}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                    <RotateCcw size={14} />
                    Tentar novamente
                </button>
                <p className="text-[10px] text-white/20 font-mono">{error.digest || error.message}</p>
            </div>
        </div>
    );
}
