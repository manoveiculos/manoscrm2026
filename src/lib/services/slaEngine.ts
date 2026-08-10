import { createClient } from '@/lib/supabase/admin';

/**
 * Motor de Distribuição Round-Robin + SLA 10min.
 *
 * Regras:
 *  - Lead novo em horário comercial → vai pro próximo vendedor DISPONÍVEL (check-in
 *    do dia), com 10min de horário-comercial pra iniciar o atendimento.
 *  - Não iniciou em 10min → repassa pro próximo, reinicia o relógio, loga o evento.
 *  - Deu a volta na roleta (todos falharam) → status 'esgotado' + alerta admin.
 *  - Fora do horário → 'standby'. Aberto sem ninguém disponível → 'aguardando'.
 *  - O 1º tick após a abertura distribui o standby (despejo matinal).
 *
 * O SLA usa businessSecondsBetween: só conta tempo com a loja ABERTA. Isso dá de
 * graça a pausa no fechamento, o standby noturno e o despejo matinal.
 */

export type LeadTable = 'leads_distribuicao_crm_26' | 'leads_manos_crm' | 'leads_compra' | 'leads_master';
export interface HorarioConfig { seg_sex: [number, number]; sab: [number, number]; tz: string; }

export const TZ = 'America/Sao_Paulo';
export const SLA_SECONDS = 600; // 10 minutos
// Lead esperando mais que isso (em horário comercial) sem NINGUÉM com check-in
// → cai pra qualquer vendedor ativo. Check-in é preferência, não desculpa pro
// lead apodrecer na fila.
export const FALLBACK_SECONDS = 600; // 10 minutos
// Máximo de leads do BACKLOG que um vendedor recebe por tick (1/min). Lead novo
// não passa por aqui — isso só regula o despejo da fila acumulada.
export const MAX_DESPEJO_POR_VENDEDOR = 3;
const DEFAULT_HORAS: HorarioConfig = { seg_sex: [8, 18], sab: [8, 12], tz: TZ };
const pad = (n: number) => String(n).padStart(2, '0');

// ---------- Núcleo de horário comercial (fuso SP, sem DST no Brasil hoje) ----------
// SP = UTC-3 fixo → hora local H equivale a UTC H+3.
function spYMD(d: Date): { y: number; m: number; dd: number; wd: number; iso: string } {
    const s = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); // "YYYY-MM-DD"
    const [y, m, dd] = s.split('-').map(Number);
    const wd = new Date(Date.UTC(y, m - 1, dd)).getUTCDay(); // 0=Dom .. 6=Sáb
    return { y, m, dd, wd, iso: s };
}

// Janela [abre, fecha] do dia em UTC absoluto, ou null (domingo/feriado/fechado).
function janelaDoDia(y: number, m: number, dd: number, wd: number, iso: string, horas: HorarioConfig, feriados: Set<string>): [Date, Date] | null {
    if (wd === 0) return null;               // domingo
    if (feriados.has(iso)) return null;      // feriado
    const [h0, h1] = wd === 6 ? horas.sab : horas.seg_sex;
    if (h0 == null || h1 == null || h1 <= h0) return null;
    return [new Date(Date.UTC(y, m - 1, dd, h0 + 3, 0, 0)), new Date(Date.UTC(y, m - 1, dd, h1 + 3, 0, 0))];
}

/** Segundos DENTRO do horário comercial entre a e b. Pausa automática fora do expediente. */
export function businessSecondsBetween(a: Date, b: Date, horas: HorarioConfig = DEFAULT_HORAS, feriados: Set<string> = new Set()): number {
    if (b <= a) return 0;
    let total = 0;
    let cur = new Date(a);
    for (let i = 0; i < 400; i++) {
        const { y, m, dd, wd, iso } = spYMD(cur);
        const jan = janelaDoDia(y, m, dd, wd, iso, horas, feriados);
        if (jan) {
            const s = Math.max(a.getTime(), jan[0].getTime());
            const e = Math.min(b.getTime(), jan[1].getTime());
            if (e > s) total += (e - s) / 1000;
        }
        // próxima meia-noite SP (00:00 local = 03:00 UTC)
        const next = new Date(Date.UTC(y, m - 1, dd + 1, 3, 0, 0));
        if (next.getTime() > b.getTime()) break;
        cur = next;
    }
    return total;
}

export function isOpenNow(now: Date, horas: HorarioConfig = DEFAULT_HORAS, feriados: Set<string> = new Set()): boolean {
    const { y, m, dd, wd, iso } = spYMD(now);
    const jan = janelaDoDia(y, m, dd, wd, iso, horas, feriados);
    return !!jan && now >= jan[0] && now < jan[1];
}

// ---------- Config (horário + feriados), resiliente antes da migration ----------
async function loadHorario(admin: any): Promise<{ horas: HorarioConfig; feriados: Set<string> }> {
    try {
        const [{ data: cfg }, { data: fer }] = await Promise.all([
            admin.from('system_settings').select('value').eq('id', 'store_hours').maybeSingle(),
            admin.from('feriados').select('dia'),
        ]);
        const horas = (cfg?.value as HorarioConfig) || DEFAULT_HORAS;
        const feriados = new Set<string>((fer || []).map((f: any) => String(f.dia)));
        return { horas, feriados };
    } catch {
        return { horas: DEFAULT_HORAS, feriados: new Set() };
    }
}

