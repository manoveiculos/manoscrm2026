// Motor isométrico da Central dos Agentes (prova de conceito, Canvas 2D, sem dependências).
//
// Mundo em "tiles" (gx, gy); a tela é a projeção isométrica clássica. Os personagens andam por
// rotas de corredor, e cada EVENTO REAL (EventoCena) dispara um comportamento: lead que chega,
// vendedor que recebe o cliente, venda comemorada, aprovação levada ao Alexandre, erro.
// Sem evento, só há animação de ambiente (respirar, piscar, luz do dia) — nada de trabalho falso.

import type { EventoCena } from '@/lib/agentes/eventos';

export const TW = 96;
export const TH = 48;
const PAREDE = 170;
const GX = 16;
const GY = 13;
const MESA_H = 16;

interface P { x: number; y: number }
const proj = (gx: number, gy: number, z = 0): P => ({ x: ((gx - gy) * TW) / 2, y: ((gx + gy) * TH) / 2 - z });

// Enquadramento do mundo na tela (px do "mundo projetado").
const LIM = { minX: -690, maxX: 830, minY: -215, maxY: 730 };

type Tipo = 'robo' | 'humano' | 'cliente' | 'maestro';
type Estado = 'parado' | 'andando' | 'trabalhando' | 'comemorando' | 'alerta' | 'conversando';

interface Pessoa {
    id: string; nome: string; tipo: Tipo;
    x: number; y: number; casa: P; rota: P[]; vel: number;
    estado: Estado; ate: number; bolha: { texto: string; ate: number } | null;
    cor: string; pele: string; fase: number; alpha: number; quente: boolean;
    lado: 'L' | 'R' | 'porta';
}

interface Particula { x: number; y: number; z: number; vx: number; vy: number; vz: number; vida: number; cor: string; tam: number; luz: boolean }
interface Pacote { de: P; para: P; t: number; dur: number; rotulo: string; cor: string }
export interface LinhaLog { hora: string; agente: string; texto: string; tom: 'ok' | 'erro' | 'espera' | 'novo' | 'rodando' }
export interface Aviso { tipo: 'lead_quente' | 'venda' | 'aprovacao'; titulo: string; sub: string }

const MESAS: { id: string; nome: string; tipo: Tipo; cx: number; cy: number; cor: string; pele: string }[] = [
    { id: 'laura', nome: 'Laura', tipo: 'robo', cx: 3.2, cy: 3.4, cor: '#38bdf8', pele: '' },
    { id: 'distribuidor', nome: 'Distribuidor', tipo: 'robo', cx: 3.2, cy: 5.9, cor: '#a78bfa', pele: '' },
    { id: 'supervisor', nome: 'Supervisor', tipo: 'robo', cx: 3.2, cy: 8.4, cor: '#34d399', pele: '' },
    { id: 'consultor_wilson', nome: 'Wilson', tipo: 'humano', cx: 12.8, cy: 3.4, cor: '#2563eb', pele: '#e0b08a' },
    { id: 'consultor_victor', nome: 'Victor', tipo: 'humano', cx: 12.8, cy: 5.9, cor: '#0d9488', pele: '#c98f68' },
    { id: 'publisher', nome: 'Publisher', tipo: 'robo', cx: 12.8, cy: 8.4, cor: '#fb7185', pele: '' },
];
const ANEL = { x: 8, y: 7.4, r: 1.5 };
const PORTA = { x: 0.7, y: 11.3 };
const AISLE = { L: 5.7, R: 10.3 };
const CRUZA_Y = 4.5;
const FRENTE_ANEL: P = { x: 8, y: 9.7 };
const CARROS = [
    { x: 7.0, y: 11.6, cor: '#dc2626', vendido: false },
    { x: 9.4, y: 11.6, cor: '#e5e7eb', vendido: false },
    { x: 11.8, y: 11.6, cor: '#2563eb', vendido: false },
];

const lado = (x: number): 'L' | 'R' => (x < 8 ? 'L' : 'R');

/** Rota por corredores: nunca atravessa mesa nem a bancada central. */
function rota(de: P, para: P, viaFrente = false): P[] {
    const a = de, b = para;
    const lA = lado(a.x), lB = lado(b.x);
    const pts: P[] = [{ x: AISLE[lA], y: a.y }];
    if (viaFrente) {
        pts.push({ x: AISLE[lA], y: FRENTE_ANEL.y }, FRENTE_ANEL);
    } else if (lA !== lB) {
        pts.push({ x: AISLE[lA], y: CRUZA_Y }, { x: AISLE[lB], y: CRUZA_Y }, { x: AISLE[lB], y: b.y });
    } else {
        pts.push({ x: AISLE[lA], y: b.y });
    }
    pts.push(b);
    return pts;
}

const HORA_BRT = () => {
    const d = new Date(Date.now() - 3 * 3_600_000);
    return d.getUTCHours() + d.getUTCMinutes() / 60;
};

export class MotorJogo {
    pessoas: Pessoa[] = [];
    particulas: Particula[] = [];
    pacotes: Pacote[] = [];
    log: LinhaLog[] = [];
    aviso: Aviso | null = null;
    private filaAvisos: Aviso[] = [];
    private avisoAte = 0;
    private agenda: { em: number; fn: () => void }[] = [];
    private t = 0;
    private portaBrilhoAte = 0;
    private cena = 0;
    private cenaT = 0;
    private seq = 0;
    /** Hora do dia (0–24) usada na luz; null = relógio real (Brasília). */
    hora: number | null = null;
    vendasMes = 5;
    leads = { quente: 7, morno: 19, frio: 44 };

