// ============ PERFORMANCE: In-Memory Cache ============
// Prevents redundant Supabase queries on re-renders & page navigations
interface CacheEntry<T> {
    data: T;
    expiry: number;
}

const _cache = new Map<string, CacheEntry<any>>();

export function cacheGet<T>(key: string): T | null {
    const entry = _cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
        _cache.delete(key);
        return null;
    }
    return entry.data as T;
}

export function cacheSet<T>(key: string, data: T, ttlMs: number): void {
    _cache.set(key, { data, expiry: Date.now() + ttlMs });
}

export function cacheInvalidate(...patterns: string[]): void {
    for (const key of _cache.keys()) {
        if (patterns.some(p => key.startsWith(p))) {
            _cache.delete(key);
        }
    }
}

// Cache TTLs (in ms)
export const TTL = {
    LEADS: 30_000,         // 30s — leads refresh often
    CONSULTANTS: 120_000,  // 2min — rarely changes
    INVENTORY: 120_000,    // 2min — stock doesn't shift every second
    CAMPAIGNS: 60_000,     // 1min
    METRICS: 30_000,       // 30s
};
