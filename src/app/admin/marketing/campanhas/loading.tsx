export default function Loading() {
    return (
        <div className="py-24 flex flex-col items-center gap-4">
            <div className="h-10 w-10 border-2 border-red-500/20 border-t-red-600 rounded-full animate-spin" />
            <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.3em]">Carregando campanhas…</p>
        </div>
    );
}
