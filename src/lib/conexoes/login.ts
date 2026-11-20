// src/lib/conexoes/login.ts — detecta quando o login do Meta Ads ou do Google Ads CAIU.
//
// Só LEITURA e sem custo: o Meta responde "este token ainda vale?" (debug_token) e o Google
// recebe o pedido de renovação do acesso (o mesmo que o CRM faz antes de ler as campanhas).
// Este arquivo NUNCA guarda nem devolve senha ou token: só o motivo e o caminho para reconectar.

export type EstadoLogin = 'ok' | 'caiu' | 'atencao' | 'nao_configurado';

export interface Reconectar { rotulo: string; url: string; passos: string[] }
export interface ResultadoLogin {
    id: 'meta_login' | 'google_login';
    nome: string;
    estado: EstadoLogin;
    motivo: string;
    reconectar?: Reconectar;
}

const RECONECTAR_META: Reconectar = {
    rotulo: 'Reconectar o Meta',
    url: 'https://business.facebook.com/settings/system-users',
    passos: [
        'Abra o Gerenciador de Negócios e entre em Usuários do sistema.',
        'Escolha o usuário do CRM e clique em Gerar token (marque ads_read e ads_management).',
        'Cole o token novo na variável META_ADS_ACCESS_TOKEN da Vercel e republique.',
    ],
};
const RECONECTAR_GOOGLE: Reconectar = {
    rotulo: 'Reconectar o Google',
    url: 'https://developers.google.com/oauthplayground',
    passos: [
        'Entre com a conta que administra o Google Ads e autorize o escopo https://www.googleapis.com/auth/adwords.',
        'Troque o código por tokens e copie o Refresh token.',
        'Cole na variável GOOGLE_ADS_REFRESH_TOKEN da Vercel e republique.',
    ],
};

/** Códigos de erro do Meta que significam "o acesso acabou": 190 = token inválido/expirado, 102 = sessão expirada. */
const META_LOGIN_CAIU = new Set([190, 102]);

export interface RespostaMeta { http: number; corpo: unknown }

/** Interpreta a resposta do debug_token do Meta. Pura: sem rede. */
export function interpretarMeta(r: RespostaMeta, agoraMs = Date.now()): ResultadoLogin {
    const base = { id: 'meta_login' as const, nome: 'Login do Meta (Instagram/Facebook Ads)' };
    const c = (r.corpo && typeof r.corpo === 'object' ? r.corpo : {}) as {
        error?: { code?: number; message?: string };
        data?: { is_valid?: boolean; expires_at?: number; error?: { code?: number; message?: string } };
    };
    const erro = c.error || c.data?.error;
    if (erro && erro.code !== undefined && META_LOGIN_CAIU.has(Number(erro.code))) {
        return { ...base, estado: 'caiu', motivo: 'O Meta recusou o acesso: o login expirou ou foi desfeito.', reconectar: RECONECTAR_META };
    }
    if (c.data && c.data.is_valid === false) {
        return { ...base, estado: 'caiu', motivo: 'O Meta diz que o acesso não vale mais (expirou, foi revogado ou a senha mudou).', reconectar: RECONECTAR_META };
    }
    if (erro) {
        return { ...base, estado: 'atencao', motivo: `O Meta respondeu com erro (código ${erro.code ?? r.http}), mas não é queda de login.` };
    }
    if (r.http >= 500) return { ...base, estado: 'atencao', motivo: `O Meta está instável agora (HTTP ${r.http}). Tento de novo na próxima rodada.` };
    if (c.data?.is_valid === true) {
        const exp = Number(c.data.expires_at) || 0; // 0 = não expira
        if (exp > 0) {
            const dias = Math.floor((exp * 1000 - agoraMs) / 86_400_000);
            if (dias <= 7) return { ...base, estado: 'atencao', motivo: `O login do Meta vence em ${Math.max(0, dias)} dia(s). Renove antes que caia.`, reconectar: RECONECTAR_META };
            return { ...base, estado: 'ok', motivo: `Login válido, vence em ${dias} dias.` };
        }
        return { ...base, estado: 'ok', motivo: 'Login válido e sem data de vencimento.' };
    }
    return { ...base, estado: 'atencao', motivo: 'Resposta do Meta que não consegui entender.' };
}

