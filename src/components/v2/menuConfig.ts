// src/components/v2/menuConfig.ts — MENU POR PERFIL (Fase 1 da repaginação)
//
//   Vendedor: Minha Fila · Pegar leads · Conversas · Agenda · Meus Leads · Perfil
//             ("Pegar leads" = Inbox/pesca: decisão do Alexandre em 05/11)
//   Gestor:   o do vendedor (com a Inbox como "Inbox geral") + Conversão · Perdidos · Painel 48h
//   Admin:    tudo, em 5 grupos recolhíveis (Vendas · Compras · Financeiro ·
//             Gestão · Marketing)
//
// Antes eram 27 itens iguais para todos, com filtros por e-mail espalhados no
// NavigationV2. As regras por pessoa (Camila, Paulo, Ivo, Wilson, Ledra,
// Alexandre) continuam as mesmas — só mudaram para cá.
//
// O menu só ESCONDE: as rotas continuam abrindo pelo endereço. Quem protege o
// dado é o RLS e as rotas de API.

import {
    Activity, BarChart3, Bike, Bot, Network, CalendarClock, Calculator, CircleUser, ClipboardCheck, DollarSign,
    Flame, Handshake, Inbox, KanbanSquare, LayoutDashboard, ListTodo, Megaphone, MessageCircle,
    MessagesSquare, PieChart, PlayCircle, Radar, Banknote, Shield, SlidersHorizontal, Store, Users,
    WalletCards,
    type LucideIcon,
} from 'lucide-react';
import { EMAIL_ALEXANDRE, type Perfil } from '@/lib/perfil';

export type GrupoMenu = 'vendas' | 'compras' | 'financeiro' | 'gestao' | 'marketing';

export const GRUPOS_MENU: { id: GrupoMenu; label: string }[] = [
    { id: 'vendas', label: 'Vendas' },
    { id: 'compras', label: 'Compras' },
    { id: 'financeiro', label: 'Financeiro' },
    { id: 'gestao', label: 'Gestão' },
    { id: 'marketing', label: 'Marketing' },
];

/** Quem vê: 'base' = todo consultor; 'gestor' = gestor e admin; 'admin' = só admin. */
type Nivel = 'base' | 'gestor' | 'admin';

/** Item que só certas pessoas veem, independentemente do perfil. */
type Exclusivo = 'alexandre' | 'socio' | 'terceiros' | 'financeiro' | 'repasse' | 'cobranca';

export interface NavItem {
    id: string;
    label: string;
    /** Rótulo curto da barra inferior do celular. */
    curto?: string;
    icon: LucideIcon;
    href: string;
    grupo: GrupoMenu;
    nivel: Nivel;
    exclusivo?: Exclusivo;
    /** Abre o modal de perfil em vez de navegar. */
    acao?: 'perfil';
    /** Aparece desabilitado com "em breve". */
    emBreve?: boolean;
    /** Admin não precisa: já tem o cartão do usuário no rodapé do menu. */
    ocultoParaAdmin?: boolean;
    /** Rótulo no menu do admin, quando diferente (ex.: "Leads" em vez de "Meus Leads"). */
    labelAdmin?: string;
    /** Rótulo no menu do gestor, quando diferente. */
    labelGestor?: string;
}