    constructor() {
        const m: Pessoa = {
            id: 'alexandre', nome: 'Alexandre', tipo: 'maestro', x: ANEL.x, y: ANEL.y - 1.9, casa: { x: ANEL.x, y: ANEL.y - 1.9 },
            rota: [], vel: 2, estado: 'parado', ate: 0, bolha: null, cor: '#111827', pele: '#e0b08a', fase: 1.3, alpha: 1, quente: false, lado: 'L',
        };
        this.pessoas.push(m);
        MESAS.forEach((d, i) => {
            const seat = { x: d.cx, y: d.cy - 1.0 };
            this.pessoas.push({
                id: d.id, nome: d.nome, tipo: d.tipo, x: seat.x, y: seat.y, casa: seat, rota: [], vel: 2.3, estado: 'parado', ate: 0, bolha: null,
                cor: d.cor, pele: d.pele, fase: i * 1.7, alpha: 1, quente: false, lado: lado(d.cx),
            });
        });
    }

    private p(id: string) { return this.pessoas.find(x => x.id === id) || null; }
    private depois(seg: number, fn: () => void) { this.agenda.push({ em: this.t + seg, fn }); }
    private ir(x: Pessoa, para: P, viaFrente = false, vel?: number) {
        x.rota = rota({ x: x.x, y: x.y }, para, viaFrente);
        if (vel) x.vel = vel;
        x.estado = 'andando';
    }
    private voltar(x: Pessoa, viaFrente = false) { this.ir(x, x.casa, viaFrente, x.tipo === 'cliente' ? x.vel : 2.3); }
    private linha(agente: string, texto: string, tom: LinhaLog['tom']) {
        const h = new Date(Date.now() - 3 * 3_600_000);
        const hora = `${String(h.getUTCHours()).padStart(2, '0')}:${String(h.getUTCMinutes()).padStart(2, '0')}`;
        this.log = [{ hora, agente, texto, tom }, ...this.log].slice(0, 8);
    }
    private confete(x: number, y: number) {
        const cores = ['#fbbf24', '#f87171', '#34d399', '#60a5fa', '#e879f9'];
        for (let i = 0; i < 60; i++) {
            const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 3.2;
            this.particulas.push({ x, y, z: 30, vx: Math.cos(a) * v * 0.6, vy: Math.sin(a) * v * 0.6, vz: 90 + Math.random() * 120, vida: 1.8 + Math.random(), cor: cores[i % 5], tam: 3 + Math.random() * 3, luz: false });
        }
    }
    private novoCliente(nome: string, quente: boolean): Pessoa {
        const c: Pessoa = {
            id: `cliente-${++this.seq}`, nome, tipo: 'cliente', x: PORTA.x, y: PORTA.y, casa: { ...PORTA }, rota: [], vel: quente ? 3.3 : 2.1,
            estado: 'parado', ate: 0, bolha: null, cor: ['#475569', '#9a3412', '#065f46', '#6b21a8'][this.seq % 4], pele: ['#f0c8a0', '#d9a577', '#b57e57'][this.seq % 3],
            fase: Math.random() * 6, alpha: 0, quente, lado: 'porta',
        };
        this.pessoas.push(c);
        this.portaBrilhoAte = this.t + (quente ? 7 : 3);
        return c;
    }
    private sairCliente(c: Pessoa) {
        c.rota = rota({ x: c.x, y: c.y }, { x: PORTA.x, y: PORTA.y });
        c.estado = 'andando';
        this.depois(9, () => { this.pessoas = this.pessoas.filter(x => x !== c); });
    }

