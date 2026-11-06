/** Mensagem legível de qualquer coisa lançada (Error, string, objeto). */
export function msgErro(e: unknown, padrao = 'erro desconhecido'): string {
    if (e instanceof Error) return e.message || padrao;
    if (typeof e === 'string') return e || padrao;
    if (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
        return (e as { message: string }).message || padrao;
    }
    return padrao;
}