/** Interpreta a resposta da renovação do acesso do Google. Pura: sem rede. */
export function interpretarGoogle(r: RespostaMeta): ResultadoLogin {
    const base = { id: 'google_login' as const, nome: 'Login do Google (Google Ads)' };
    const c = (r.corpo && typeof r.corpo === 'object' ? r.corpo : {}) as { error?: string; error_description?: string; access_token?: string };
    if (c.error === 'invalid_grant') {
        return { ...base, estado: 'caiu', motivo: 'O Google revogou ou venceu o acesso (acontece quando a senha muda, o acesso é removido ou o app está em modo de teste).', reconectar: RECONECTAR_GOOGLE };
    }
    if (c.error === 'invalid_client' || c.error === 'unauthorized_client') {
        return { ...base, estado: 'atencao', motivo: 'O Google não reconhece o ID/segredo do aplicativo: confira GOOGLE_ADS_CLIENT_ID e GOOGLE_ADS_CLIENT_SECRET.' };
    }
    if (c.error) return { ...base, estado: 'atencao', motivo: `O Google respondeu com erro (${c.error}), que não é queda de login.` };
    if (r.http >= 500) return { ...base, estado: 'atencao', motivo: `O Google está instável agora (HTTP ${r.http}). Tento de novo na próxima rodada.` };
    if (c.access_token) return { ...base, estado: 'ok', motivo: 'Login válido: o Google renovou o acesso.' };
    return { ...base, estado: 'atencao', motivo: 'Resposta do Google que não consegui entender.' };
}

const TEMPO = 10_000;
async function lerJson(res: Response): Promise<unknown> { try { return await res.json(); } catch { return null; } }

export async function verificarMeta(): Promise<ResultadoLogin> {
    const token = (process.env.META_ADS_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || process.env.NEXT_PUBLIC_META_ACCESS_TOKEN || '').trim();
    if (!token) return { id: 'meta_login', nome: 'Login do Meta (Instagram/Facebook Ads)', estado: 'nao_configurado', motivo: 'Não há token do Meta nas variáveis do CRM.', reconectar: RECONECTAR_META };
    const versao = (process.env.META_API_VERSION || '').trim() || 'v26.0';
    try {
        const res = await fetch(`https://graph.facebook.com/${versao}/debug_token?input_token=${encodeURIComponent(token)}`, {
            headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TEMPO), cache: 'no-store',
        });
        return interpretarMeta({ http: res.status, corpo: await lerJson(res) });
    } catch (e) {
        return { id: 'meta_login', nome: 'Login do Meta (Instagram/Facebook Ads)', estado: 'atencao', motivo: `Não consegui falar com o Meta agora (${e instanceof Error ? e.message : 'erro de rede'}).` };
    }
}

export async function verificarGoogle(): Promise<ResultadoLogin> {
    const cid = (process.env.GOOGLE_ADS_CLIENT_ID || '').trim();
    const sec = (process.env.GOOGLE_ADS_CLIENT_SECRET || '').trim();
    const ref = (process.env.GOOGLE_ADS_REFRESH_TOKEN || '').trim();
    if (!cid || !sec || !ref) return { id: 'google_login', nome: 'Login do Google (Google Ads)', estado: 'nao_configurado', motivo: 'Faltam as chaves do Google Ads nas variáveis do CRM.', reconectar: RECONECTAR_GOOGLE };
    try {
        const res = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST', body: new URLSearchParams({ client_id: cid, client_secret: sec, refresh_token: ref, grant_type: 'refresh_token' }),
            signal: AbortSignal.timeout(TEMPO), cache: 'no-store',
        });
        return interpretarGoogle({ http: res.status, corpo: await lerJson(res) });
    } catch (e) {
        return { id: 'google_login', nome: 'Login do Google (Google Ads)', estado: 'atencao', motivo: `Não consegui falar com o Google agora (${e instanceof Error ? e.message : 'erro de rede'}).` };
    }
}

export async function verificarLogins(): Promise<ResultadoLogin[]> {
    return Promise.all([verificarMeta(), verificarGoogle()]);
}

/**
 * Decide se vale registrar/avisar: só na TRANSIÇÃO (ok→caiu, caiu→ok), para não repetir o mesmo aviso
 * a cada rodada. `ultimo` é o estado do último registro desse login (ou null se nunca registrou).
 */
export function precisaRegistrar(atual: EstadoLogin, ultimo: EstadoLogin | null): 'caiu' | 'voltou' | null {
    if (atual === 'caiu' && ultimo !== 'caiu') return 'caiu';
    if (atual === 'ok' && ultimo === 'caiu') return 'voltou';
    return null;
}