const hojeISO = () => spYMD(new Date()).iso;
/** Data de hoje (YYYY-MM-DD) no fuso da loja — usada pelo check-in. */
export const hojeSP = () => spYMD(new Date()).iso;
const uidOf = (table: string, id: string | number) => `${table}:${id}`;
const realIdOf = (table: string, native: string) => (table === 'leads_distribuicao_crm_26' ? parseInt(native) : native);

// ---------- Roleta: próximo vendedor com check-in hoje ----------
/**
 * Próximo da fila entre quem fez check-in hoje. Com `fallback`, se ninguém fez
 * check-in a roleta cai pra qualquer vendedor ativo — usado quando o lead já
 * esperou FALLBACK_SECONDS ou já furou o SLA. Melhor um lead com dono que não
 * bateu ponto do que um lead sem dono nenhum.
 */
async function pickNextDisponivel(admin: any, excluir: string[] = [], fallback = false): Promise<{ id: string; name: string } | null> {
    const fila = () => admin
        .from('consultants_manos_crm')
        .select('id, name')
        .eq('is_active', true)
        .eq('role', 'vendedor')
        .order('last_lead_assigned_at', { ascending: true, nullsFirst: true })
        .limit(30);

    const { data } = await fila().eq('disponivel_em', hojeISO());
    const disponiveis = (data || []).filter((c: any) => !excluir.includes(c.id));
    if (disponiveis.length > 0) return disponiveis[0];
    if (!fallback) return null;

    const { data: todos } = await fila();
    const cand = (todos || []).filter((c: any) => !excluir.includes(c.id));
    return cand[0] || null;
}

// Atribui o lead a um vendedor: grava dono na tabela do lead + linha de distribuição + notifica.
async function atribuirA(admin: any, table: string, native: string, cons: { id: string; name: string }, now: Date, tentados: string[], ciclos: number) {
    const realId = realIdOf(table, native);
    const upd: any = { assigned_consultant_id: cons.id };
    if (table === 'leads_distribuicao_crm_26') { upd.vendedor = cons.name; upd.atualizado_em = now.toISOString(); }
    else { upd.updated_at = now.toISOString(); }
    await admin.from(table).update(upd).eq('id', realId);

    await admin.from('lead_distribuicao').upsert({
        lead_uid: uidOf(table, native), table_name: table, native_id: String(native),
        status: 'distribuido', assigned_consultant_id: cons.id, distribuido_em: now.toISOString(),
        atendido_em: null, tentados, ciclos, atualizado_em: now.toISOString(),
    }, { onConflict: 'lead_uid' });

    await admin.from('consultants_manos_crm').update({ last_lead_assigned_at: now.toISOString() }).eq('id', cons.id);
    try { const { notifyLeadArrival } = await import('./vendorNotifyService'); await notifyLeadArrival(String(native)); } catch { /* push best-effort */ }
}

async function setStatus(admin: any, table: string, native: string, status: string) {
    await admin.from('lead_distribuicao').upsert({
        lead_uid: uidOf(table, native), table_name: table, native_id: String(native),
        status, atualizado_em: new Date().toISOString(),
    }, { onConflict: 'lead_uid' });
}

// ---------- API pública do motor ----------

/** Chamado quando um lead novo entra (webhooks). Decide: distribui / standby / aguardando. */
export async function distribuirLead(table: LeadTable, native: string | number): Promise<{ status: string; consultant?: string }> {
    const admin = createClient();
    const { horas, feriados } = await loadHorario(admin);
    const now = new Date();
    if (!isOpenNow(now, horas, feriados)) { await setStatus(admin, table, String(native), 'standby'); return { status: 'standby' }; }
    const prox = await pickNextDisponivel(admin);
    if (!prox) { await setStatus(admin, table, String(native), 'aguardando'); return { status: 'aguardando' }; }
    await atribuirA(admin, table, String(native), prox, now, [prox.id], 0);
    return { status: 'distribuido', consultant: prox.id };
}

/** Chamado pelo start-atendimento: para o relógio. */
export async function marcarAtendido(table: LeadTable, native: string | number): Promise<void> {
    const admin = createClient();
    const now = new Date().toISOString();
    await admin.from('lead_distribuicao')
        .update({ status: 'atendido', atendido_em: now, atualizado_em: now })
        .eq('lead_uid', uidOf(table, String(native)));
}

async function logEscalation(admin: any, d: any) {
    try {
        await admin.from('sla_escalations').insert({
            lead_id: String(d.native_id), lead_table: d.table_name, consultant_id: d.assigned_consultant_id,
            level: 10, notes: `SLA 10min estourado (ciclo ${d.ciclos})`, triggered_at: new Date().toISOString(),
        });
    } catch { /* relatório best-effort */ }
}

