// Motor com ARTE REALISTA: cenário pré-renderizado (cenario.webp) + personagens recortados em cima.
//
// Tudo em coordenadas do cenário (2688×1520). O telão é desenhado ao vivo no retângulo em
// perspectiva da parede; os personagens andam por uma rede de nós sobre o piso livre; mesas e
// bancada são "re-pintadas" por cima de quem está sentado atrás delas. Reage aos mesmos
// EventoCena do motor procedural — sem evento real, só animação de ambiente.

import type { EventoCena } from '@/lib/agentes/eventos';
import type { LinhaLog } from './motor';

export const IW = 2688;
export const IH = 1520;
const K = 1.344; // coordenadas medidas na grade de 2000px → cenário original

interface P { x: number; y: number }
const D = (x: number, y: number): P => ({ x: x * K, y: y * K });

const BASE = '/agentes/arte/';
const ARQUIVOS = [
    'cenario',
    'robo-em-pe', 'robo-andando', 'robo-acenando',
    'alexandre-em-pe', 'alexandre-andando', 'alexandre-comemorando',
    'wilson-em-pe', 'wilson-andando', 'wilson-comemorando',
    'victor-em-pe', 'victor-andando', 'victor-comemorando',
    'cliente-a-em-pe', 'cliente-a-andando', 'cliente-b-em-pe', 'cliente-b-andando', 'cliente-c-em-pe', 'cliente-c-andando',
] as const;

// Telão: quadrilátero da tela na parede (em perspectiva).
const TELAO = { tl: D(1214, 84), tr: D(1750, 172), br: D(1750, 476), bl: D(1214, 366) };
const TW_ = 1000, TH_ = 560;

// Nós do piso livre.
const NOS: Record<string, P> = {
    in: D(900, 1170), a: D(900, 1010), b: D(1250, 1040), c: D(1550, 1040), d: D(650, 930), e: D(690, 660),
    f: D(1590, 830), g: D(1235, 940), p: D(1010, 1000), s: D(1700, 700),
};
const ARESTAS: [string, string][] = [['in', 'a'], ['a', 'b'], ['b', 'c'], ['a', 'd'], ['d', 'e'], ['c', 'f'], ['b', 'g'], ['a', 'p'], ['p', 'b'], ['f', 's']];

type Quem = 'maestro' | 'humano' | 'robo' | 'cliente';
type Estado = 'parado' | 'andando' | 'trabalhando' | 'comemorando' | 'alerta' | 'conversando';

interface Pessoa {
    id: string; nome: string; quem: Quem; spr: string; cor: string;
    x: number; y: number; casa: P; sentado: boolean; occ: number; aproxima: string;
    rota: P[]; vel: number; estado: Estado; ate: number; bolha: { texto: string; ate: number } | null;
    fase: number; alpha: number; quente: boolean; sentidoX: number;
}

// Regiões do cenário re-pintadas sobre quem está sentado atrás da mesa (coordenadas da grade).
const OCC: P[][] = [
    [D(850, 585), D(1000, 545), D(1200, 538), D(1380, 542), D(1462, 585), D(1462, 792), D(850, 792)], // bancada central
    [D(372, 490), D(470, 472), D(822, 468), D(824, 545), D(640, 614), D(372, 606)], // mesa de trás à esquerda
    [D(145, 745), D(330, 798), D(480, 834), D(572, 880), D(572, 1040), D(135, 1000)], // mesa da frente à esquerda
    [D(1500, 975), D(1640, 905), D(1760, 884), D(2000, 905), D(2000, 1131), D(1500, 1131)], // mesa da direita
];

