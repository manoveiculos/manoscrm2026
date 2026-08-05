'use client';

/**
 * RG Scooters — porta fiel do gestor-scooters.jsx (arquivo original NÃO alterado),
 * trocando a persistência window.storage por Supabase via /api/scooters/*.
 * Mesmo design (tema claro próprio, 5 abas, folhas de baixo).
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

// ---------- Design tokens ----------
const C = {
    bg: '#F3F6F5', surface: '#FFFFFF', ink: '#14201C', inkSoft: '#5C6B66', line: '#E3EAE7',
    volt: '#00B98D', voltDark: '#0A3D31', amber: '#F5A623', red: '#E5484D', blue: '#2F6FED',
};
const fontLink = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&display=swap';

const fmt = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const monthKey = (d?: string) => { const dt = d ? new Date(d) : new Date(); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`; };
const hoje = () => new Date().toISOString().slice(0, 10);

interface Scooter { id: string; modelo: string; custo: number; preco: number; qtd: number; }
interface Venda { id: string; modelo: string; custo: number; cliente: string; valor: number; pagamento: string; data: string; }
interface Cliente { id: string; nome: string; whats?: string; interesse?: string; status: string; }
interface Despesa { id: string; desc: string; valor: number; data: string; }
interface Data { scooters: Scooter[]; vendas: Venda[]; clientes: Cliente[]; despesas: Despesa[]; meta: number; saldoInicial: number; metaLoja: number; isAdmin: boolean; }

// ---------- Lógica de caixa (acumulado = banco) ----------
const somaVendas = (d: Data) => d.vendas.reduce((s, v) => s + v.valor, 0);
const somaDespesas = (d: Data) => d.despesas.reduce((s, x) => s + x.valor, 0);
// Dinheiro que o Renato TEM hoje: abre com o saldo inicial e acumula tudo. Nunca zera.
const caixaAtual = (d: Data) => d.saldoInicial + somaVendas(d) - somaDespesas(d);

// ---------- Mentor (ensina o Renato, 13 anos) ----------
type Alerta = { tone: 'good' | 'warn' | 'info'; icon: string; text: string };
function mentorAlertas(d: Data): Alerta[] {
    const mk = monthKey();
    const entradasMes = d.vendas.filter((v) => monthKey(v.data) === mk).reduce((s, v) => s + v.valor, 0);
    const saidasMes = d.despesas.filter((x) => monthKey(x.data) === mk).reduce((s, x) => s + x.valor, 0);
    const a: Alerta[] = [];

    if (saidasMes > entradasMes && (entradasMes > 0 || saidasMes > 0)) {
        a.push({ tone: 'warn', icon: '⚠️', text: `Esse mês saiu ${fmt(saidasMes)} e entrou ${fmt(entradasMes)}. Você gastou mais do que ganhou — segura as despesas e foca em vender.` });
    } else if (entradasMes > 0) {
        a.push({ tone: 'good', icon: '🚀', text: `Boa! Esse mês entrou ${fmt(entradasMes)} e saiu ${fmt(saidasMes)}. Está sobrando dinheiro — é assim que a empresa cresce.` });
    }
    if (entradasMes > 0) {
        a.push({ tone: 'info', icon: '🐷', text: `Dica de dono: guarde ${fmt(entradasMes * 0.2)} (20% do que vendeu) e não gaste. Esse dinheiro é o que vai virar a sua loja física.` });
    }
    const baixaMargem = d.scooters.filter((m) => m.preco > 0 && (m.preco - m.custo) / m.preco < 0.2);
    if (baixaMargem.length) {
        a.push({ tone: 'warn', icon: '📉', text: `Margem baixa em: ${baixaMargem.map((m) => m.modelo).join(', ')}. Você lucra pouco vendendo esses — aumente o preço ou compre mais barato.` });
    }
    const leads = d.clientes.filter((c) => c.status !== 'Comprou').length;
    if (leads > 0) {
        a.push({ tone: 'info', icon: '💬', text: `Você tem ${leads} ${leads === 1 ? 'cliente esperando' : 'clientes esperando'} resposta. Lead parado é venda perdida — chama no WhatsApp hoje.` });
    }
    return a;
}
const alertaBg: any = { good: '#E8F9F3', warn: '#FFF8EC', info: '#EEF3FF' };
const alertaInk: any = { good: '#0A3D31', warn: '#8A6110', info: '#28407A' };

// ---------- UI base ----------
function Card({ children, style }: any) {
    return <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.line}`, padding: 16, ...style }}>{children}</div>;
}
function Btn({ children, onClick, kind = 'primary', style, disabled }: any) {
    const kinds: any = {
        primary: { background: C.volt, color: '#fff' }, dark: { background: C.voltDark, color: '#fff' },
        ghost: { background: 'transparent', color: C.inkSoft, border: `1px solid ${C.line}` }, danger: { background: '#FDECEC', color: C.red },
    };
    return <button onClick={onClick} disabled={disabled} style={{ border: 'none', borderRadius: 12, padding: '13px 18px', fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 15, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, width: '100%', ...kinds[kind], ...style }}>{children}</button>;
}
function Field({ label, children }: any) {
    return <label style={{ display: 'block', marginBottom: 14 }}><span style={{ fontSize: 13, fontWeight: 600, color: C.inkSoft, display: 'block', marginBottom: 6 }}>{label}</span>{children}</label>;
}
// Botão de envio à prova de toque-duplo: trava enquanto o POST está em andamento.
// Mata a duplicidade de registros (venda/despesa/cliente/modelo salvos 2x no celular).
function SubmitBtn({ children, onClick, kind = 'primary', style, disabled }: any) {
    const [busy, setBusy] = useState(false);
    return (
        <Btn kind={kind} style={style} disabled={disabled || busy}
            onClick={async () => { if (busy) return; setBusy(true); try { await onClick(); } catch { /* erro tratado no chamador */ } finally { setBusy(false); } }}>
            {busy ? 'Salvando…' : children}
        </Btn>
    );
}