async function alertAdminEsgotado(admin: any, d: any) {
    // inactivity_alerts: UNIQUE(lead_uid, kind) → re-disparo é ignorado no conflito.
    try {
        await admin.from('inactivity_alerts').insert({
            lead_uid: d.lead_uid, lead_table: d.table_name, lead_id: String(d.native_id),
            consultor_id: d.assigned_consultant_id || null, kind: 'sla_esgotado',
        }).then(null, () => {});
    } catch { /* best-effort */ }
}

/**
 * Rede de segurança: lead inserido direto no banco (n8n) não passa pelas rotas
 * do app, então nunca chamou distribuirLead(). Sem isso ele nasce órfão e fica
 * invisível pra todo vendedor (o /inbox filtra pelo dono). A RPC varre os ativos
 * sem linha na roleta e enfileira. Roda a cada tick — barato e idempotente.
 */
async function enfileirarOrfaos(admin: any): Promise<number> {
    try {
        const { data, error } = await admin.rpc('fn_enfileirar_orfaos_distribuicao', { p_limit: 200 });
        if (error) { console.warn('[slaEngine] enfileirarOrfaos:', error.message); return 0; }
        return Number(data) || 0;
    } catch (e: any) {
        console.warn('[slaEngine] enfileirarOrfaos falhou:', e?.message);
        return 0;
    }
}

/** Tick do motor (cron 1/min): resgate de órfãos + despejo de pendentes + SLA + escalonamento. */
export async function tickSla(): Promise<{ ok: boolean; closed?: boolean; resgatados?: number; distribuidos?: number; escalados?: number; esgotados?: number }> {
    const admin = createClient();
    const { horas, feriados } = await loadHorario(admin);
    const now = new Date();

    // Fora do horário o resgate continua rodando: o lead entra na fila como
    // 'aguardando' e o 1º tick da abertura já o despeja com dono.
    const resgatados = await enfileirarOrfaos(admin);
    if (!isOpenNow(now, horas, feriados)) return { ok: true, closed: true, resgatados };

    let distribuidos = 0, escalados = 0, esgotados = 0;

    // 1) Despejo: distribui standby + aguardando (o 1º tick após abrir esvazia o standby).
    //    Mais antigo primeiro — quem esperou mais tem direito ao fallback do check-in.
    const { data: pendentes } = await admin.from('lead_distribuicao').select('*')
        .in('status', ['standby', 'aguardando'])
        .order('criado_em', { ascending: true })
        .limit(50);

    // Teto por tick: sem isso, o primeiro que bate ponto de manhã leva o backlog
    // inteiro na cara (na abertura de 10/08 seriam 11 leads num vendedor só).
    // Com teto, o backlog escoa em alguns minutos e se espalha conforme o time
    // vai chegando — o tick roda 1x/min, então não atrasa lead novo.
    const atribuidosNoTick = new Map<string, number>();
    let semCheckin = false; // ninguém bateu ponto hoje: só tenta quem já pode usar fallback
    for (const p of pendentes || []) {
        const espera = businessSecondsBetween(new Date(p.criado_em), now, horas, feriados);
        const podeFallback = espera >= FALLBACK_SECONDS;
        if (semCheckin && !podeFallback) continue;

        const saturados = [...atribuidosNoTick.entries()]
            .filter(([, n]) => n >= MAX_DESPEJO_POR_VENDEDOR)
            .map(([id]) => id);
        const prox = await pickNextDisponivel(admin, saturados, podeFallback);
        if (!prox) {
            // Todo mundo já pegou sua cota neste tick → o resto vai no próximo (1min).
            if (saturados.length > 0) break;
            if (podeFallback) break; // não há vendedor ativo nenhum — nada a fazer agora
            semCheckin = true;
            continue;
        }
        await atribuirA(admin, p.table_name, p.native_id, prox, now, [prox.id], 0);
        atribuidosNoTick.set(prox.id, (atribuidosNoTick.get(prox.id) || 0) + 1);
        distribuidos++;
    }

    // 2) SLA dos distribuídos
    const { data: dist } = await admin.from('lead_distribuicao').select('*').eq('status', 'distribuido').limit(200);
    for (const d of dist || []) {
        if (!d.distribuido_em) continue;
        if (businessSecondsBetween(new Date(d.distribuido_em), now, horas, feriados) < SLA_SECONDS) continue;
        await logEscalation(admin, d); // registra quem furou
        const tentados: string[] = Array.isArray(d.tentados) ? d.tentados : [];
        // Já furou o SLA: aceita vendedor sem check-in antes de dar o lead por esgotado.
        const prox = await pickNextDisponivel(admin, tentados, true);
        if (prox) { await atribuirA(admin, d.table_name, d.native_id, prox, now, [...tentados, prox.id], (d.ciclos || 0) + 1); escalados++; }
        else { await admin.from('lead_distribuicao').update({ status: 'esgotado', atualizado_em: now.toISOString() }).eq('lead_uid', d.lead_uid); await alertAdminEsgotado(admin, d); esgotados++; }
    }

    return { ok: true, resgatados, distribuidos, escalados, esgotados };
}