const ROSTER: Omit<Pessoa, 'x' | 'y' | 'rota' | 'estado' | 'ate' | 'bolha' | 'alpha' | 'quente' | 'sentidoX' | 'fase'>[] = [
    { id: 'alexandre', nome: 'Alexandre', quem: 'maestro', spr: 'alexandre', cor: '#ef4444', casa: D(1250, 612), sentado: true, occ: 0, aproxima: 'g', vel: 330 },
    { id: 'laura', nome: 'Laura', quem: 'robo', spr: 'robo', cor: '#38bdf8', casa: D(565, 548), sentado: true, occ: 1, aproxima: 'e', vel: 340 },
    { id: 'consultor_victor', nome: 'Victor', quem: 'humano', spr: 'victor', cor: '#0d9488', casa: D(405, 858), sentado: true, occ: 2, aproxima: 'd', vel: 340 },
    { id: 'consultor_wilson', nome: 'Wilson', quem: 'humano', spr: 'wilson', cor: '#2563eb', casa: D(1712, 892), sentado: true, occ: 3, aproxima: 'f', vel: 340 },
    { id: 'distribuidor', nome: 'Distribuidor', quem: 'robo', spr: 'robo', cor: '#a78bfa', casa: NOS.d, sentado: false, occ: -1, aproxima: 'd', vel: 340 },
    { id: 'supervisor', nome: 'Supervisor', quem: 'robo', spr: 'robo', cor: '#34d399', casa: NOS.s, sentado: false, occ: -1, aproxima: 's', vel: 340 },
    { id: 'publisher', nome: 'Publisher', quem: 'robo', spr: 'robo', cor: '#fb7185', casa: NOS.p, sentado: false, occ: -1, aproxima: 'p', vel: 340 },
];

interface Particula { x: number; y: number; vx: number; vy: number; g: number; vida: number; cor: string; tam: number }
interface Pacote { de: P; para: P; t: number; dur: number; rotulo: string; cor: string }
export interface Aviso { tipo: 'lead_quente' | 'venda' | 'aprovacao'; titulo: string; sub: string }

const altura = (y: number) => Math.max(240, 280 + (y - 600) * 0.17);

function distancia(a: P, b: P) { return Math.hypot(a.x - b.x, a.y - b.y); }

function nomeNo(p: P): string {
    let melhor = 'a', dm = Infinity;
    for (const [k, v] of Object.entries(NOS)) { const d = distancia(p, v); if (d < dm) { dm = d; melhor = k; } }
    return melhor;
}

/** Menor caminho pela rede de nós (Dijkstra pequeno). */
function caminho(de: string, para: string): string[] {
    const dist: Record<string, number> = {}, prev: Record<string, string | null> = {};
    const abertos = new Set(Object.keys(NOS));
    for (const k of abertos) { dist[k] = Infinity; prev[k] = null; }
    dist[de] = 0;
    while (abertos.size) {
        let u: string | null = null;
        for (const k of abertos) if (u === null || dist[k] < dist[u]) u = k;
        if (u === null || dist[u] === Infinity) break;
        abertos.delete(u);
        for (const [a, b] of ARESTAS) {
            const v = a === u ? b : b === u ? a : null;
            if (!v || !abertos.has(v)) continue;
            const alt = dist[u] + distancia(NOS[u], NOS[v]);
            if (alt < dist[v]) { dist[v] = alt; prev[v] = u; }
        }
    }
    const out: string[] = []; let c: string | null = para;
    while (c) { out.unshift(c); c = prev[c]; }
    return out[0] === de ? out : [de, para];
}

function rota(de: P, para: P): P[] {
    const nos = caminho(nomeNo(de), nomeNo(para)).map(k => NOS[k]);
    return [...nos, para];
}

export class MotorArte {
    pessoas: Pessoa[] = [];
    particulas: Particula[] = [];
    pacotes: Pacote[] = [];
    log: LinhaLog[] = [];
    aviso: Aviso | null = null;
    hora: number | null = null; // sem uso: o cenário é noturno; mantém a mesma interface do motor procedural
    /** Números reais do telão. null = ainda não existem (a cena correspondente não aparece — nada de número inventado). */
    vendasMes: number | null = null;
    leads: { quente: number; morno: number; frio: number; semClassificacao?: number } | null = null;
    maestro: { aprovacoes: number; semDono: number; alertas: number } | null = null;
    /** Histórico real recente (feed da API) — aparece no telão abaixo das ações ao vivo. */
    feedReal: LinhaLog[] = [];

    private t = 0;
    private seq = 0;
    private agenda: { em: number; fn: () => void }[] = [];
    private filaAvisos: Aviso[] = [];
    private avisoAte = 0;
    private cena = 0;
    private cenaT = 0;
    private entradaBrilhoAte = 0;
    private imgs: Record<string, HTMLImageElement> = {};
    private prontas = 0;
    private tintas = new Map<string, HTMLCanvasElement>();
    private tela: HTMLCanvasElement | null = null;
    carregado = false;
    falhou = false;