    emitir(ev: EventoCena) {
        const nomeDe = (id: string) => this.p(id)?.nome || id;
        switch (ev.tipo) {
            case 'lead_distribuido': {
                const vend = this.p(ev.para);
                const dist = this.p(ev.de);
                const nome = ev.nome || 'Cliente';
                this.linha(nomeDe(ev.de), `lead${ev.nome ? ' ' + ev.nome : ''} → ${nomeDe(ev.para)}`, 'novo');
                if (dist) { dist.estado = 'trabalhando'; dist.ate = this.t + 3; }
                if (!vend || !dist) break;
                this.pacotes.push({ de: { x: dist.x, y: dist.y }, para: { x: vend.x, y: vend.y }, t: 0, dur: 1.6, rotulo: ev.nome || 'lead novo', cor: '#fbbf24' });
                const cli = this.novoCliente(nome, false);
                const ponto = { x: AISLE[vend.lado === 'porta' ? 'R' : vend.lado], y: vend.casa.y };
                const ponto2 = { x: ponto.x, y: ponto.y + 0.95 };
                this.ir(cli, ponto2);
                this.depois(1.2, () => this.ir(vend, ponto));
                // Quando o cliente chega, conversam; depois o cliente sai e o vendedor volta.
                const espera = (n: number) => {
                    if (cli.estado === 'andando' || vend.estado === 'andando') { if (n < 60) this.depois(0.5, () => espera(n + 1)); return; }
                    cli.estado = 'conversando'; vend.estado = 'conversando';
                    cli.bolha = { texto: `Oi! Vim pelo anúncio`, ate: this.t + 2.6 };
                    vend.bolha = { texto: `Bem-vindo, ${nome}!`, ate: this.t + 3.4 };
                    this.depois(4, () => { cli.estado = 'parado'; vend.estado = 'parado'; this.voltar(vend); this.sairCliente(cli); });
                };
                this.depois(2.5, () => espera(0));
                break;
            }
            case 'fala': {
                const x = this.p(ev.agenteId);
                this.linha(nomeDe(ev.agenteId), ev.texto, 'rodando');
                if (x) { x.bolha = { texto: ev.texto.length > 34 ? ev.texto.slice(0, 33) + '…' : ev.texto, ate: this.t + 4.2 }; if (x.estado === 'parado') { x.estado = 'trabalhando'; x.ate = this.t + 3.5; } }
                break;
            }
            case 'lead_quente': {
                this.linha('Supervisor', ev.texto ?? `lead quente: ${ev.nome ?? ''}`, 'espera');
                const cli = this.novoCliente(ev.nome || 'Lead quente', true);
                this.ir(cli, FRENTE_ANEL, false, 3.4);
                cli.bolha = { texto: '🔥 quero ver o carro hoje!', ate: this.t + 4 };
                this.depois(5.5, () => this.sairCliente(cli));
                this.filaAvisos.push({ tipo: 'lead_quente', titulo: 'LEAD AQUECENDO!', sub: ev.texto ?? `${ev.nome ?? 'Cliente'} · ${ev.carro ?? ''} — chegando na loja` });
                break;
            }
            case 'venda': {
                const x = this.p(ev.agenteId);
                this.linha(nomeDe(ev.agenteId), ev.nome ? `vendeu ${ev.carro} para ${ev.nome}` : 'registrou uma venda', 'rodando');
                if (x) { x.estado = 'comemorando'; x.ate = this.t + 3.2; x.bolha = { texto: '🎉 Vendi!', ate: this.t + 3.2 }; const q = proj(x.x, x.y); this.confete(x.x, x.y); void q; }
                const livre = CARROS.find(c => !c.vendido);
                if (livre) livre.vendido = true; else CARROS.forEach(c => { c.vendido = false; });
                this.vendasMes += 1;
                this.filaAvisos.push({ tipo: 'venda', titulo: 'VENDA EFETUADA! PARABÉNS!', sub: [nomeDe(ev.agenteId), ev.nome, ev.carro].filter(Boolean).join(' · ') });
                break;
            }
            case 'aprovacao': {
                const x = this.p(ev.agenteId);
                this.linha(nomeDe(ev.agenteId), ev.titulo, 'espera');
                if (x && x.tipo !== 'maestro') {
                    this.ir(x, FRENTE_ANEL, true);
                    x.bolha = { texto: '✋ Preciso da sua aprovação', ate: this.t + 8 };
                    this.depois(9, () => { x.estado = 'parado'; this.voltar(x, true); });
                    this.filaAvisos.push({ tipo: 'aprovacao', titulo: 'ESPERANDO VOCÊ', sub: `${x.nome} — ${ev.titulo}` });
                }
                break;
            }
            case 'erro': {
                const x = this.p(ev.agenteId);
                this.linha(nomeDe(ev.agenteId), ev.texto, 'erro');
                if (x) { x.estado = 'alerta'; x.ate = this.t + 7; x.bolha = { texto: '⚠ ' + ev.texto.slice(0, 30), ate: this.t + 6 }; }
                break;
            }
        }
    }

    atualizar(dt: number) {
        this.t += dt;
        this.cenaT += dt;
        if (this.cenaT > 9 && !this.aviso) { this.cenaT = 0; this.cena = (this.cena + 1) % 3; }
        // agenda
        for (const a of [...this.agenda]) if (a.em <= this.t) { this.agenda = this.agenda.filter(x => x !== a); a.fn(); }
        // avisos do telão: um por vez
        if (this.aviso && this.t > this.avisoAte) this.aviso = null;
        if (!this.aviso && this.filaAvisos.length) { this.aviso = this.filaAvisos.shift()!; this.avisoAte = this.t + 5; }
        // pessoas
        for (const x of this.pessoas) {
            if (x.tipo === 'cliente' && x.alpha < 1 && x.estado !== 'parado') x.alpha = Math.min(1, x.alpha + dt * 2);
            if (x.bolha && x.bolha.ate < this.t) x.bolha = null;
            if (x.estado === 'andando') {
                let resto = x.vel * dt;
                while (resto > 0 && x.rota.length) {
                    const alvo = x.rota[0];
                    const dx = alvo.x - x.x, dy = alvo.y - x.y, d = Math.hypot(dx, dy);
                    if (d <= resto) { x.x = alvo.x; x.y = alvo.y; x.rota.shift(); resto -= d; }
                    else { x.x += (dx / d) * resto; x.y += (dy / d) * resto; resto = 0; }
                }
                if (!x.rota.length) { x.estado = 'parado'; x.vel = x.tipo === 'cliente' ? x.vel : 2.3; }
            } else if ((x.estado === 'trabalhando' || x.estado === 'comemorando' || x.estado === 'alerta') && x.ate < this.t) {
                x.estado = 'parado';
            }
            if (x.tipo === 'cliente' && x.estado === 'parado' && !x.rota.length && x.alpha < 1) x.alpha = Math.min(1, x.alpha + dt * 2);
        }
        // pacotes
        for (const k of this.pacotes) k.t += dt;
        this.pacotes = this.pacotes.filter(k => k.t < k.dur);
        // partículas
        for (const q of this.particulas) { q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.vz -= 260 * dt; q.vida -= dt; }
        this.particulas = this.particulas.filter(q => q.vida > 0 && q.z > -5);
    }

