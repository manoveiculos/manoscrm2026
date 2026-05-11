'use client';

/**
 * Skeletons reutilizáveis pra `loading.tsx` das rotas.
 *
 * Por que? Sem loading.tsx, o Next.js segura a navegação até a página inteira
 * renderizar. UX vira "parece travado". Com skeleton, o app responde
 * instantaneamente e o usuário vê algo se preenchendo.
 */

function Pulse({ className = '' }: { className?: string }) {
    return <div className={`animate-pulse bg-zinc-800/60 rounded ${className}`} />;
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
    return (
        <div className="space-y-3 p-6">
            <Pulse className="h-8 w-48 mb-6" />
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/50">
                    <Pulse className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                        <Pulse className="h-4 w-1/3" />
                        <Pulse className="h-3 w-1/2" />
                    </div>
                    <Pulse className="h-8 w-20" />
                </div>
            ))}
        </div>
    );
}

export function DashboardSkeleton() {
    return (
        <div className="p-6 space-y-6">
            <Pulse className="h-10 w-64" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-xl bg-zinc-900/40 border border-zinc-800/50 p-4 space-y-2">
                        <Pulse className="h-3 w-20" />
                        <Pulse className="h-8 w-16" />
                    </div>
                ))}
            </div>
            <div className="rounded-xl bg-zinc-900/40 border border-zinc-800/50 p-4 space-y-3">
                <Pulse className="h-5 w-32" />
                <Pulse className="h-64 w-full" />
            </div>
        </div>
    );
}

export function LeadDetailSkeleton() {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_280px] gap-4 p-6">
            <div className="space-y-3">
                <Pulse className="h-6 w-32" />
                <Pulse className="h-4 w-24" />
                <Pulse className="h-24 w-full rounded-xl" />
                <Pulse className="h-32 w-full rounded-xl" />
            </div>
            <div className="space-y-3">
                <Pulse className="h-6 w-40" />
                <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Pulse key={i} className="h-12 w-full rounded-lg" />
                    ))}
                </div>
            </div>
            <div className="space-y-3">
                <Pulse className="h-12 w-full rounded-xl" />
                <Pulse className="h-12 w-full rounded-xl" />
                <Pulse className="h-12 w-full rounded-xl" />
            </div>
        </div>
    );
}

export function GenericSkeleton() {
    return (
        <div className="p-6 space-y-4">
            <Pulse className="h-8 w-48" />
            <Pulse className="h-4 w-3/4" />
            <Pulse className="h-64 w-full rounded-xl" />
        </div>
    );
}