const miniBtn: any = { flex: 1, padding: '8px 0', borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: `1px solid ${C.line}`, background: 'transparent' };
// Linha de ações Editar / Excluir reutilizada nos cards de venda, cliente e despesa
function RowActions({ onEdit, onDelete, delMsg }: { onEdit: () => void; onDelete: () => void; delMsg: string }) {
    return (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={onEdit} style={{ ...miniBtn, color: C.inkSoft }}>Editar</button>
            <button onClick={() => { if (confirm(delMsg)) onDelete(); }} style={{ ...miniBtn, color: C.red, background: '#FDECEC', border: '1px solid #F5C6C7' }}>Excluir</button>
        </div>
    );
}
const inputStyle: any = { width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 16, fontFamily: "'Inter', sans-serif", color: C.ink, background: '#FAFCFB', outline: 'none' };
function Sheet({ title, onClose, children }: any) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,25,20,0.45)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: C.bg, width: '100%', maxWidth: 480, maxHeight: '88vh', overflowY: 'auto', borderRadius: '22px 22px 0 0', padding: '10px 20px 30px' }}>
                <div style={{ width: 42, height: 4, borderRadius: 4, background: C.line, margin: '6px auto 14px' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h2 style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, color: C.ink }}>{title}</h2>
                    <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: 22, color: C.inkSoft, cursor: 'pointer' }}>✕</button>
                </div>
                {children}
            </div>
        </div>
    );
}
function BatteryMeta({ pct }: { pct: number }) {
    const clamped = Math.min(100, Math.round(pct));
    const cells = 5; const filled = Math.round((clamped / 100) * cells);
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 3, padding: 4, border: `2px solid rgba(255,255,255,0.5)`, borderRadius: 8 }}>
                {Array.from({ length: cells }).map((_, i) => <div key={i} style={{ width: 22, height: 26, borderRadius: 4, background: i < filled ? C.volt : 'rgba(255,255,255,0.14)', transition: 'background 0.4s' }} />)}
            </div>
            <div style={{ width: 4, height: 14, borderRadius: 2, background: 'rgba(255,255,255,0.5)' }} />
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18, color: '#fff' }}>{clamped}%</span>
        </div>
    );
}

