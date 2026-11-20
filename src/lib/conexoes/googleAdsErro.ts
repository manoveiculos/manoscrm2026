// src/lib/conexoes/googleAdsErro.ts — traduz o erro do Google Ads para o que fazer (puro, sem rede).
//
// O Google Ads responde "The caller does not have permission" para vários problemas diferentes.
// A causa de verdade vem em error.details[].errors[].errorCode; lemos de lá.

export interface ContextoGoogleAds { cliente?: string; login?: string }

const fmt = (id?: string) => (id && /^\d{10}$/.test(id) ? `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}` : id || '');

interface Detalhe { errors?: { errorCode?: Record<string, string>; message?: string }[] }

/** Códigos de erro do Google Ads (ex.: "authorizationError: USER_PERMISSION_DENIED"). */
export function codigosDoErro(corpo: unknown): string[] {
    const raiz = Array.isArray(corpo) ? corpo[0] : corpo;
    const det = ((raiz as { error?: { details?: Detalhe[] } } | null)?.error?.details || []);
    const out: string[] = [];
    for (const d of det) for (const e of d.errors || []) for (const [k, v] of Object.entries(e.errorCode || {})) out.push(`${k}: ${v}`);
    return out;
}

export function explicarErroGoogleAds(status: number, corpo: unknown, ctx: ContextoGoogleAds = {}): string {
    const raiz = Array.isArray(corpo) ? corpo[0] : corpo;
    const msg = (raiz as { error?: { message?: string } } | null)?.error?.message || 'recusou a consulta';
    const cods = codigosDoErro(corpo);
    const tem = (t: string) => cods.some(c => c.includes(t));
    const conta = fmt(ctx.cliente);
    const gerente = fmt(ctx.login);

    if (tem('USER_PERMISSION_DENIED')) {
        return `O e-mail que você conectou não tem acesso ${gerente ? `à conta gerente ${gerente}` : `à conta ${conta}`} do Google Ads. `
            + `Clique em Conectar e entre com o e-mail que administra essa conta (veja em Google Ads → Administrador → Acesso e segurança). [${cods.join('; ')}]`;
    }
    if (tem('DEVELOPER_TOKEN_NOT_APPROVED') || tem('DEVELOPER_TOKEN_PROHIBITED')) {
        return `O developer token do Google Ads ainda não foi aprovado para contas reais (nível básico). Peça a aprovação em Google Ads → Ferramentas → Central de API. [${cods.join('; ')}]`;
    }
    if (tem('CUSTOMER_NOT_ENABLED') || tem('CUSTOMER_NOT_FOUND')) {
        return `A conta ${conta} do Google Ads está cancelada, não ativada ou o número está errado (GOOGLE_ADS_CUSTOMER_ID). [${cods.join('; ')}]`;
    }
    if (tem('LOGIN_CUSTOMER_ID') || tem('INVALID_LOGIN_CUSTOMER_ID')) {
        return `O ID da conta gerente (GOOGLE_ADS_LOGIN_CUSTOMER_ID) não confere com o e-mail conectado. [${cods.join('; ')}]`;
    }
    return `Google Ads (${status}): ${msg}${cods.length ? ` [${cods.join('; ')}]` : ''}`;
}
