export default function Loading() {
    return (
        <div className="w-full max-w-2xl mx-auto md:px-6 md:py-8 space-y-3">
            <div className="h-8 w-40 rounded-lg bg-white/[0.05] animate-pulse" />
            <div className="h-24 rounded-2xl bg-white/[0.03] border border-white/[0.05] animate-pulse" />
            {[0, 1, 2].map(i => <div key={i} className="h-52 rounded-2xl bg-white/[0.03] border border-white/[0.05] animate-pulse" />)}
        </div>
    );
}