    // ───────────────────────────── desenho ─────────────────────────────
    desenhar(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number) {
        const escala = Math.min(w / (LIM.maxX - LIM.minX), h / (LIM.maxY - LIM.minY));
        const ox = (w - (LIM.maxX - LIM.minX) * escala) / 2 - LIM.minX * escala;
        const oy = (h - (LIM.maxY - LIM.minY) * escala) / 2 - LIM.minY * escala;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const fundo = ctx.createRadialGradient(w / 2, h * 0.6, 50, w / 2, h * 0.6, Math.max(w, h) * 0.8);
        fundo.addColorStop(0, '#0d1018'); fundo.addColorStop(1, '#03050a');
        ctx.fillStyle = fundo; ctx.fillRect(0, 0, w, h);
        ctx.setTransform(dpr * escala, 0, 0, dpr * escala, dpr * ox, dpr * oy);

        const hora = this.hora ?? HORA_BRT();
        const noite = this.fatorNoite(hora);

        this.piso(ctx);
        this.paredes(ctx, noite);

        // objetos ordenados por profundidade
        type Obj = { d: number; f: () => void };
        const objs: Obj[] = [];
        MESAS.forEach(m => objs.push({ d: m.cx + m.cy + 0.9, f: () => this.mesa(ctx, m.cx, m.cy, m.id, m.cor) }));
        objs.push({ d: ANEL.x + ANEL.y + 0.6, f: () => this.bancada(ctx) });
        CARROS.forEach(c => objs.push({ d: c.x + c.y + 1, f: () => this.carro(ctx, c) }));
        for (const x of this.pessoas) objs.push({ d: x.x + x.y + (x.tipo === 'maestro' ? 0.2 : 0.35), f: () => this.pessoa(ctx, x) });
        objs.sort((a, b) => a.d - b.d);
        for (const o of objs) o.f();

        this.desenharPacotes(ctx);
        this.desenharParticulas(ctx);
        this.bolhas(ctx);

        // luz do dia/noite
        if (noite > 0.01) {
            ctx.save();
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.fillStyle = `rgba(4,8,38,${0.5 * noite})`; ctx.fillRect(0, 0, w, h);
            ctx.restore();
            ctx.setTransform(dpr * escala, 0, 0, dpr * escala, dpr * ox, dpr * oy);
        }
        this.luzes(ctx, noite);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75);
        vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h);
    }

    private fatorNoite(h: number): number {
        if (h >= 7 && h <= 17) return 0;
        if (h > 17 && h < 19.5) return (h - 17) / 2.5;
        if (h >= 19.5 || h < 5) return 1;
        if (h >= 5 && h < 7) return 1 - (h - 5) / 2;
        return 0;
    }

    private poli(ctx: CanvasRenderingContext2D, pts: P[], fill: string | CanvasGradient, stroke?: string, lw = 1) {
        ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath();
        ctx.fillStyle = fill; ctx.fill();
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
    }

    private caixa(ctx: CanvasRenderingContext2D, gx: number, gy: number, w: number, d: number, h: number, z0: number, topo: string, esq: string, dir: string) {
        const z1 = z0 + h;
        this.poli(ctx, [proj(gx + w, gy, z0), proj(gx + w, gy + d, z0), proj(gx + w, gy + d, z1), proj(gx + w, gy, z1)], dir);
        this.poli(ctx, [proj(gx, gy + d, z0), proj(gx + w, gy + d, z0), proj(gx + w, gy + d, z1), proj(gx, gy + d, z1)], esq);
        this.poli(ctx, [proj(gx, gy, z1), proj(gx + w, gy, z1), proj(gx + w, gy + d, z1), proj(gx, gy + d, z1)], topo);
    }

    private piso(ctx: CanvasRenderingContext2D) {
        for (let gx = 0; gx < GX; gx++) for (let gy = 0; gy < GY; gy++) {
            const vitrine = gx >= 6 && gx < 13 && gy >= 10;
            const par = (gx + gy) % 2 === 0;
            const base = vitrine ? (par ? '#1d2230' : '#181c28') : par ? '#141720' : '#10131b';
            this.poli(ctx, [proj(gx, gy), proj(gx + 1, gy), proj(gx + 1, gy + 1), proj(gx, gy + 1)], base, 'rgba(255,255,255,0.035)');
        }
        // faixa do corredor e aro luminoso da bancada
        ctx.save(); ctx.globalAlpha = 0.5;
        const ring = (r: number, cor: string, lw: number) => {
            ctx.beginPath();
            for (let i = 0; i <= 48; i++) { const a = (i / 48) * Math.PI * 2; const q = proj(ANEL.x + Math.cos(a) * r, ANEL.y + Math.sin(a) * r); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
            ctx.strokeStyle = cor; ctx.lineWidth = lw; ctx.stroke();
        };
        ring(2.35, 'rgba(239,68,68,0.55)', 2); ring(2.7, 'rgba(255,255,255,0.12)', 1);
        ctx.restore();
    }

    private paredes(ctx: CanvasRenderingContext2D, noite: number) {
        // parede direita (plano gy=0) — contém o telão
        this.poli(ctx, [proj(0, 0, 0), proj(GX, 0, 0), proj(GX, 0, PAREDE), proj(0, 0, PAREDE)], '#161a26');
        this.poli(ctx, [proj(0, 0, 0), proj(GX, 0, 0), proj(GX, 0, 14), proj(0, 0, 14)], '#0c0f17');
        // parede esquerda (plano gx=0)
        this.poli(ctx, [proj(0, 0, 0), proj(0, GY, 0), proj(0, GY, PAREDE), proj(0, 0, PAREDE)], '#12151f');
        this.poli(ctx, [proj(0, 0, 0), proj(0, GY, 0), proj(0, GY, 14), proj(0, 0, 14)], '#0a0c13');
        // janelas na parede esquerda
        for (const g of [1.2, 3.4, 5.6, 7.8]) {
            const ceu = ctx.createLinearGradient(0, proj(0, g, 150).y, 0, proj(0, g, 60).y);
            ceu.addColorStop(0, noite > 0.5 ? '#0b1530' : '#7dd3fc'); ceu.addColorStop(1, noite > 0.5 ? '#1e2a55' : '#e0f2fe');
            this.poli(ctx, [proj(0, g, 60), proj(0, g + 1.6, 60), proj(0, g + 1.6, 150), proj(0, g, 150)], ceu, 'rgba(255,255,255,0.22)', 2);
            const m = proj(0, g + 0.8, 60), t = proj(0, g + 0.8, 150);
            ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(t.x, t.y); ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.stroke();
        }
        // porta da loja (abertura brilhante)
        const brilho = this.portaBrilhoAte > this.t ? 1 : 0;
        const pg = ctx.createLinearGradient(0, proj(0, 10.3, 0).y, 0, proj(0, 10.3, 120).y);
        pg.addColorStop(0, brilho ? '#ef4444' : '#38bdf8'); pg.addColorStop(1, brilho ? '#7f1d1d' : '#0c4a6e');
        ctx.save(); ctx.globalAlpha = brilho ? 0.95 : 0.55;
        this.poli(ctx, [proj(0, 10.3, 0), proj(0, 12.3, 0), proj(0, 12.3, 118), proj(0, 10.3, 118)], pg, 'rgba(255,255,255,0.4)', 2);
        ctx.restore();
        // letreiro MANOS na parede esquerda
        ctx.save();
        const o = proj(0, 8.9, 165);
        ctx.transform(1, -0.5, 0, 1, o.x, o.y);
        ctx.fillStyle = '#ef4444'; ctx.font = '800 20px system-ui, sans-serif'; ctx.textAlign = 'left';
        ctx.translate(-150, 6); ctx.fillText('MANOS VEÍCULOS', 0, 0);
        ctx.restore();
        this.telao(ctx);
    }

    private telao(ctx: CanvasRenderingContext2D) {
        const gx0 = 4.2, gx1 = 11.8, zT = 158, zB = 54;
        const a = proj(gx0, 0, zT), larg = (gx1 - gx0) * (TW / 2), alt = zT - zB;
        // moldura
        this.poli(ctx, [proj(gx0 - 0.15, 0, zB - 8), proj(gx1 + 0.15, 0, zB - 8), proj(gx1 + 0.15, 0, zT + 8), proj(gx0 - 0.15, 0, zT + 8)], '#262633', '#3f3f4f', 2);
        ctx.save();
        ctx.transform(1, 0.5, 0, 1, a.x, a.y);
        const g = ctx.createLinearGradient(0, 0, 0, alt);
        g.addColorStop(0, '#0e1626'); g.addColorStop(1, '#05080f');
        ctx.fillStyle = g; ctx.fillRect(0, 0, larg, alt);
        ctx.beginPath(); ctx.rect(0, 0, larg, alt); ctx.clip();
        ctx.textBaseline = 'top'; ctx.textAlign = 'left';
        const rot = ['AO VIVO', 'LEADS', 'MAESTRO'][this.cena];
        ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(14, 15, 4, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.font = '800 13px system-ui, sans-serif'; ctx.fillText(rot, 26, 8);
        ctx.font = '12px system-ui, sans-serif';
        if (this.cena === 0) {
            this.log.slice(0, 5).forEach((l, i) => {
                const y = 30 + i * 16;
                ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillText(l.hora, 12, y);
                ctx.fillStyle = l.tom === 'erro' ? '#f87171' : l.tom === 'espera' ? '#fb7185' : l.tom === 'novo' ? '#fbbf24' : '#34d399'; ctx.fillRect(48, y + 4, 5, 5);
                ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(`${l.agente}: ${l.texto}`.slice(0, 46), 60, y);
            });
            if (!this.log.length) { ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillText('Aguardando eventos reais…', 12, 34); }
        } else if (this.cena === 1) {
            const tot = this.leads.quente + this.leads.morno + this.leads.frio;
            [['Quentes', this.leads.quente, '#ef4444'], ['Mornos', this.leads.morno, '#f59e0b'], ['Frios', this.leads.frio, '#38bdf8']].forEach(([r, n, c], i) => {
                const y = 34 + i * 22;
                ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fillText(String(r), 12, y);
                ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(70, y + 1, larg - 120, 11);
                ctx.fillStyle = String(c); ctx.fillRect(70, y + 1, (larg - 120) * (Number(n) / tot), 11);
                ctx.fillStyle = '#fff'; ctx.fillText(String(n), larg - 38, y);
            });
        } else {
            ctx.fillStyle = '#34d399'; ctx.font = '800 34px system-ui, sans-serif'; ctx.fillText(String(this.vendasMes), 14, 34);
            ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '12px system-ui, sans-serif'; ctx.fillText('vendas no mês', 14, 74);
            ctx.fillStyle = '#fbbf24'; ctx.font = '800 34px system-ui, sans-serif'; ctx.fillText(String(this.leads.quente), larg / 2, 34);
            ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '12px system-ui, sans-serif'; ctx.fillText('leads quentes', larg / 2, 74);
        }
        if (this.aviso) {
            const cores = { lead_quente: ['#7f1d1d', '#ef4444'], venda: ['#064e3b', '#10b981'], aprovacao: ['#78350f', '#f59e0b'] }[this.aviso.tipo];
            const pulso = 0.85 + 0.15 * Math.sin(this.t * 8);
            const gg = ctx.createLinearGradient(0, 0, larg, alt); gg.addColorStop(0, cores[0]); gg.addColorStop(1, cores[1]);
            ctx.globalAlpha = pulso; ctx.fillStyle = gg; ctx.fillRect(0, 0, larg, alt); ctx.globalAlpha = 1;
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '800 21px system-ui, sans-serif';
            ctx.fillText(this.aviso.titulo, larg / 2, alt / 2 - 22);
            ctx.font = '600 13px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.fillText(this.aviso.sub.slice(0, 58), larg / 2, alt / 2 + 8);
        }
        ctx.restore();
    }

    private mesa(ctx: CanvasRenderingContext2D, cx: number, cy: number, id: string, cor: string) {
        const w = 1.8, d = 0.9;
        const x = this.p(id);
        const trabalhando = !!x && (x.estado === 'trabalhando' || x.estado === 'comemorando');
        const erro = !!x && x.estado === 'alerta';
        this.caixa(ctx, cx - w / 2, cy - d / 2, w, d, MESA_H, 0, '#2a2f3f', '#1b1f2c', '#161a25');
        // monitor (face voltada para +y, visível)
        const mw = 0.95, mx = cx - mw / 2, my = cy - 0.05;
        const z0 = MESA_H + 3, z1 = MESA_H + 34;
        this.poli(ctx, [proj(mx, my + 0.08, z0), proj(mx + mw, my + 0.08, z0), proj(mx + mw, my + 0.08, z1), proj(mx, my + 0.08, z1)], '#07090f', '#3b3f50', 2);
        const tela = erro ? '#7f1d1d' : trabalhando ? '#064e3b' : '#0b1220';
        this.poli(ctx, [proj(mx + 0.05, my + 0.09, z0 + 3), proj(mx + mw - 0.05, my + 0.09, z0 + 3), proj(mx + mw - 0.05, my + 0.09, z1 - 3), proj(mx + 0.05, my + 0.09, z1 - 3)], tela);
        for (let i = 0; i < 4; i++) {
            const zz = z1 - 8 - i * 6; const f = trabalhando ? 0.35 + 0.65 * Math.abs(Math.sin(this.t * 3 + i * 1.3)) : 0.35;
            const a = proj(mx + 0.1, my + 0.1, zz), b = proj(mx + 0.1 + (mw - 0.2) * f, my + 0.1, zz);
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = erro ? '#fca5a5' : trabalhando ? '#6ee7b7' : 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.stroke();
        }
        // plaquinha com o nome na frente da mesa
        const o = proj(cx - 0.8, cy + d / 2 + 0.01, 3);
        ctx.save(); ctx.transform(1, 0.5, 0, 1, o.x, o.y);
        ctx.fillStyle = cor; ctx.fillRect(0, 0, 4, 9);
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '700 9px system-ui, sans-serif'; ctx.textBaseline = 'top'; ctx.fillText((MESAS.find(m => m.id === id)?.nome || '').toUpperCase(), 9, -1);
        ctx.restore();
    }

    private bancada(ctx: CanvasRenderingContext2D) {
        const pts = (r: number, z: number) => Array.from({ length: 41 }, (_, i) => { const a = (i / 40) * Math.PI * 2; return proj(ANEL.x + Math.cos(a) * r, ANEL.y + Math.sin(a) * r, z); });
        const h = 22;
        for (let z = 0; z <= h; z += 2) this.poli(ctx, pts(ANEL.r, z), z === h ? '#2a2f3f' : '#171a24');
        this.poli(ctx, pts(ANEL.r * 0.55, h + 0.5), '#0e111a');
        // holograma central
        const c = proj(ANEL.x, ANEL.y, h + 14 + Math.sin(this.t * 2) * 3);
        ctx.save(); ctx.globalAlpha = 0.85;
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(c.x, c.y, 24, 11, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ef4444'; ctx.font = '800 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('A', c.x, c.y + 5);
        ctx.restore();
    }

    private carro(ctx: CanvasRenderingContext2D, c: { x: number; y: number; cor: string; vendido: boolean }) {
        const w = 2.0, d = 0.95;
        this.caixa(ctx, c.x - w / 2, c.y - d / 2, w, d, 16, 5, c.cor, this.esc(c.cor, 0.7), this.esc(c.cor, 0.55));
        this.caixa(ctx, c.x - 0.45, c.y - d / 2 + 0.1, 0.9, d - 0.2, 13, 21, '#0b1220', '#111827', '#0b1220');
        for (const [dx, dy] of [[-0.6, d / 2], [0.6, d / 2]]) { const q = proj(c.x + dx, c.y + dy, 5); ctx.fillStyle = '#05070b'; ctx.beginPath(); ctx.ellipse(q.x, q.y, 9, 7, 0, 0, 7); ctx.fill(); }
        if (c.vendido) {
            const q = proj(c.x, c.y, 62 + Math.sin(this.t * 3) * 2);
            ctx.fillStyle = '#10b981'; ctx.fillRect(q.x - 34, q.y - 10, 68, 18);
            ctx.fillStyle = '#fff'; ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('VENDIDO', q.x, q.y + 3);
        }
    }

    private esc(hex: string, f: number): string {
        const n = parseInt(hex.slice(1), 16);
        const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
        return `rgb(${r},${g},${b})`;
    }

    private pessoa(ctx: CanvasRenderingContext2D, x: Pessoa) {
        const pe = proj(x.x, x.y);
        const andando = x.estado === 'andando';
        const bob = andando ? Math.abs(Math.sin(this.t * 10 + x.fase)) * 3.2 : Math.sin(this.t * 1.6 + x.fase) * 0.9;
        const pulo = x.estado === 'comemorando' ? Math.abs(Math.sin(this.t * 9)) * 16 : 0;
        const sentado = !andando && x.tipo !== 'cliente' && x.tipo !== 'maestro' && x.estado !== 'comemorando' && x.estado !== 'conversando' && Math.hypot(x.x - x.casa.x, x.y - x.casa.y) < 0.05;
        ctx.save();
        ctx.globalAlpha = x.alpha;
        // sombra
        ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.beginPath(); ctx.ellipse(pe.x, pe.y + 2, 17, 7, 0, 0, 7); ctx.fill();
        // aura de lead quente
        if (x.quente) {
            const aura = ctx.createRadialGradient(pe.x, pe.y - 30, 4, pe.x, pe.y - 30, 46); aura.addColorStop(0, 'rgba(239,68,68,0.55)'); aura.addColorStop(1, 'rgba(239,68,68,0)');
            ctx.fillStyle = aura; ctx.fillRect(pe.x - 50, pe.y - 80, 100, 100);
        }
        const y0 = pe.y - bob - pulo;
        const alt = sentado ? 14 : 24;
        // pernas
        if (!sentado) {
            const passo = andando ? Math.sin(this.t * 10 + x.fase) * 4 : 0;
            ctx.fillStyle = '#0f172a'; ctx.fillRect(pe.x - 7 + passo * 0.3, y0 - 14, 5, 14 + passo * 0.4); ctx.fillRect(pe.x + 2 - passo * 0.3, y0 - 14, 5, 14 - passo * 0.4);
        }
        // corpo
        const corpoY = y0 - alt - 18;
        ctx.fillStyle = x.cor; this.rr(ctx, pe.x - 11, corpoY, 22, 24, 7); ctx.fill();
        if (x.tipo === 'maestro') { ctx.fillStyle = '#ef4444'; ctx.font = '800 13px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('A', pe.x, corpoY + 17); }
        // braços (digitando / comemorando / alerta)
        const trab = x.estado === 'trabalhando';
        const braco = (lado: number) => {
            let ay = corpoY + 10;
            if (x.estado === 'comemorando') ay = corpoY - 6 - Math.abs(Math.sin(this.t * 9 + lado)) * 5;
            else if (x.estado === 'alerta' || (x.bolha && x.bolha.texto.startsWith('✋'))) ay = lado > 0 ? corpoY - 12 : corpoY + 10;
            else if (trab) ay = corpoY + 12 + Math.sin(this.t * 14 + lado * 2) * 2.5;
            ctx.fillStyle = x.tipo === 'robo' ? '#cbd5e1' : x.pele || '#e0b08a';
            this.rr(ctx, pe.x + lado * 13 - 3, ay, 6, 11, 3); ctx.fill();
        };
        braco(-1); braco(1);
        // cabeça
        const hy = corpoY - 14;
        if (x.tipo === 'robo') {
            ctx.fillStyle = '#d7dde8'; this.rr(ctx, pe.x - 13, hy - 6, 26, 22, 8); ctx.fill();
            ctx.fillStyle = '#0a0d14'; this.rr(ctx, pe.x - 10, hy - 1, 20, 11, 5); ctx.fill();
            const olho = x.estado === 'alerta' ? '#f87171' : trab || x.estado === 'comemorando' ? '#34d399' : '#7dd3fc';
            const pisca = Math.sin(this.t * 0.9 + x.fase) > 0.985 ? 0.2 : 1;
            ctx.fillStyle = olho; ctx.fillRect(pe.x - 7, hy + 2, 5, 6 * pisca); ctx.fillRect(pe.x + 2, hy + 2, 5, 6 * pisca);
            ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pe.x, hy - 6); ctx.lineTo(pe.x, hy - 13); ctx.stroke();
            ctx.fillStyle = x.estado === 'alerta' ? '#ef4444' : x.cor; ctx.beginPath(); ctx.arc(pe.x, hy - 14, 3, 0, 7); ctx.fill();
        } else {
            ctx.fillStyle = x.pele; ctx.beginPath(); ctx.arc(pe.x, hy + 4, 12, 0, 7); ctx.fill();
            ctx.fillStyle = x.tipo === 'maestro' ? '#111827' : '#2b1d14'; ctx.beginPath(); ctx.arc(pe.x, hy - 1, 12, Math.PI, 0); ctx.fill();
            ctx.fillStyle = '#111'; ctx.fillRect(pe.x - 6, hy + 3, 3, 3); ctx.fillRect(pe.x + 3, hy + 3, 3, 3);
            if (x.tipo === 'maestro') { ctx.fillStyle = '#fbbf24'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('♛', pe.x, hy - 12); }
        }
        // nome
        ctx.globalAlpha = x.alpha * 0.9;
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; const nw = ctx.measureText(x.nome).width + 10;
        ctx.font = '700 10px system-ui, sans-serif'; ctx.textAlign = 'center';
        const tw = ctx.measureText(x.nome).width + 10;
        void nw;
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; this.rr(ctx, pe.x - tw / 2, pe.y + 6, tw, 14, 5); ctx.fill();
        ctx.fillStyle = x.quente ? '#fca5a5' : '#e5e7eb'; ctx.fillText(x.nome, pe.x, pe.y + 16);
        ctx.restore();
    }

    private bolhas(ctx: CanvasRenderingContext2D) {
        for (const x of this.pessoas) {
            if (!x.bolha) continue;
            const pe = proj(x.x, x.y);
            ctx.font = '700 12px system-ui, sans-serif';
            const tw = ctx.measureText(x.bolha.texto).width + 18;
            const by = pe.y - 112;
            const ap = Math.min(1, (x.bolha.ate - this.t) * 3, 1);
            ctx.save(); ctx.globalAlpha = Math.max(0, ap);
            ctx.fillStyle = x.estado === 'alerta' ? '#fecaca' : '#f4f4f5';
            this.rr(ctx, pe.x - tw / 2, by, tw, 24, 9); ctx.fill();
            ctx.beginPath(); ctx.moveTo(pe.x - 5, by + 23); ctx.lineTo(pe.x + 3, by + 23); ctx.lineTo(pe.x - 1, by + 31); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.fillText(x.bolha.texto, pe.x, by + 16);
            ctx.restore();
        }
    }

    private desenharPacotes(ctx: CanvasRenderingContext2D) {
        for (const k of this.pacotes) {
            const f = Math.min(1, k.t / k.dur);
            const e = f * f * (3 - 2 * f);
            const a = proj(k.de.x, k.de.y, 60), b = proj(k.para.x, k.para.y, 60);
            const x = a.x + (b.x - a.x) * e, y = a.y + (b.y - a.y) * e - Math.sin(e * Math.PI) * 70;
            for (let i = 1; i <= 6; i++) {
                const ee = Math.max(0, e - i * 0.03);
                const tx = a.x + (b.x - a.x) * ee, ty = a.y + (b.y - a.y) * ee - Math.sin(ee * Math.PI) * 70;
                ctx.fillStyle = k.cor; ctx.globalAlpha = 0.5 - i * 0.07; ctx.beginPath(); ctx.arc(tx, ty, 6 - i * 0.6, 0, 7); ctx.fill();
            }
            ctx.globalAlpha = 1;
            const g = ctx.createRadialGradient(x, y, 2, x, y, 26); g.addColorStop(0, k.cor); g.addColorStop(1, 'rgba(251,191,36,0)');
            ctx.fillStyle = g; ctx.fillRect(x - 28, y - 28, 56, 56);
            ctx.fillStyle = '#1a1203'; ctx.font = '800 11px system-ui, sans-serif'; const tw = ctx.measureText(k.rotulo).width + 14;
            ctx.fillStyle = k.cor; this.rr(ctx, x - tw / 2, y - 26, tw, 17, 6); ctx.fill();
            ctx.fillStyle = '#1a1203'; ctx.textAlign = 'center'; ctx.fillText('✉ ' + k.rotulo, x, y - 14);
        }
    }

    private desenharParticulas(ctx: CanvasRenderingContext2D) {
        for (const q of this.particulas) {
            const p = proj(q.x, q.y, q.z);
            ctx.globalAlpha = Math.min(1, q.vida); ctx.fillStyle = q.cor;
            ctx.fillRect(p.x, p.y, q.tam, q.tam * 1.5);
        }
        ctx.globalAlpha = 1;
    }

    private luzes(ctx: CanvasRenderingContext2D, noite: number) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const halo = (p: P, r: number, cor: string, a: number) => {
            const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, r); g.addColorStop(0, cor.replace('A', String(a))); g.addColorStop(1, cor.replace('A', '0'));
            ctx.fillStyle = g; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        };
        for (const m of MESAS) {
            const x = this.p(m.id); if (!x) continue;
            const ativo = x.estado === 'trabalhando' || x.estado === 'comemorando';
            const erro = x.estado === 'alerta';
            const p = proj(m.cx, m.cy + 0.1, 30);
            if (ativo) halo(p, 70, 'rgba(52,211,153,A)', 0.45 + 0.25 * noite);
            else if (erro) halo(p, 80, 'rgba(239,68,68,A)', 0.55 + 0.2 * Math.sin(this.t * 10));
            else if (noite > 0.3) halo(p, 46, 'rgba(120,160,255,A)', 0.16 * noite);
        }
        halo(proj(8, 0, 105), 260, 'rgba(56,120,255,A)', 0.14 + 0.1 * noite);
        halo(proj(ANEL.x, ANEL.y, 30), 150, 'rgba(239,68,68,A)', 0.12 + 0.1 * noite);
        if (this.portaBrilhoAte > this.t) halo(proj(0, 11.3, 60), 150, 'rgba(239,68,68,A)', 0.5);
        ctx.restore();
    }

    private rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
        ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
}