export const NAV_ITEMS: NavItem[] = [
    // ── Vendas ────────────────────────────────────────────────────────────
    { id: 'fila', label: 'Minha Fila', curto: 'Fila', icon: ListTodo, href: '/fila', grupo: 'vendas', nivel: 'base' },
    // Pesca de lead sem dono: decisão do Alexandre (05/11) — continua no menu do vendedor.
    { id: 'inbox', label: 'Pegar leads', curto: 'Pegar', icon: Inbox, href: '/inbox', grupo: 'vendas', nivel: 'base', labelAdmin: 'Inbox geral', labelGestor: 'Inbox geral' },
    { id: 'conversas', label: 'Conversas', icon: MessagesSquare, href: '/conversas', grupo: 'vendas', nivel: 'base' },
    { id: 'agenda', label: 'Agenda', icon: CalendarClock, href: '/agenda', grupo: 'vendas', nivel: 'base' },
    { id: 'leads', label: 'Meus Leads', curto: 'Leads', icon: Users, href: '/leads', grupo: 'vendas', nivel: 'base', labelAdmin: 'Leads' },
    { id: 'perfil', label: 'Perfil', icon: CircleUser, href: '#perfil', grupo: 'vendas', nivel: 'base', acao: 'perfil', ocultoParaAdmin: true },
    { id: 'prioridade48h', label: 'Painel 48h', icon: Flame, href: '/admin/prioridade48h', grupo: 'vendas', nivel: 'gestor' },
    { id: 'perdidos', label: 'Perdidos', icon: ClipboardCheck, href: '/admin/perdidos', grupo: 'vendas', nivel: 'gestor' },
    { id: 'avisos', label: 'Avisos e cobranças', curto: 'Avisos', icon: Megaphone, href: '/admin/avisos', grupo: 'vendas', nivel: 'gestor' },
    { id: 'atendimento', label: 'Atendimento', icon: PlayCircle, href: '/atendimento', grupo: 'vendas', nivel: 'admin' },
    { id: 'pipeline', label: 'Pipeline', icon: KanbanSquare, href: '/pipeline', grupo: 'vendas', nivel: 'admin' },
    { id: 'resgate', label: 'Resgate', icon: Bot, href: '/admin/rescue', grupo: 'vendas', nivel: 'admin' },

    // ── Compras ───────────────────────────────────────────────────────────
    { id: 'compras', label: 'Compras', icon: Radar, href: '/compras', grupo: 'compras', nivel: 'admin' },
    { id: 'precificar', label: 'Precificar', icon: Calculator, href: '/precificar', grupo: 'compras', nivel: 'admin' },
    { id: 'repasse', label: 'Repasse', icon: Store, href: '/repasse', grupo: 'compras', nivel: 'admin', exclusivo: 'repasse' },
    { id: 'terceiros', label: 'Negociação Terceiros', icon: Handshake, href: '/negociacao-terceiros', grupo: 'compras', nivel: 'admin', exclusivo: 'terceiros' },
    { id: 'leads-whatsapp', label: 'Leads WhatsApp', icon: MessageCircle, href: '/leads-whatsapp', grupo: 'compras', nivel: 'admin', exclusivo: 'terceiros' },

    // ── Financeiro ────────────────────────────────────────────────────────
    { id: 'financeiro', label: 'Financeiro', icon: WalletCards, href: '/financeiro', grupo: 'financeiro', nivel: 'admin', exclusivo: 'financeiro' },
    { id: 'cobranca', label: 'Cobrança', icon: DollarSign, href: '/admin/cobranca', grupo: 'financeiro', nivel: 'admin', exclusivo: 'cobranca' },
    { id: 'cobranca-acordos', label: 'Cobrança Acordos', icon: DollarSign, href: '/consultor/cobranca', grupo: 'financeiro', nivel: 'admin' },
    { id: 'divisao-lucro', label: 'Divisão de Lucro', icon: PieChart, href: '/divisaodelucro', grupo: 'financeiro', nivel: 'admin', exclusivo: 'socio' },
    { id: 'milhao', label: 'Milhão', icon: Banknote, href: '/admin/milhao', grupo: 'financeiro', nivel: 'admin', exclusivo: 'alexandre' },

    // ── Gestão ────────────────────────────────────────────────────────────
    { id: 'agentes', label: 'Central dos Agentes', icon: Network, href: '/agentes', grupo: 'gestao', nivel: 'admin' },
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, href: '/', grupo: 'gestao', nivel: 'admin' },
    { id: 'war-room', label: 'War Room', icon: Activity, href: '/admin/live', grupo: 'gestao', nivel: 'admin' },
    { id: 'conversao', label: 'Conversão', icon: LayoutDashboard, href: '/admin/conversion', grupo: 'gestao', nivel: 'gestor' },
    { id: 'consultores', label: 'Consultores', icon: Shield, href: '/admin/users', grupo: 'gestao', nivel: 'admin' },
    { id: 'saude', label: 'Saúde', icon: Activity, href: '/admin/health', grupo: 'gestao', nivel: 'admin' },
    { id: 'sdr-bench', label: 'SDR Bench', icon: Bot, href: '/admin/sdr-bench', grupo: 'gestao', nivel: 'admin' },
    { id: 'configuracoes', label: 'Configurações', icon: SlidersHorizontal, href: '/admin/config', grupo: 'gestao', nivel: 'admin' },
    { id: 'scooters', label: 'Scooters', icon: Bike, href: '/admin/scooters', grupo: 'gestao', nivel: 'admin', exclusivo: 'alexandre' },

    // ── Marketing ─────────────────────────────────────────────────────────
    { id: 'marketing', label: 'Time de Marketing', icon: Megaphone, href: '/admin/marketing', grupo: 'marketing', nivel: 'admin' },
];

const CAMILA = ['camila.renatta@hotmail.com', 'camilarenatta@hotmail.com'];
const PAULO = 'paulo@manoscrm.com';
const IVO = 'ivo@acesso.com';
const WILSON = 'dultra49@gmail.com';
const LEDRA = 'hgledra@hotmail.com';

export interface ContextoMenu {
    /** null enquanto o perfil carrega. */
    perfil: Perfil | null;
    email: string | null | undefined;
}

