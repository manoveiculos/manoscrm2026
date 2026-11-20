// src/lib/conexoes/credenciais.ts — onde ficam os acessos do Meta e do Google (SÓ SERVIDOR).
//
// Ordem de leitura: 1º o que foi conectado pelo botão "Conectar" (tabela oauth_conexoes),
// 2º as variáveis de ambiente antigas. Assim nada quebra enquanto o botão não é usado.
// Nunca imprima nem devolva estes valores em resposta de API.

import { createClient as createAdminClient } from '@/lib/supabase/admin';

export type Provedor = 'google' | 'meta';

export interface Credencial {
    provedor: Provedor;
    refresh_token: string | null;
    access_token: string | null;
    expira_em: string | null;
    escopos: string | null;
    conectado_por: string | null;
    atualizado_em: string;
}

/** Lê a credencial conectada pelo botão. Devolve null se não existe (ou se a tabela ainda não foi criada). */
export async function lerCredencial(p: Provedor): Promise<Credencial | null> {
    try {
        const { data, error } = await createAdminClient().from('oauth_conexoes').select('*').eq('provedor', p).maybeSingle();
        if (error || !data) return null;
        return data as Credencial;
    } catch {
        return null;
    }
}

export async function salvarCredencial(
    p: Provedor,
    d: { refresh_token?: string | null; access_token?: string | null; expira_em?: string | null; escopos?: string | null; conectado_por?: string | null },
): Promise<{ ok: true } | { ok: false; erro: string }> {
    const { error } = await createAdminClient().from('oauth_conexoes').upsert({
        provedor: p,
        refresh_token: d.refresh_token ?? null,
        access_token: d.access_token ?? null,
        expira_em: d.expira_em ?? null,
        escopos: d.escopos ?? null,
        conectado_por: d.conectado_por ?? null,
        atualizado_em: new Date().toISOString(),
    }, { onConflict: 'provedor' });
    return error ? { ok: false, erro: error.message } : { ok: true };
}

/** Refresh token do Google: o do botão Conectar; se não houver, o da variável de ambiente. */
export async function refreshTokenGoogle(): Promise<string> {
    const c = await lerCredencial('google');
    return (c?.refresh_token || process.env.GOOGLE_ADS_REFRESH_TOKEN || '').trim();
}

/** Token do Meta: o do botão Conectar (se ainda vale); se não houver, o da variável de ambiente. */
export async function tokenMeta(): Promise<string> {
    const c = await lerCredencial('meta');
    const vale = c?.access_token && (!c.expira_em || Date.parse(c.expira_em) > Date.now());
    if (vale) return c!.access_token!.trim();
    return (process.env.META_ADS_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || '').trim();
}