// ---------- Telas ----------
function Dashboard({ data, setModal }: any) {
    const mk = monthKey();
    const vendasMes = data.vendas.filter((v: Venda) => monthKey(v.data) === mk);
    const faturamento = vendasMes.reduce((s: number, v: Venda) => s + v.valor, 0);
    const lucro = vendasMes.reduce((s: number, v: Venda) => s + (v.valor - v.custo), 0);
    const despesasMes = data.despesas.filter((d: Despesa) => monthKey(d.data) === mk).reduce((s: number, d: Despesa) => s + d.valor, 0);
    const baixoEstoque = data.scooters.filter((m: Scooter) => m.qtd > 0 && m.qtd <= 1);
    const esgotados = data.scooters.filter((m: Scooter) => m.qtd === 0);
    const leadsAbertos = data.clientes.filter((c: Cliente) => c.status !== 'Comprou').length;
    const pct = data.meta > 0 ? (faturamento / data.meta) * 100 : 0;
    const mesNome = new Date().toLocaleDateString('pt-BR', { month: 'long' });
    // Mentor: caixa acumulado + progresso rumo à loja física + alertas
    const saldo = caixaAtual(data);
    const metaLoja = data.metaLoja;
    const pctLoja = metaLoja > 0 ? (saldo / metaLoja) * 100 : 0;
    const faltam = Math.max(0, metaLoja - saldo);
    const alertas = mentorAlertas(data);

    return (
        <div>
            <div style={{ background: `linear-gradient(150deg, ${C.voltDark} 0%, #10614C 100%)`, borderRadius: 20, padding: '22px 20px', color: '#fff', marginBottom: 16 }}>
                <div style={{ fontSize: 13, opacity: 0.75, textTransform: 'capitalize' }}>Faturamento · {mesNome}</div>
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 38, fontWeight: 700, margin: '4px 0 14px' }}>{fmt(faturamento)}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <BatteryMeta pct={pct} />
                    <button onClick={() => setModal({ type: 'meta' })} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', borderRadius: 10, padding: '8px 12px', fontSize: 13, cursor: 'pointer' }}>Meta {fmt(data.meta)}</button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                {[
                    { l: 'Lucro do mês', v: fmt(lucro), c: lucro >= 0 ? C.volt : C.red },
                    { l: 'Despesas', v: fmt(despesasMes), c: C.amber },
                    { l: 'Vendas', v: vendasMes.length, c: C.ink },
                    { l: 'Leads abertos', v: leadsAbertos, c: C.blue },
                ].map((k) => (
                    <Card key={k.l} style={{ padding: 14 }}>
                        <div style={{ fontSize: 12, color: C.inkSoft, fontWeight: 600 }}>{k.l}</div>
                        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, color: k.c, marginTop: 4 }}>{k.v}</div>
                    </Card>
                ))}
            </div>

            {/* META LOJA FÍSICA (mentor) */}
            <Card style={{ marginBottom: 16, background: C.voltDark, border: 'none', color: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>🏪 Meta: sua loja física</div>
                    <button onClick={() => setModal({ type: 'metaLoja' })} style={{ background: 'rgba(255,255,255,0.14)', border: 'none', color: '#fff', borderRadius: 9, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>{fmt(metaLoja)}</button>
                </div>
                <div style={{ height: 12, borderRadius: 8, background: 'rgba(255,255,255,0.15)', overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ width: `${Math.min(100, Math.max(0, pctLoja))}%`, height: '100%', background: C.volt, transition: 'width 0.5s' }} />
                </div>
                <div style={{ fontSize: 13, opacity: 0.92, lineHeight: 1.45 }}>
                    {saldo >= metaLoja
                        ? 'Você já juntou o suficiente pra sua loja física! Fala com seu pai pra dar o próximo passo. 🚀'
                        : `Você já tem ${fmt(saldo)} no caixa. Faltam ${fmt(faltam)} pra abrir sua loja. Cada venda te deixa mais perto — bora!`}
                </div>
            </Card>

            {/* ALERTAS DO MENTOR */}
            {alertas.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                    {alertas.map((al: Alerta, i: number) => (
                        <Card key={i} style={{ marginBottom: 8, background: alertaBg[al.tone], border: `1px solid ${alertaBg[al.tone]}` }}>
                            <div style={{ fontSize: 13, color: alertaInk[al.tone], lineHeight: 1.45 }}><span style={{ marginRight: 6 }}>{al.icon}</span>{al.text}</div>
                        </Card>
                    ))}
                </div>
            )}

            {(baixoEstoque.length > 0 || esgotados.length > 0) && (
                <Card style={{ background: '#FFF8EC', border: `1px solid #F3E2BC`, marginBottom: 16 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#8A6110', marginBottom: 6 }}>⚡ Atenção ao estoque</div>
                    {esgotados.map((m: Scooter) => <div key={m.id} style={{ fontSize: 13, color: '#8A6110' }}>• {m.modelo} — esgotado</div>)}
                    {baixoEstoque.map((m: Scooter) => <div key={m.id} style={{ fontSize: 13, color: '#8A6110' }}>• {m.modelo} — última unidade</div>)}
                </Card>
            )}

            <Card>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: C.ink }}>Últimas vendas</div>
                {data.vendas.length === 0 && <div style={{ fontSize: 14, color: C.inkSoft }}>Nenhuma venda ainda. Registre a primeira na aba Vendas.</div>}
                {[...data.vendas].sort((a: Venda, b: Venda) => b.data.localeCompare(a.data)).slice(0, 5).map((v: Venda) => (
                    <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: `1px solid ${C.line}`, fontSize: 14 }}>
                        <span style={{ color: C.ink }}>{v.modelo} · {v.cliente}</span>
                        <span style={{ fontWeight: 700, color: C.volt }}>{fmt(v.valor)}</span>
                    </div>
                ))}
            </Card>
        </div>
    );
}

function Estoque({ data, setModal, incModel, delModel }: any) {
    return (
        <div>
            <Btn onClick={() => setModal({ type: 'scooter' })} style={{ marginBottom: 14 }}>+ Cadastrar modelo</Btn>
            {data.scooters.length === 0 && <Card><span style={{ color: C.inkSoft, fontSize: 14 }}>Cadastre os modelos que o Renato vai vender: nome, custo, preço e quantidade.</span></Card>}
            {data.scooters.map((m: Scooter) => {
                const margem = m.preco > 0 ? Math.round(((m.preco - m.custo) / m.preco) * 100) : 0;
                return (
                    <Card key={m.id} style={{ marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 17, color: C.ink }}>{m.modelo}</div>
                                <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 3 }}>Custo {fmt(m.custo)} · Venda {fmt(m.preco)} · Margem {margem}%</div>
                            </div>
                            <div style={{ textAlign: 'center', background: m.qtd === 0 ? '#FDECEC' : '#E8F9F3', borderRadius: 10, padding: '6px 12px' }}>
                                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18, color: m.qtd === 0 ? C.red : C.voltDark }}>{m.qtd}</div>
                                <div style={{ fontSize: 10, color: C.inkSoft }}>em estoque</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <Btn kind="ghost" style={{ padding: '9px' }} onClick={() => incModel(m.id, 1)}>+1 unidade</Btn>
                            <Btn kind="ghost" style={{ padding: '9px' }} disabled={m.qtd === 0} onClick={() => incModel(m.id, -1)}>−1 unidade</Btn>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <Btn kind="ghost" style={{ padding: '9px' }} onClick={() => setModal({ type: 'scooter', edit: m })}>Editar</Btn>
                            <Btn kind="danger" style={{ padding: '9px' }} onClick={() => { if (confirm(`Excluir ${m.modelo}?`)) delModel(m.id); }}>Excluir</Btn>
                        </div>
                    </Card>
                );
            })}
        </div>
    );
}