    constructor() {
        ROSTER.forEach((r, i) => this.pessoas.push({ ...r, x: r.casa.x, y: r.casa.y, rota: [], estado: 'parado', ate: 0, bolha: null, alpha: 1, quente: false, sentidoX: 1, fase: i * 1.9 }));
        if (typeof window !== 'undefined') this.carregar();
    }

    private carregar() {
        for (const n of ARQUIVOS) {
            const im = new Image();
            im.onload = () => { this.prontas += 1; if (this.prontas === ARQUIVOS.length) this.carregado = true; };
            im.onerror = () => { this.falhou = true; };
            im.src = `${BASE}${n}.webp`;
            this.imgs[n] = im;
        }
    }

    private p(id: string) { return this.pessoas.find(x => x.id === id) || null; }
    private depois(seg: number, fn: () => void) { this.agenda.push({ em: this.t + seg, fn }); }
    private ir(x: Pessoa, para: P, vel?: number) {
        x.rota = rota({ x: x.x, y: x.y }, para);
        if (vel) x.vel = vel;
        x.estado = 'andando';
    }
    private voltar(x: Pessoa) { this.ir(x, x.casa, x.quem === 'cliente' ? x.vel : 340); }
    private linha(agente: string, texto: string, tom: LinhaLog['tom']) {
        const h = new Date(Date.now() - 3 * 3_600_000);
        const hora = `${String(h.getUTCHours()).padStart(2, '0')}:${String(h.getUTCMinutes()).padStart(2, '0')}`;
        this.log = [{ hora, agente, texto, tom }, ...this.log].slice(0, 8);
    }
    private confete(x: number, y: number) {
        const cores = ['#fbbf24', '#f87171', '#34d399', '#60a5fa', '#e879f9'];
        for (let i = 0; i < 90; i++) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 260 + Math.random() * 520;
            this.particulas.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 900, vida: 1.6 + Math.random(), cor: cores[i % 5], tam: 9 + Math.random() * 9 });
        }
    }
    private novoCliente(nome: string, quente: boolean): Pessoa {
        const letra = 'abc'[this.seq % 3];
        const c: Pessoa = {
            id: `cliente-${++this.seq}`, nome, quem: 'cliente', spr: `cliente-${letra}`, cor: '#fbbf24', x: NOS.in.x, y: NOS.in.y, casa: { ...NOS.in }, sentado: false, occ: -1, aproxima: 'in',
            rota: [], vel: quente ? 520 : 330, estado: 'parado', ate: 0, bolha: null, fase: Math.random() * 6, alpha: 0, quente, sentidoX: 1,
        };
        this.pessoas.push(c);
        this.entradaBrilhoAte = this.t + (quente ? 7 : 3);
        return c;
    }
    private sairCliente(c: Pessoa) {
        c.rota = rota({ x: c.x, y: c.y }, NOS.in); c.estado = 'andando';
        this.depois(9, () => { this.pessoas = this.pessoas.filter(x => x !== c); });
    }
    private levantar(x: Pessoa) { x.sentado = false; }
    private sentarDeNovo(x: Pessoa) { if (x.occ >= 0) x.sentado = true; }

    emitir(ev: EventoCena) {
        const nomeDe = (id: string) => this.p(id)?.nome || id;
        switch (ev.tipo) {
            case 'lead_distribuido': {
                const vend = this.p(ev.para), dist = this.p(ev.de);
                const nome = ev.nome || 'Cliente';
                this.linha(nomeDe(ev.de), `lead${ev.nome ? ' ' + ev.nome : ''} → ${nomeDe(ev.para)}`, 'novo');
                if (dist) { dist.estado = 'trabalhando'; dist.ate = this.t + 3; }
                if (!vend || !dist) break;
                this.pacotes.push({ de: { x: dist.x, y: dist.y - 200 }, para: { x: vend.x, y: vend.y - 220 }, t: 0, dur: 1.8, rotulo: ev.nome || 'lead novo', cor: '#fbbf24' });
                const cli = this.novoCliente(nome, false);
                const ponto = NOS[vend.aproxima];
                const pCli = { x: ponto.x + 60, y: ponto.y + 70 };
                this.ir(cli, pCli);
                this.depois(1.2, () => { this.levantar(vend); this.ir(vend, ponto); });
                const espera = (n: number) => {
                    if (cli.estado === 'andando' || vend.estado === 'andando') { if (n < 80) this.depois(0.5, () => espera(n + 1)); return; }
                    cli.estado = 'conversando'; vend.estado = 'conversando';
                    cli.bolha = { texto: 'Oi! Vim pelo anúncio', ate: this.t + 2.6 };
                    vend.bolha = { texto: `Bem-vindo, ${nome}!`, ate: this.t + 3.4 };
                    this.depois(4, () => { cli.estado = 'parado'; vend.estado = 'parado'; this.voltar(vend); this.depois(4, () => this.sentarDeNovo(vend)); this.sairCliente(cli); });
                };
                this.depois(3, () => espera(0));
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
                this.ir(cli, NOS.g, 560);
                cli.bolha = { texto: '🔥 quero ver o carro hoje!', ate: this.t + 4 };
                this.depois(6, () => this.sairCliente(cli));
                this.filaAvisos.push({ tipo: 'lead_quente', titulo: 'LEAD AQUECENDO!', sub: ev.texto ?? `${ev.nome ?? 'Cliente'} · ${ev.carro ?? ''} — chegando na loja` });
                break;
            }
            case 'venda': {
                const x = this.p(ev.agenteId);
                this.linha(nomeDe(ev.agenteId), ev.nome ? `vendeu ${ev.carro} para ${ev.nome}` : 'registrou uma venda', 'rodando');
                if (x) { x.estado = 'comemorando'; x.ate = this.t + 3.4; x.bolha = { texto: '🎉 Vendi!', ate: this.t + 3.4 }; this.levantar(x); this.confete(x.x, x.y - 260); this.depois(3.6, () => this.sentarDeNovo(x)); }
                if (this.vendasMes != null) this.vendasMes += 1;
                this.filaAvisos.push({ tipo: 'venda', titulo: 'VENDA EFETUADA! PARABÉNS!', sub: [nomeDe(ev.agenteId), ev.nome, ev.carro].filter(Boolean).join(' · ') });
                break;
            }
            case 'aprovacao': {
                const x = this.p(ev.agenteId);
                this.linha(nomeDe(ev.agenteId), ev.titulo, 'espera');
                if (x && x.quem !== 'maestro') {
                    this.levantar(x); this.ir(x, NOS.g);
                    x.bolha = { texto: '✋ Preciso da sua aprovação', ate: this.t + 8 };
                    this.depois(9, () => { x.estado = 'parado'; this.voltar(x); this.depois(5, () => this.sentarDeNovo(x)); });
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
        this.t += dt; this.cenaT += dt;
        if (this.cenaT > 9 && !this.aviso) { this.cenaT = 0; this.cena = (this.cena + 1) % this.cenas().length; }
        for (const a of [...this.agenda]) if (a.em <= this.t) { this.agenda = this.agenda.filter(x => x !== a); a.fn(); }
        if (this.aviso && this.t > this.avisoAte) this.aviso = null;
        if (!this.aviso && this.filaAvisos.length) { this.aviso = this.filaAvisos.shift()!; this.avisoAte = this.t + 5; }
        for (const x of this.pessoas) {
            if (x.quem === 'cliente' && x.alpha < 1) x.alpha = Math.min(1, x.alpha + dt * 1.6);
            if (x.bolha && x.bolha.ate < this.t) x.bolha = null;
            if (x.estado === 'andando') {
                let resto = x.vel * dt;
                while (resto > 0 && x.rota.length) {
                    const alvo = x.rota[0], dx = alvo.x - x.x, dy = alvo.y - x.y, d = Math.hypot(dx, dy);
                    if (Math.abs(dx) > 4) x.sentidoX = dx > 0 ? 1 : -1;
                    if (d <= resto) { x.x = alvo.x; x.y = alvo.y; x.rota.shift(); resto -= d; }
                    else { x.x += (dx / d) * resto; x.y += (dy / d) * resto; resto = 0; }
                }
                if (!x.rota.length) { x.estado = 'parado'; if (x.quem !== 'cliente') x.vel = 340; }
            } else if ((x.estado === 'trabalhando' || x.estado === 'comemorando' || x.estado === 'alerta') && x.ate < this.t) x.estado = 'parado';
        }
        for (const k of this.pacotes) k.t += dt;
        this.pacotes = this.pacotes.filter(k => k.t < k.dur);
        for (const q of this.particulas) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += q.g * dt; q.vida -= dt; }
        this.particulas = this.particulas.filter(q => q.vida > 0);
    }

    // ───────────────────────────── desenho ─────────────────────────────
    desenhar(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#03050a'; ctx.fillRect(0, 0, w, h);
        if (!this.carregado) {
            ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '600 14px system-ui, sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(this.falhou ? 'Não consegui carregar a arte do escritório.' : 'Carregando o escritório…', w / 2, h / 2);
            return;
        }
        const escala = Math.min(w / IW, h / IH);
        const ox = (w - IW * escala) / 2, oy = (h - IH * escala) / 2;
        ctx.setTransform(dpr * escala, 0, 0, dpr * escala, dpr * ox, dpr * oy);
        const plano = this.imgs.cenario;
        ctx.drawImage(plano, 0, 0, IW, IH);

        this.telao(ctx);
        this.luzes(ctx);

        const ordem = [...this.pessoas].sort((a, b) => a.y - b.y);
        for (const x of ordem) {
            this.pessoa(ctx, x);
            if (x.sentado && x.occ >= 0 && x.estado !== 'andando') {
                ctx.save(); ctx.beginPath(); OCC[x.occ].forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath(); ctx.clip();
                ctx.drawImage(plano, 0, 0, IW, IH); ctx.restore();
            }
        }
        for (const x of ordem) this.nome(ctx, x);
        this.desenharPacotes(ctx);
        this.desenharParticulas(ctx);
        this.bolhas(ctx);
        if (this.entradaBrilhoAte > this.t) {
            const a = 0.25 + 0.15 * Math.sin(this.t * 8);
            const g = ctx.createLinearGradient(0, IH, 0, IH - 420); g.addColorStop(0, `rgba(239,68,68,${a})`); g.addColorStop(1, 'rgba(239,68,68,0)');
            ctx.fillStyle = g; ctx.fillRect(400, IH - 420, 1100, 420);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    private sprite(x: Pessoa): { img: HTMLImageElement; escala: number } | null {
        const robo = x.quem === 'robo';
        let pose = 'em-pe';
        if (x.estado === 'andando') pose = 'andando';
        else if (x.estado === 'comemorando') pose = x.quem === 'robo' ? 'acenando' : x.quem === 'cliente' ? 'em-pe' : 'comemorando';
        else if (x.estado === 'alerta' || (x.bolha && x.bolha.texto.startsWith('✋'))) pose = robo ? 'acenando' : 'em-pe';
        let nome = `${x.spr}-${pose}`;
        if (!this.imgs[nome]) nome = `${x.spr}-em-pe`;
        const img = this.imgs[nome];
        if (!img || !img.complete) return null;
        return { img, escala: 1 };
    }

    private tingir(img: HTMLImageElement, nome: string, cor: string): CanvasImageSource {
        const k = `${nome}|${cor}`;
        let c = this.tintas.get(k);
        if (!c) {
            c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
            const g = c.getContext('2d')!; g.drawImage(img, 0, 0);
            g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.18; g.fillStyle = cor; g.fillRect(0, 0, c.width, c.height);
            this.tintas.set(k, c);
        }
        return c;
    }

    private pessoa(ctx: CanvasRenderingContext2D, x: Pessoa) {
        const s = this.sprite(x); if (!s) return;
        const sentadoAgora = x.sentado && x.estado !== 'andando' && x.estado !== 'comemorando';
        let altura_ = altura(x.y) * (sentadoAgora ? 0.74 : 1);
        const andando = x.estado === 'andando';
        const bob = andando ? Math.abs(Math.sin(this.t * 9 + x.fase)) * 9 : Math.sin(this.t * 1.7 + x.fase) * 2.5;
        const pulo = x.estado === 'comemorando' ? Math.abs(Math.sin(this.t * 9)) * 40 : 0;
        const k = altura_ / s.img.naturalHeight;
        const wImg = s.img.naturalWidth * k;
        ctx.save();
        ctx.globalAlpha = x.alpha;
        // sombra própria (as claras foram removidas do recorte)
        if (!sentadoAgora) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(x.x, x.y, wImg * 0.34, 16, 0, 0, Math.PI * 2); ctx.fill(); }
        if (x.quente) {
            const aura = ctx.createRadialGradient(x.x, x.y - altura_ / 2, 10, x.x, x.y - altura_ / 2, altura_ * 0.8);
            aura.addColorStop(0, 'rgba(239,68,68,0.5)'); aura.addColorStop(1, 'rgba(239,68,68,0)');
            ctx.fillStyle = aura; ctx.fillRect(x.x - altura_, x.y - altura_ * 1.4, altura_ * 2, altura_ * 1.6);
        }
        ctx.translate(x.x, x.y - bob - pulo);
        if (x.sentidoX < 0 && (x.estado === 'andando')) ctx.scale(-1, 1);
        const nome = `${x.spr}-${x.estado === 'andando' ? 'andando' : 'x'}`;
        const fonte: CanvasImageSource = x.quem === 'robo' ? this.tingir(s.img, `${s.img.src}${nome}`, x.cor) : s.img;
        ctx.drawImage(fonte, -wImg / 2, -altura_, wImg, altura_);
        ctx.restore();
    }

    private nome(ctx: CanvasRenderingContext2D, x: Pessoa) {
        if (x.quem === 'cliente' && x.alpha < 0.5) return;
        const sentadoAgora = x.sentado && x.estado !== 'andando';
        const y = x.y + (sentadoAgora ? 44 : 34);
        ctx.save(); ctx.globalAlpha = x.alpha * 0.92;
        ctx.font = '700 22px system-ui, sans-serif'; ctx.textAlign = 'center';
        const w = ctx.measureText(x.nome).width + 22;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; this.rr(ctx, x.x - w / 2, y - 20, w, 30, 10); ctx.fill();
        ctx.fillStyle = x.quente ? '#fca5a5' : '#f3f4f6'; ctx.fillText(x.nome, x.x, y + 3);
        ctx.restore();
    }

    private bolhas(ctx: CanvasRenderingContext2D) {
        for (const x of this.pessoas) {
            if (!x.bolha) continue;
            const sentadoAgora = x.sentado && x.estado !== 'andando';
            const topo = x.y - altura(x.y) * (sentadoAgora ? 0.74 : 1) - 26;
            ctx.font = '700 26px system-ui, sans-serif';
            const tw = ctx.measureText(x.bolha.texto).width + 34;
            const ap = Math.min(1, (x.bolha.ate - this.t) * 3);
            ctx.save(); ctx.globalAlpha = Math.max(0, ap) * x.alpha;
            ctx.fillStyle = x.estado === 'alerta' ? '#fecaca' : '#f4f4f5';
            this.rr(ctx, x.x - tw / 2, topo - 52, tw, 46, 16); ctx.fill();
            ctx.beginPath(); ctx.moveTo(x.x - 10, topo - 8); ctx.lineTo(x.x + 8, topo - 8); ctx.lineTo(x.x - 1, topo + 8); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.fillText(x.bolha.texto, x.x, topo - 20);
            ctx.restore();
        }
    }

    private desenharPacotes(ctx: CanvasRenderingContext2D) {
        for (const k of this.pacotes) {
            const f = Math.min(1, k.t / k.dur), e = f * f * (3 - 2 * f);
            const ponto = (ee: number) => ({ x: k.de.x + (k.para.x - k.de.x) * ee, y: k.de.y + (k.para.y - k.de.y) * ee - Math.sin(ee * Math.PI) * 170 });
            for (let i = 1; i <= 7; i++) { const q = ponto(Math.max(0, e - i * 0.03)); ctx.fillStyle = k.cor; ctx.globalAlpha = 0.5 - i * 0.06; ctx.beginPath(); ctx.arc(q.x, q.y, 14 - i, 0, Math.PI * 2); ctx.fill(); }
            ctx.globalAlpha = 1;
            const q = ponto(e);
            const g = ctx.createRadialGradient(q.x, q.y, 4, q.x, q.y, 60); g.addColorStop(0, k.cor); g.addColorStop(1, 'rgba(251,191,36,0)');
            ctx.fillStyle = g; ctx.fillRect(q.x - 62, q.y - 62, 124, 124);
            ctx.font = '800 24px system-ui, sans-serif'; const tw = ctx.measureText('✉ ' + k.rotulo).width + 28;
            ctx.fillStyle = k.cor; this.rr(ctx, q.x - tw / 2, q.y - 66, tw, 38, 12); ctx.fill();
            ctx.fillStyle = '#1a1203'; ctx.textAlign = 'center'; ctx.fillText('✉ ' + k.rotulo, q.x, q.y - 40);
        }
    }

    private desenharParticulas(ctx: CanvasRenderingContext2D) {
        for (const q of this.particulas) { ctx.globalAlpha = Math.min(1, q.vida); ctx.fillStyle = q.cor; ctx.fillRect(q.x, q.y, q.tam, q.tam * 1.6); }
        ctx.globalAlpha = 1;
    }

    private luzes(ctx: CanvasRenderingContext2D) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        const halo = (p: P, r: number, rgb: string, a: number) => {
            const g = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
            ctx.fillStyle = g; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        };
        // luz do telão se espalhando
        const pulso = this.aviso ? 0.22 + 0.1 * Math.sin(this.t * 8) : 0.1;
        halo(D(1480, 300), 520, this.aviso?.tipo === 'venda' ? '16,185,129' : this.aviso?.tipo === 'aprovacao' ? '245,158,11' : '239,68,68', pulso);
        // monitores acesos de quem está trabalhando
        for (const [id, p] of [['laura', D(712, 440)], ['consultor_victor', D(228, 742)], ['consultor_wilson', D(1858, 832)], ['alexandre', D(1085, 565)]] as [string, P][]) {
            const x = this.p(id); if (!x) continue;
            if (x.estado === 'trabalhando' || x.estado === 'comemorando') halo(p, 170, '52,211,153', 0.32);
            else if (x.estado === 'alerta') halo(p, 190, '239,68,68', 0.4 + 0.2 * Math.sin(this.t * 10));
        }
        ctx.restore();
    }

    // Telão ao vivo desenhado numa tela auxiliar e deformado (faixas) para o quadrilátero da parede.
    private telao(ctx: CanvasRenderingContext2D) {
        if (!this.tela) { this.tela = document.createElement('canvas'); this.tela.width = TW_; this.tela.height = TH_; }
        const g = this.tela.getContext('2d')!;
        this.conteudoTelao(g);
        const N = 36;
        const lerp = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        for (let i = 0; i < N; i++) {
            const u0 = i / N, u1 = (i + 1) / N;
            const t0 = lerp(TELAO.tl, TELAO.tr, u0), t1 = lerp(TELAO.tl, TELAO.tr, u1);
            const b0 = lerp(TELAO.bl, TELAO.br, u0), b1 = lerp(TELAO.bl, TELAO.br, u1);
            const sw = (u1 - u0) * TW_;
            ctx.save();
            // mapeia a faixa [u0..u1]×[0..TH_] no paralelogramo (t0, t1, b0)
            const a = (t1.x - t0.x) / sw, b = (t1.y - t0.y) / sw, c = (b0.x - t0.x) / TH_, d = (b0.y - t0.y) / TH_;
            ctx.beginPath(); ctx.moveTo(t0.x - 0.6, t0.y); ctx.lineTo(t1.x + 0.6, t1.y); ctx.lineTo(b1.x + 0.6, b1.y); ctx.lineTo(b0.x - 0.6, b0.y); ctx.closePath(); ctx.clip();
            ctx.transform(a, b, c, d, t0.x, t0.y);
            ctx.drawImage(this.tela, u0 * TW_, 0, sw + 1, TH_, 0, 0, sw + 1, TH_);
            ctx.restore();
        }
    }

    /** Cenas do telão disponíveis agora: só as que têm dado real. */
    private cenas(): ('ao_vivo' | 'leads' | 'maestro' | 'vendas')[] {
        const c: ('ao_vivo' | 'leads' | 'maestro' | 'vendas')[] = ['ao_vivo'];
        if (this.leads) c.push('leads');
        if (this.maestro) c.push('maestro');
        if (this.vendasMes != null) c.push('vendas');
        return c;
    }

    private conteudoTelao(g: CanvasRenderingContext2D) {
        const w = TW_, h = TH_;
        const fundo = g.createLinearGradient(0, 0, 0, h); fundo.addColorStop(0, '#0e1626'); fundo.addColorStop(1, '#05080f');
        g.fillStyle = fundo; g.fillRect(0, 0, w, h);
        g.textBaseline = 'top'; g.textAlign = 'left';
        g.fillStyle = '#ef4444'; g.beginPath(); g.arc(34, 38, 10, 0, 7); g.fill();
        const lista = this.cenas();
        const cena = lista[this.cena % lista.length];
        g.fillStyle = 'rgba(255,255,255,0.9)'; g.font = '800 34px system-ui, sans-serif'; g.fillText({ ao_vivo: 'AO VIVO', leads: 'TERMÔMETRO DE LEADS', maestro: 'MAESTRO', vendas: 'VENDAS' }[cena], 58, 20);
        g.font = '500 30px system-ui, sans-serif';
        if (cena === 'ao_vivo') {
            [...this.log, ...this.feedReal].slice(0, 6).forEach((l, i) => {
                const y = 96 + i * 66;
                g.fillStyle = 'rgba(255,255,255,0.38)'; g.fillText(l.hora, 34, y);
                g.fillStyle = l.tom === 'erro' ? '#f87171' : l.tom === 'espera' ? '#fb7185' : l.tom === 'novo' ? '#fbbf24' : '#34d399'; g.fillRect(140, y + 11, 14, 14);
                g.fillStyle = 'rgba(255,255,255,0.88)'; g.fillText(`${l.agente}: ${l.texto}`.slice(0, 44), 172, y);
            });
            if (!this.log.length && !this.feedReal.length) { g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillText('Aguardando eventos reais…', 34, 110); }
        } else if (cena === 'leads' && this.leads) {
            const l = this.leads, sem = l.semClassificacao ?? 0;
            const tot = Math.max(1, l.quente + l.morno + l.frio + sem);
            ([['Quentes', l.quente, '#ef4444'], ['Mornos', l.morno, '#f59e0b'], ['Frios', l.frio, '#38bdf8'], ['Sem class.', sem, '#71717a']] as [string, number, string][]).forEach(([r, n, c], i) => {
                const y = 96 + i * 100;
                g.fillStyle = 'rgba(255,255,255,0.78)'; g.font = '600 32px system-ui, sans-serif'; g.fillText(r, 34, y);
                g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(250, y + 4, w - 400, 38);
                g.fillStyle = c; g.fillRect(250, y + 4, (w - 400) * (n / tot), 38);
                g.fillStyle = '#fff'; g.font = '800 40px system-ui, sans-serif'; g.fillText(String(n), w - 120, y - 2);
            });
        } else if (cena === 'maestro' && this.maestro) {
            const m = this.maestro;
            ([['Aprovações', m.aprovacoes], ['Sem dono', m.semDono], ['Alertas', m.alertas]] as [string, number][]).forEach(([r, n], i) => {
                const x = 34 + i * 315;
                g.fillStyle = n > 0 ? 'rgba(220,38,38,0.2)' : 'rgba(255,255,255,0.05)'; this.rr(g, x, 110, 290, 300, 24); g.fill();
                g.fillStyle = n > 0 ? '#fca5a5' : 'rgba(255,255,255,0.8)'; g.font = '800 130px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(String(n), x + 145, 170);
                g.fillStyle = 'rgba(255,255,255,0.6)'; g.font = '700 30px system-ui, sans-serif'; g.fillText(r, x + 145, 340); g.textAlign = 'left';
            });
        } else if (cena === 'vendas' && this.vendasMes != null) {
            g.fillStyle = '#34d399'; g.font = '800 200px system-ui, sans-serif'; g.fillText(String(this.vendasMes), 60, 120);
            g.fillStyle = 'rgba(255,255,255,0.65)'; g.font = '600 38px system-ui, sans-serif'; g.fillText('vendas no mês', 70, 360);
        }
        // faixa de linhas de varredura (tela de LED)
        g.fillStyle = 'rgba(255,255,255,0.035)'; for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 2);
        if (this.aviso) {
            const cores = { lead_quente: ['#7f1d1d', '#ef4444'], venda: ['#064e3b', '#10b981'], aprovacao: ['#78350f', '#f59e0b'] }[this.aviso.tipo];
            const gg = g.createLinearGradient(0, 0, w, h); gg.addColorStop(0, cores[0]); gg.addColorStop(1, cores[1]);
            g.globalAlpha = 0.86 + 0.14 * Math.sin(this.t * 8); g.fillStyle = gg; g.fillRect(0, 0, w, h); g.globalAlpha = 1;
            g.fillStyle = '#fff'; g.textAlign = 'center';
            let fs = 70; g.font = `800 ${fs}px system-ui, sans-serif`;
            while (fs > 30 && g.measureText(this.aviso.titulo).width > w - 80) { fs -= 2; g.font = `800 ${fs}px system-ui, sans-serif`; }
            g.fillText(this.aviso.titulo, w / 2, h / 2 - 90);
            g.font = '600 38px system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.92)'; g.fillText(this.aviso.sub.slice(0, 50), w / 2, h / 2 + 10);
            g.textAlign = 'left';
        }
    }

    private rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
        ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }
}