export interface SecaoMenu {
    id: string;
    /** Título da seção; null = sem título (lista principal). */
    label: string | null;
    /** Seção recolhível (grupos do admin). */
    recolhivel: boolean;
    itens: NavItem[];
}

const porIds = (ids: string[]) => ids.map(id => NAV_ITEMS.find(i => i.id === id)!).filter(Boolean);

function podeVerExclusivo(ex: Exclusivo, email: string, admin: boolean): boolean {
    const alexandre = email === EMAIL_ALEXANDRE;
    switch (ex) {
        case 'alexandre': return alexandre;
        case 'socio': return alexandre || email === IVO;
        case 'terceiros': return alexandre || email === WILSON;
        case 'financeiro': return alexandre || email === LEDRA;
        case 'repasse': return admin || email === PAULO;
        case 'cobranca': return admin || CAMILA.includes(email);
    }
}

/** Seções do menu lateral para quem está logado. */
export function secoesDoMenu({ perfil, email }: ContextoMenu): SecaoMenu[] {
    const e = (email || '').toLowerCase();
    const admin = perfil === 'admin';
    const alexandre = e === EMAIL_ALEXANDRE;

    // Logins restritos (não são vendedores): mesmo comportamento de antes.
    if (!admin && !alexandre) {
        if (CAMILA.includes(e)) return [{ id: 'principal', label: null, recolhivel: false, itens: porIds(['cobranca']) }];
        if (e === PAULO) return [{ id: 'principal', label: null, recolhivel: false, itens: porIds(['compras', 'repasse']) }];
        if (e === IVO) return [{ id: 'principal', label: null, recolhivel: false, itens: porIds(['compras', 'divisao-lucro']) }];
    }

    if (admin) {
        return GRUPOS_MENU.map(g => ({
            id: g.id,
            label: g.label,
            recolhivel: true,
            itens: NAV_ITEMS.filter(i =>
                i.grupo === g.id
                && !i.ocultoParaAdmin
                && (!i.exclusivo || podeVerExclusivo(i.exclusivo, e, true)))
                .map(i => (i.labelAdmin ? { ...i, label: i.labelAdmin } : i)),
        })).filter(s => s.itens.length > 0);
    }

    // Vendedor (e enquanto o perfil carrega) / gestor
    const base = NAV_ITEMS.filter(i => i.nivel === 'base')
        .map(i => (perfil === 'gestor' && i.labelGestor ? { ...i, label: i.labelGestor } : i));
    const secoes: SecaoMenu[] = [
        { id: 'principal', label: null, recolhivel: false, itens: base },
    ];
    if (perfil === 'gestor') {
        secoes.push({ id: 'gestao', label: 'Gestão', recolhivel: false, itens: NAV_ITEMS.filter(i => i.nivel === 'gestor') });
    }
    // Módulos dados a uma pessoa específica (ex.: Ledra → Financeiro).
    // Negociação Terceiros e Leads WhatsApp saíram do menu do vendedor por
    // decisão do Alexandre (06/11): continuam no menu dele (admin) e abrem
    // pelo endereço para o Wilson.
    const extras = NAV_ITEMS.filter(i =>
        i.nivel === 'admin' && i.exclusivo && i.exclusivo !== 'terceiros'
        && podeVerExclusivo(i.exclusivo, e, false));
    if (extras.length) secoes.push({ id: 'extras', label: 'Seus módulos', recolhivel: false, itens: extras });
    return secoes;
}

/**
 * Sinos "Pressão de Cobrança" (leads esfriando) e "Notificações" (lead novo na
 * pesca) no menu lateral: só gestor e admin. Saíram do menu do vendedor por
 * decisão do Alexandre (06/11). Com eles saem também os sons desses avisos;
 * o vendedor trabalha pela Minha Fila e pelo "Pegar leads".
 */
export function mostrarSinos(perfil: Perfil | null): boolean {
    return perfil === 'gestor' || perfil === 'admin';
}

/** Barra fixa do celular: os itens do vendedor. Admin e logins restritos usam só o menu lateral. */
export function itensBarraInferior({ perfil, email }: ContextoMenu): NavItem[] {
    const e = (email || '').toLowerCase();
    if (perfil !== 'vendedor' && perfil !== 'gestor') return [];
    if (CAMILA.includes(e) || e === PAULO || e === IVO) return [];
    return NAV_ITEMS.filter(i => i.nivel === 'base');
}

/** Item ativo: o href mais específico que casa com a rota atual. */
export function itemAtivo(pathname: string, itens: NavItem[]): string | null {
    let melhor: NavItem | null = null;
    for (const i of itens) {
        if (i.acao || i.emBreve) continue;
        const casa = i.href === '/' ? pathname === '/' : (pathname === i.href || pathname.startsWith(i.href + '/'));
        if (casa && (!melhor || i.href.length > melhor.href.length)) melhor = i;
    }
    return melhor?.id || null;
}