function Vendas({ data, setModal, delVenda }: any) {
    const grupos = useMemo(() => {
        const g: any = {};
        [...data.vendas].sort((a: Venda, b: Venda) => b.data.localeCompare(a.data)).forEach((v: Venda) => { const k = monthKey(v.data); (g[k] = g[k] || []).push(v); });
        return g;
    }, [data.vendas]);

    return (
        <div>
            <Btn onClick={() => setModal({ type: 'venda' })} style={{ marginBottom: 14 }} disabled={data.scooters.filter((s: Scooter) => s.qtd > 0).length === 0}>+ Registrar venda</Btn>
            {data.scooters.filter((s: Scooter) => s.qtd > 0).length === 0 && <Card style={{ marginBottom: 10 }}><span style={{ fontSize: 14, color: C.inkSoft }}>Para registrar uma venda, cadastre um modelo com estoque disponível.</span></Card>}
            {Object.entries(grupos).map(([mes, vendas]: any) => {
                const tot = vendas.reduce((s: number, v: Venda) => s + v.valor, 0);
                const luc = vendas.reduce((s: number, v: Venda) => s + (v.valor - v.custo), 0);
                const [y, m] = mes.split('-');
                const nome = new Date(Number(y), Number(m) - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                return (
                    <div key={mes} style={{ marginBottom: 18 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 4px 8px', fontSize: 13 }}>
                            <span style={{ fontWeight: 700, color: C.inkSoft, textTransform: 'capitalize' }}>{nome}</span>
                            <span style={{ color: C.inkSoft }}>{fmt(tot)} · lucro <b style={{ color: C.volt }}>{fmt(luc)}</b></span>
                        </div>
                        {vendas.map((v: Venda) => (
                            <Card key={v.id} style={{ marginBottom: 8, padding: 14 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: 15, color: C.ink }}>{v.modelo}</div>
                                        <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 2 }}>{v.cliente} · {new Date(v.data + 'T12:00').toLocaleDateString('pt-BR')} · {v.pagamento}</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 17, color: C.ink }}>{fmt(v.valor)}</div>
                                        <div style={{ fontSize: 12, color: C.volt, fontWeight: 600 }}>lucro {fmt(v.valor - v.custo)}</div>
                                    </div>
                                </div>
                                <RowActions onEdit={() => setModal({ type: 'venda', edit: v })} onDelete={() => delVenda(v.id)} delMsg={`Excluir a venda de ${v.modelo} (${v.cliente})? A unidade volta pro estoque.`} />
                            </Card>
                        ))}
                    </div>
                );
            })}
        </div>
    );
}

const STATUS = ['Lead', 'Negociando', 'Comprou'];
const statusColor: any = { Lead: C.blue, Negociando: C.amber, Comprou: C.volt };

