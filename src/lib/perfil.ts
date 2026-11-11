// src/lib/perfil.ts — PERFIL DE ACESSO (vendedor · gestor · admin)
//
// Fonte única para decidir o que cada pessoa vê no menu e qual é a tela
// inicial. Funções puras: rodam no navegador e no servidor.
//
// Em 04/11/2026 consultants_manos_crm tinha 6 'vendedor', 1 'admin' e 2 sem
// perfil. 'gestor' ainda não existe, mas o código já trata (decisão do
// Alexandre: o perfil continua existindo para quando houver outra pessoa).

export type Perfil = 'vendedor' | 'gestor' | 'admin';

/** Login do Alexandre: admin mesmo sem linha em consultants_manos_crm. */
export const EMAIL_ALEXANDRE = 'alexandre_gorges@hotmail.com';

const ROLES_ADMIN = ['admin', 'owner'];
const ROLES_GESTOR = ['gestor', 'manager'];

export function perfilDoConsultor(role: string | null | undefined, email: string | null | undefined): Perfil {
    if ((email || '').toLowerCase() === EMAIL_ALEXANDRE) return 'admin';
    const r = (role || '').toLowerCase().trim();
    if (ROLES_ADMIN.includes(r)) return 'admin';
    if (ROLES_GESTOR.includes(r)) return 'gestor';
    return 'vendedor';
}

/** Vendedor e gestor começam na Minha Fila; admin, no War Room (`/`). */
export function telaInicial(perfil: Perfil): string {
    return perfil === 'admin' ? '/' : '/fila';
}