function Clientes({ data, setModal, setClienteStatus, delCliente }: any) {
    return (
        <div>
            <Btn onClick={() => setModal({ type: 'cliente' })} style={{ marginBottom: 14 }}>+ Novo cliente / lead</Btn>
            {data.clientes.length === 0 && <Card><span style={{ fontSize: 14, color: C.inkSoft }}>Todo interessado que chamar no WhatsApp ou Instagram entra aqui. Lead esquecido é venda perdida.</span></Card>}
            {[...data.clientes].reverse().map((c: Cliente) => (
                <Card key={c.id} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: 16, color: C.ink }}>{c.nome}</div>
                            {c.interesse && <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 2 }}>Interesse: {c.interesse}</div>}
                        </div>
                        {c.whats && <a href={`https://wa.me/55${c.whats.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" style={{ background: '#E8F9F3', color: C.voltDark, borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>WhatsApp</a>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                        {STATUS.map((s) => (
                            <button key={s} onClick={() => setClienteStatus(c.id, s)} style={{ flex: 1, padding: '8px 0', borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: `1px solid ${c.status === s ? statusColor[s] : C.line}`, background: c.status === s ? statusColor[s] : 'transparent', color: c.status === s ? '#fff' : C.inkSoft }}>{s}</button>
                        ))}
                    </div>
                    <RowActions onEdit={() => setModal({ type: 'cliente', edit: c })} onDelete={() => delCliente(c.id)} delMsg={`Excluir o cliente ${c.nome}?`} />
                </Card>
            ))}
        </div>
    );
}

function Caixa({ data, setModal, delDespesa }: any) {
    const mk = monthKey();
    const saldo = caixaAtual(data);                 // dinheiro de verdade, acumulado = banco
    const entradasTotais = somaVendas(data);
    const saidasTotais = somaDespesas(data);

    // Movimento SÓ deste mês (separado do saldo — não zera o caixa ao virar o mês)
    const despesasMes = data.despesas.filter((d: Despesa) => monthKey(d.data) === mk);
    const entradasMes = data.vendas.filter((v: Venda) => monthKey(v.data) === mk).reduce((s: number, v: Venda) => s + v.valor, 0);
    const saidasMes = despesasMes.reduce((s: number, d: Despesa) => s + d.valor, 0);
    const resultadoMes = entradasMes - saidasMes;

    // Histórico por mês (o dado nunca some)
    const hist: Record<string, { e: number; s: number }> = {};
    data.vendas.forEach((v: Venda) => { const k = monthKey(v.data); (hist[k] = hist[k] || { e: 0, s: 0 }).e += v.valor; });
    data.despesas.forEach((d: Despesa) => { const k = monthKey(d.data); (hist[k] = hist[k] || { e: 0, s: 0 }).s += d.valor; });
    const meses = Object.keys(hist).sort((a, b) => b.localeCompare(a));

    return (
        <div>
            {/* SALDO ACUMULADO = BANCO */}
            <div style={{ background: `linear-gradient(150deg, ${C.voltDark} 0%, #10614C 100%)`, borderRadius: 20, padding: '22px 20px', color: '#fff', marginBottom: 12 }}>
                <div style={{ fontSize: 13, opacity: 0.8 }}>Seu dinheiro hoje 💰</div>
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 38, fontWeight: 700, margin: '4px 0 4px' }}>{fmt(saldo)}</div>
                <div style={{ fontSize: 12.5, opacity: 0.75, marginBottom: 14 }}>Tem que ser igual ao que está no seu banco.</div>
                <button onClick={() => setModal({ type: 'saldoBanco' })} style={{ background: 'rgba(255,255,255,0.14)', border: 'none', color: '#fff', borderRadius: 10, padding: '10px 14px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', width: '100%' }}>🏦 Conferir com o banco</button>
            </div>

            {/* Explicação (mentor) */}
            <Card style={{ marginBottom: 12, background: '#EEF3FF', border: '1px solid #D6E0FB' }}>
                <div style={{ fontSize: 13, color: '#28407A', lineHeight: 1.5 }}>
                    <b>O que é o caixa?</b> É o dinheiro que você tem de verdade: tudo que <b>entrou</b> de vendas menos tudo que <b>saiu</b> de despesas, desde o começo. Ele <b>não zera</b> quando vira o mês.
                </div>
            </Card>

            {/* Composição do saldo */}
            <Card style={{ marginBottom: 14 }}>
                {[['Saldo inicial (abertura)', fmt(data.saldoInicial), C.inkSoft], ['Tudo que entrou (vendas)', '+ ' + fmt(entradasTotais), C.volt], ['Tudo que saiu (despesas)', '− ' + fmt(saidasTotais), C.red]].map(([l, v, col]: any) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '7px 0', borderBottom: `1px solid ${C.line}` }}>
                        <span style={{ color: C.inkSoft }}>{l}</span><span style={{ fontWeight: 600, color: col }}>{v}</span>
                    </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, paddingTop: 9 }}>
                    <span style={{ fontWeight: 700, color: C.ink }}>Caixa hoje</span><span style={{ fontWeight: 700, color: saldo >= 0 ? C.voltDark : C.red }}>{fmt(saldo)}</span>
                </div>
            </Card>

            {/* Movimento do mês (separado, não é o saldo) */}
            <Card style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: C.inkSoft, fontWeight: 600, marginBottom: 8 }}>Movimento deste mês</div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 11.5, color: C.inkSoft }}>Entrou</div><div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 700, color: C.volt }}>{fmt(entradasMes)}</div></div>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 11.5, color: C.inkSoft }}>Saiu</div><div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 700, color: C.red }}>{fmt(saidasMes)}</div></div>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 11.5, color: C.inkSoft }}>Resultado</div><div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, fontWeight: 700, color: resultadoMes >= 0 ? C.volt : C.red }}>{fmt(resultadoMes)}</div></div>
                </div>
            </Card>

            <Btn onClick={() => setModal({ type: 'despesa' })} kind="dark" style={{ marginBottom: 14 }}>+ Lançar despesa</Btn>
            {despesasMes.length === 0 && <Card style={{ marginBottom: 14 }}><span style={{ fontSize: 13.5, color: C.inkSoft }}>Nenhuma despesa neste mês. Toda saída de dinheiro (frete, peça, anúncio) tem que ser lançada aqui pra bater com o banco.</span></Card>}
            {despesasMes.map((d: Despesa) => (
                <Card key={d.id} style={{ marginBottom: 8, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div><div style={{ fontWeight: 600, fontSize: 14.5, color: C.ink }}>{d.desc}</div><div style={{ fontSize: 12.5, color: C.inkSoft }}>{new Date(d.data + 'T12:00').toLocaleDateString('pt-BR')}</div></div>
                        <div style={{ fontWeight: 700, color: C.red }}>− {fmt(d.valor)}</div>
                    </div>
                    <RowActions onEdit={() => setModal({ type: 'despesa', edit: d })} onDelete={() => delDespesa(d.id)} delMsg={`Excluir a despesa "${d.desc}"?`} />
                </Card>
            ))}

            {/* Histórico por mês */}
            {meses.length > 0 && (
                <Card style={{ marginTop: 4 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: C.ink }}>Histórico por mês</div>
                    {meses.map((k) => {
                        const [y, m] = k.split('-');
                        const nome = new Date(Number(y), Number(m) - 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
                        const res = hist[k].e - hist[k].s;
                        return (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${C.line}` }}>
                                <span style={{ fontSize: 13.5, color: C.ink, textTransform: 'capitalize' }}>{nome}</span>
                                <span style={{ fontSize: 12.5, color: C.inkSoft }}>+{fmt(hist[k].e)} · −{fmt(hist[k].s)} · <b style={{ color: res >= 0 ? C.volt : C.red }}>{fmt(res)}</b></span>
                            </div>
                        );
                    })}
                </Card>
            )}
        </div>
    );
}

// ---------- Formulários ----------
function FormScooter({ edit, onSubmit, close }: any) {
    const [f, setF] = useState(edit
        ? { modelo: edit.modelo, custo: String(edit.custo), preco: String(edit.preco), qtd: String(edit.qtd) }
        : { modelo: '', custo: '', preco: '', qtd: '1' });
    return (
        <div>
            <Field label="Modelo"><input style={inputStyle} value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} placeholder="Ex.: Scooter X-1000 800W" /></Field>
            <Field label="Custo de compra (R$)"><input style={inputStyle} type="number" inputMode="numeric" value={f.custo} onChange={(e) => setF({ ...f, custo: e.target.value })} /></Field>
            <Field label="Preço de venda (R$)"><input style={inputStyle} type="number" inputMode="numeric" value={f.preco} onChange={(e) => setF({ ...f, preco: e.target.value })} /></Field>
            <Field label="Quantidade em estoque"><input style={inputStyle} type="number" inputMode="numeric" value={f.qtd} onChange={(e) => setF({ ...f, qtd: e.target.value })} /></Field>
            <SubmitBtn disabled={!f.modelo || !f.preco} onClick={async () => { await onSubmit({ modelo: f.modelo, custo: +f.custo || 0, preco: +f.preco || 0, qtd: +f.qtd || 0 }); close(); }}>{edit ? 'Salvar alterações' : 'Salvar modelo'}</SubmitBtn>
        </div>
    );
}

function FormVenda({ data, edit, onSubmit, close }: any) {
    const disponiveis = data.scooters.filter((s: Scooter) => s.qtd > 0);
    const [f, setF] = useState(edit
        ? { scooterId: '', cliente: edit.cliente, valor: String(edit.valor), pagamento: edit.pagamento || 'Pix', data: edit.data }
        : { scooterId: disponiveis[0]?.id || '', cliente: '', valor: '', pagamento: 'Pix', data: hoje() });
    const sel = data.scooters.find((s: Scooter) => s.id === f.scooterId);
    useEffect(() => { if (!edit && sel && !f.valor) setF((p) => ({ ...p, valor: String(sel.preco) })); }, [f.scooterId]); // eslint-disable-line
    const podeSalvar = edit ? (f.cliente && f.valor) : (sel && f.cliente && f.valor);
    return (
        <div>
            {edit ? (
                <div style={{ fontSize: 14, color: C.ink, background: '#F0F3F2', borderRadius: 10, padding: '10px 14px', marginBottom: 14 }}>
                    Modelo vendido: <b>{edit.modelo}</b> <span style={{ color: C.inkSoft }}>(o estoque não é alterado ao editar)</span>
                </div>
            ) : (
                <Field label="Modelo vendido">
                    <select style={inputStyle} value={f.scooterId} onChange={(e) => setF({ ...f, scooterId: e.target.value, valor: '' })}>
                        {disponiveis.map((s: Scooter) => <option key={s.id} value={s.id}>{s.modelo} ({s.qtd} disp.)</option>)}
                    </select>
                </Field>
            )}
            <Field label="Cliente"><input style={inputStyle} value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value })} placeholder="Nome do cliente" /></Field>
            <Field label="Valor da venda (R$)"><input style={inputStyle} type="number" inputMode="numeric" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></Field>
            <Field label="Pagamento">
                <select style={inputStyle} value={f.pagamento} onChange={(e) => setF({ ...f, pagamento: e.target.value })}>
                    {['Pix', 'Dinheiro', 'Cartão', 'Parcelado', 'Financiamento'].map((p) => <option key={p}>{p}</option>)}
                </select>
            </Field>
            <Field label="Data"><input style={inputStyle} type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></Field>
            {!edit && sel && f.valor && <div style={{ fontSize: 14, color: C.voltDark, background: '#E8F9F3', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontWeight: 600 }}>Lucro estimado: {fmt((+f.valor || 0) - sel.custo)}</div>}
            <SubmitBtn disabled={!podeSalvar} onClick={async () => {
                if (edit) await onSubmit({ cliente: f.cliente, valor: +f.valor, pagamento: f.pagamento, data: f.data });
                else await onSubmit({ scooterId: f.scooterId, cliente: f.cliente, valor: +f.valor, pagamento: f.pagamento, data: f.data });
                close();
            }}>{edit ? 'Salvar alterações' : 'Registrar venda'}</SubmitBtn>
        </div>
    );
}

function FormCliente({ edit, onSubmit, close }: any) {
    const [f, setF] = useState(edit
        ? { nome: edit.nome, whats: edit.whats || '', interesse: edit.interesse || '' }
        : { nome: '', whats: '', interesse: '' });
    return (
        <div>
            <Field label="Nome"><input style={inputStyle} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Field>
            <Field label="WhatsApp (DDD + número)"><input style={inputStyle} inputMode="tel" value={f.whats} onChange={(e) => setF({ ...f, whats: e.target.value })} placeholder="47999998888" /></Field>
            <Field label="Interesse"><input style={inputStyle} value={f.interesse} onChange={(e) => setF({ ...f, interesse: e.target.value })} placeholder="Ex.: modelo 800W, cor preta" /></Field>
            <SubmitBtn disabled={!f.nome} onClick={async () => { await onSubmit(f); close(); }}>{edit ? 'Salvar alterações' : 'Salvar cliente'}</SubmitBtn>
        </div>
    );
}

function FormDespesa({ edit, onSubmit, close }: any) {
    const [f, setF] = useState(edit
        ? { desc: edit.desc, valor: String(edit.valor), data: edit.data }
        : { desc: '', valor: '', data: hoje() });
    return (
        <div>
            <Field label="Descrição"><input style={inputStyle} value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} placeholder="Ex.: frete, anúncio, contador" /></Field>
            <Field label="Valor (R$)"><input style={inputStyle} type="number" inputMode="numeric" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></Field>
            <Field label="Data"><input style={inputStyle} type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></Field>
            <SubmitBtn disabled={!f.desc || !f.valor} onClick={async () => { await onSubmit({ desc: f.desc, valor: +f.valor, data: f.data }); close(); }}>{edit ? 'Salvar alterações' : 'Lançar despesa'}</SubmitBtn>
        </div>
    );
}

function FormMeta({ data, setMeta, close }: any) {
    const [v, setV] = useState(String(data.meta));
    return (
        <div>
            <Field label="Meta de faturamento mensal (R$)"><input style={inputStyle} type="number" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} /></Field>
            <SubmitBtn onClick={async () => { await setMeta(+v || 0); close(); }}>Salvar meta</SubmitBtn>
        </div>
    );
}

// Conferir com o banco: Renato digita quanto tem na conta → app ajusta o saldo
// inicial pra o caixa bater exatamente. Ensina ele a reconciliar com o banco.
function FormSaldoBanco({ data, setSaldoInicial, close }: any) {
    const entradas = somaVendas(data);
    const saidas = somaDespesas(data);
    const saldoApp = data.saldoInicial + entradas - saidas;
    const [v, setV] = useState(String(Math.round(saldoApp)));
    const banco = +v || 0;
    const novoInicial = banco - (entradas - saidas);
    return (
        <div>
            <div style={{ fontSize: 13.5, color: C.ink, background: '#EEF3FF', border: '1px solid #D6E0FB', borderRadius: 10, padding: '12px 14px', marginBottom: 14, lineHeight: 1.5 }}>
                O app está mostrando <b>{fmt(saldoApp)}</b> no caixa. Abra o seu banco e veja quanto tem <b>de verdade</b>. Se for diferente, digita o valor certo aqui embaixo que eu faço o caixa bater.
            </div>
            <Field label="Quanto tem hoje na sua conta (R$)"><input style={inputStyle} type="number" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} /></Field>
            {banco !== Math.round(saldoApp) && (
                <div style={{ fontSize: 13, color: C.inkSoft, marginBottom: 14 }}>Diferença de <b style={{ color: C.amber }}>{fmt(Math.abs(banco - saldoApp))}</b> — provavelmente uma venda ou despesa que faltou lançar. Confere depois!</div>
            )}
            <SubmitBtn onClick={async () => { await setSaldoInicial(novoInicial); close(); }}>Fazer o caixa bater com o banco</SubmitBtn>
        </div>
    );
}

function FormMetaLoja({ data, setMetaLoja, close }: any) {
    const [v, setV] = useState(String(data.metaLoja));
    return (
        <div>
            <div style={{ fontSize: 13.5, color: C.ink, background: '#E8F9F3', border: '1px solid #BFead9', borderRadius: 10, padding: '12px 14px', marginBottom: 14, lineHeight: 1.5 }}>
                Esse é o seu grande objetivo: quanto você quer <b>juntar no caixa</b> pra abrir a sua loja física. O app vai te mostrar o quanto falta a cada venda.
            </div>
            <Field label="Meta pra abrir a loja (R$)"><input style={inputStyle} type="number" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} /></Field>
            <SubmitBtn onClick={async () => { await setMetaLoja(+v || 0); close(); }}>Salvar meta da loja</SubmitBtn>
        </div>
    );
}

// ---------- App ----------
const TABS = [
    { id: 'inicio', label: 'Início', icon: '◉' }, { id: 'estoque', label: 'Estoque', icon: '▤' },
    { id: 'vendas', label: 'Vendas', icon: '⚡' }, { id: 'clientes', label: 'Clientes', icon: '☺' }, { id: 'caixa', label: 'Caixa', icon: '◫' },
];

export default function ScootersApp({ adminBadge = false }: { adminBadge?: boolean }) {
    const [data, setData] = useState<Data | null>(null);
    const [tab, setTab] = useState('inicio');
    const [modal, setModal] = useState<any>(null);
    const [err, setErr] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const r = await fetch('/api/scooters', { cache: 'no-store' });
            const j = await r.json();
            if (!r.ok || !j.success) throw new Error(j?.error || `HTTP ${r.status}`);
            setData({ scooters: j.scooters, vendas: j.vendas, clientes: j.clientes, despesas: j.despesas, meta: j.meta, saldoInicial: j.saldoInicial ?? 0, metaLoja: j.metaLoja ?? 50000, isAdmin: j.isAdmin });
        } catch (e: any) { setErr(e?.message || 'erro'); }
    }, []);

    useEffect(() => {
        const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = fontLink; document.head.appendChild(l);
        load();
    }, [load]);

    // Ações → API → recarrega
    const call = async (url: string, method: string, body?: any) => {
        await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
        await load();
    };
    const addModel = (b: any) => call('/api/scooters/models', 'POST', b);
    const editModel = (id: string, b: any) => call(`/api/scooters/models/${id}`, 'PATCH', b);
    const incModel = (id: string, delta: number) => call(`/api/scooters/models/${id}`, 'PATCH', { qtd_delta: delta });
    const delModel = (id: string) => call(`/api/scooters/models/${id}`, 'DELETE');
    const addVenda = (b: any) => call('/api/scooters/vendas', 'POST', b);
    const editVenda = (id: string, b: any) => call(`/api/scooters/vendas/${id}`, 'PATCH', b);
    const delVenda = (id: string) => call(`/api/scooters/vendas/${id}`, 'DELETE');
    const addCliente = (b: any) => call('/api/scooters/clientes', 'POST', b);
    const editCliente = (id: string, b: any) => call(`/api/scooters/clientes/${id}`, 'PATCH', b);
    const setClienteStatus = (id: string, status: string) => call(`/api/scooters/clientes/${id}`, 'PATCH', { status });
    const delCliente = (id: string) => call(`/api/scooters/clientes/${id}`, 'DELETE');
    const addDespesa = (b: any) => call('/api/scooters/despesas', 'POST', b);
    const editDespesa = (id: string, b: any) => call(`/api/scooters/despesas/${id}`, 'PATCH', b);
    const delDespesa = (id: string) => call(`/api/scooters/despesas/${id}`, 'DELETE');
    const setMeta = (meta: number) => call('/api/scooters/config', 'PATCH', { meta });
    const setSaldoInicial = (saldo_inicial: number) => call('/api/scooters/config', 'PATCH', { saldo_inicial });
    const setMetaLoja = (meta_loja: number) => call('/api/scooters/config', 'PATCH', { meta_loja });

    const logout = async () => {
        if (!confirm('Sair da conta?')) return;
        try { await createClient().auth.signOut(); } catch { /* segue pro login mesmo assim */ }
        window.location.href = '/login';
    };

    if (!data) {
        return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, fontFamily: "'Inter', sans-serif", color: C.inkSoft }}>{err ? `Erro: ${err}` : 'Carregando…'}</div>;
    }

    const titles: any = { inicio: 'Painel', estoque: 'Estoque', vendas: 'Vendas', clientes: 'Clientes', caixa: 'Caixa' };
    const isEdit = !!modal?.edit;
    const modalTitles: any = {
        scooter: isEdit ? 'Editar modelo' : 'Novo modelo',
        venda: isEdit ? 'Editar venda' : 'Registrar venda',
        cliente: isEdit ? 'Editar cliente' : 'Novo cliente',
        despesa: isEdit ? 'Editar despesa' : 'Lançar despesa',
        meta: 'Meta mensal',
        saldoBanco: 'Conferir com o banco',
        metaLoja: 'Meta da loja física',
    };

    return (
        <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter', sans-serif" }}>
            <div style={{ maxWidth: 480, margin: '0 auto', padding: '18px 16px 96px' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div>
                        <div style={{ fontSize: 12, letterSpacing: 1.5, fontWeight: 700, color: C.volt, textTransform: 'uppercase' }}>RG Scooters {adminBadge && '· admin'}</div>
                        <h1 style={{ margin: '2px 0 0', fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, color: C.ink }}>{titles[tab]}</h1>
                    </div>
                    {!adminBadge && (
                        <button onClick={logout} style={{ border: `1px solid ${C.line}`, background: C.surface, color: C.inkSoft, borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            ⏻ Sair
                        </button>
                    )}
                </header>

                {tab === 'inicio' && <Dashboard data={data} setModal={setModal} />}
                {tab === 'estoque' && <Estoque data={data} setModal={setModal} incModel={incModel} delModel={delModel} />}
                {tab === 'vendas' && <Vendas data={data} setModal={setModal} delVenda={delVenda} />}
                {tab === 'clientes' && <Clientes data={data} setModal={setModal} setClienteStatus={setClienteStatus} delCliente={delCliente} />}
                {tab === 'caixa' && <Caixa data={data} setModal={setModal} delDespesa={delDespesa} />}
            </div>

            <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: C.surface, borderTop: `1px solid ${C.line}`, display: 'flex', justifyContent: 'center', zIndex: 40 }}>
                <div style={{ display: 'flex', width: '100%', maxWidth: 480 }}>
                    {TABS.map((t) => (
                        <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, border: 'none', background: 'transparent', padding: '10px 0 14px', cursor: 'pointer', color: tab === t.id ? C.voltDark : C.inkSoft, fontWeight: tab === t.id ? 700 : 500 }}>
                            <div style={{ fontSize: 18 }}>{t.icon}</div>
                            <div style={{ fontSize: 11, marginTop: 2 }}>{t.label}</div>
                        </button>
                    ))}
                </div>
            </nav>

            {modal && (
                <Sheet title={modalTitles[modal.type]} onClose={() => setModal(null)}>
                    {modal.type === 'scooter' && <FormScooter edit={modal.edit} onSubmit={(b: any) => (modal.edit ? editModel(modal.edit.id, b) : addModel(b))} close={() => setModal(null)} />}
                    {modal.type === 'venda' && <FormVenda data={data} edit={modal.edit} onSubmit={(b: any) => (modal.edit ? editVenda(modal.edit.id, b) : addVenda(b))} close={() => setModal(null)} />}
                    {modal.type === 'cliente' && <FormCliente edit={modal.edit} onSubmit={(b: any) => (modal.edit ? editCliente(modal.edit.id, b) : addCliente(b))} close={() => setModal(null)} />}
                    {modal.type === 'despesa' && <FormDespesa edit={modal.edit} onSubmit={(b: any) => (modal.edit ? editDespesa(modal.edit.id, b) : addDespesa(b))} close={() => setModal(null)} />}
                    {modal.type === 'meta' && <FormMeta data={data} setMeta={setMeta} close={() => setModal(null)} />}
                    {modal.type === 'saldoBanco' && <FormSaldoBanco data={data} setSaldoInicial={setSaldoInicial} close={() => setModal(null)} />}
                    {modal.type === 'metaLoja' && <FormMetaLoja data={data} setMetaLoja={setMetaLoja} close={() => setModal(null)} />}
                </Sheet>
            )}
        </div>
    );
}
