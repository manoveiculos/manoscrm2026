'use client';

/**
 * RG Scooters — porta fiel do gestor-scooters.jsx (arquivo original NÃO alterado),
 * trocando a persistência window.storage por Supabase via /api/scooters/*.
 * Mesmo design (tema claro próprio, 5 abas, folhas de baixo).
 */

import { useState, useEffect, useMemo, useCallback } from 'react';

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
interface Data { scooters: Scooter[]; vendas: Venda[]; clientes: Cliente[]; despesas: Despesa[]; meta: number; isAdmin: boolean; }

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
                            <Btn kind="danger" style={{ padding: '9px', width: 90 }} onClick={() => { if (confirm(`Excluir ${m.modelo}?`)) delModel(m.id); }}>Excluir</Btn>
                        </div>
                    </Card>
                );
            })}
        </div>
    );
}

function Vendas({ data, setModal }: any) {
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

function Clientes({ data, setModal, setClienteStatus }: any) {
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
                </Card>
            ))}
        </div>
    );
}

function Caixa({ data, setModal }: any) {
    const mk = monthKey();
    const receitas = data.vendas.filter((v: Venda) => monthKey(v.data) === mk).reduce((s: number, v: Venda) => s + v.valor, 0);
    const custos = data.vendas.filter((v: Venda) => monthKey(v.data) === mk).reduce((s: number, v: Venda) => s + v.custo, 0);
    const despesas = data.despesas.filter((d: Despesa) => monthKey(d.data) === mk);
    const totDespesas = despesas.reduce((s: number, d: Despesa) => s + d.valor, 0);
    const saldo = receitas - custos - totDespesas;

    return (
        <div>
            <Card style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 13, color: C.inkSoft, fontWeight: 600 }}>Resultado do mês</div>
                <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 32, fontWeight: 700, color: saldo >= 0 ? C.volt : C.red, margin: '4px 0 10px' }}>{fmt(saldo)}</div>
                {[['Receita de vendas', fmt(receitas), C.ink], ['Custo das scooters vendidas', '− ' + fmt(custos), C.inkSoft], ['Despesas operacionais', '− ' + fmt(totDespesas), C.inkSoft]].map(([l, v, col]: any) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '6px 0', borderTop: `1px solid ${C.line}` }}>
                        <span style={{ color: C.inkSoft }}>{l}</span><span style={{ fontWeight: 600, color: col }}>{v}</span>
                    </div>
                ))}
            </Card>
            <Btn onClick={() => setModal({ type: 'despesa' })} kind="dark" style={{ marginBottom: 14 }}>+ Lançar despesa</Btn>
            {despesas.map((d: Despesa) => (
                <Card key={d.id} style={{ marginBottom: 8, padding: 14, display: 'flex', justifyContent: 'space-between' }}>
                    <div><div style={{ fontWeight: 600, fontSize: 14.5, color: C.ink }}>{d.desc}</div><div style={{ fontSize: 12.5, color: C.inkSoft }}>{new Date(d.data + 'T12:00').toLocaleDateString('pt-BR')}</div></div>
                    <div style={{ fontWeight: 700, color: C.red }}>− {fmt(d.valor)}</div>
                </Card>
            ))}
        </div>
    );
}

// ---------- Formulários ----------
function FormScooter({ addModel, close }: any) {
    const [f, setF] = useState({ modelo: '', custo: '', preco: '', qtd: '1' });
    return (
        <div>
            <Field label="Modelo"><input style={inputStyle} value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} placeholder="Ex.: Scooter X-1000 800W" /></Field>
            <Field label="Custo de compra (R$)"><input style={inputStyle} type="number" inputMode="numeric" value={f.custo} onChange={(e) => setF({ ...f, custo: e.target.value })} /></Field>
            <Field label="Preço de venda (R$)"><input style={inputStyle} type="number" inputMode="numeric" value={f.preco} onChange={(e) => setF({ ...f, preco: e.target.value })} /></Field>
            <Field label="Quantidade em estoque"><input style={inputStyle} type="number" inputMode="numeric" value={f.qtd} onChange={(e) => setF({ ...f, qtd: e.target.value })} /></Field>
            <Btn disabled={!f.modelo || !f.preco} onClick={async () => { await addModel({ modelo: f.modelo, custo: +f.custo || 0, preco: +f.preco || 0, qtd: +f.qtd || 0 }); close(); }}>Salvar modelo</Btn>
        </div>
    );
}

function FormVenda({ data, addVenda, close }: any) {
    const disponiveis = data.scooters.filter((s: Scooter) => s.qtd > 0);
    const [f, setF] = useState({ scooterId: disponiveis[0]?.id || '', cliente: '', valor: '', pagamento: 'Pix', data: hoje() });
    const sel = data.scooters.find((s: Scooter) => s.id === f.scooterId);
    useEffect(() => { if (sel && !f.valor) setF((p) => ({ ...p, valor: String(sel.preco) })); }, [f.scooterId]); // eslint-disable-line
    return (
        <div>
            <Field label="Modelo vendido">
                <select style={inputStyle} value={f.scooterId} onChange={(e) => setF({ ...f, scooterId: e.target.value, valor: '' })}>
                    {disponiveis.map((s: Scooter) => <option key={s.id} value={s.id}>{s.modelo} ({s.qtd} disp.)</option>)}
                </select>
            </Field>
            <Field label="Cliente"><input style={inputStyle} value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value })} placeholder="Nome do cliente" /></Field>
            <Field label="Valor da venda (R$)"><input style={inputStyle} type="number" inputMode="numeric" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></Field>
            <Field label="Pagamento">
                <select style={inputStyle} value={f.pagamento} onChange={(e) => setF({ ...f, pagamento: e.target.value })}>
                    {['Pix', 'Dinheiro', 'Cartão', 'Parcelado', 'Financiamento'].map((p) => <option key={p}>{p}</option>)}
                </select>
            </Field>
            <Field label="Data"><input style={inputStyle} type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></Field>
            {sel && f.valor && <div style={{ fontSize: 14, color: C.voltDark, background: '#E8F9F3', borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontWeight: 600 }}>Lucro estimado: {fmt((+f.valor || 0) - sel.custo)}</div>}
            <Btn disabled={!sel || !f.cliente || !f.valor} onClick={async () => { await addVenda({ scooterId: f.scooterId, cliente: f.cliente, valor: +f.valor, pagamento: f.pagamento, data: f.data }); close(); }}>Registrar venda</Btn>
        </div>
    );
}

function FormCliente({ addCliente, close }: any) {
    const [f, setF] = useState({ nome: '', whats: '', interesse: '' });
    return (
        <div>
            <Field label="Nome"><input style={inputStyle} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Field>
            <Field label="WhatsApp (DDD + número)"><input style={inputStyle} inputMode="tel" value={f.whats} onChange={(e) => setF({ ...f, whats: e.target.value })} placeholder="47999998888" /></Field>
            <Field label="Interesse"><input style={inputStyle} value={f.interesse} onChange={(e) => setF({ ...f, interesse: e.target.value })} placeholder="Ex.: modelo 800W, cor preta" /></Field>
            <Btn disabled={!f.nome} onClick={async () => { await addCliente(f); close(); }}>Salvar cliente</Btn>
        </div>
    );
}

function FormDespesa({ addDespesa, close }: any) {
    const [f, setF] = useState({ desc: '', valor: '', data: hoje() });
    return (
        <div>
            <Field label="Descrição"><input style={inputStyle} value={f.desc} onChange={(e) => setF({ ...f, desc: e.target.value })} placeholder="Ex.: frete, anúncio, contador" /></Field>
            <Field label="Valor (R$)"><input style={inputStyle} type="number" inputMode="numeric" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></Field>
            <Field label="Data"><input style={inputStyle} type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></Field>
            <Btn disabled={!f.desc || !f.valor} onClick={async () => { await addDespesa({ desc: f.desc, valor: +f.valor, data: f.data }); close(); }}>Lançar despesa</Btn>
        </div>
    );
}

function FormMeta({ data, setMeta, close }: any) {
    const [v, setV] = useState(String(data.meta));
    return (
        <div>
            <Field label="Meta de faturamento mensal (R$)"><input style={inputStyle} type="number" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} /></Field>
            <Btn onClick={async () => { await setMeta(+v || 0); close(); }}>Salvar meta</Btn>
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
            setData({ scooters: j.scooters, vendas: j.vendas, clientes: j.clientes, despesas: j.despesas, meta: j.meta, isAdmin: j.isAdmin });
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
    const incModel = (id: string, delta: number) => call(`/api/scooters/models/${id}`, 'PATCH', { qtd_delta: delta });
    const delModel = (id: string) => call(`/api/scooters/models/${id}`, 'DELETE');
    const addVenda = (b: any) => call('/api/scooters/vendas', 'POST', b);
    const addCliente = (b: any) => call('/api/scooters/clientes', 'POST', b);
    const setClienteStatus = (id: string, status: string) => call(`/api/scooters/clientes/${id}`, 'PATCH', { status });
    const addDespesa = (b: any) => call('/api/scooters/despesas', 'POST', b);
    const setMeta = (meta: number) => call('/api/scooters/config', 'PATCH', { meta });

    if (!data) {
        return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, fontFamily: "'Inter', sans-serif", color: C.inkSoft }}>{err ? `Erro: ${err}` : 'Carregando…'}</div>;
    }

    const titles: any = { inicio: 'Painel', estoque: 'Estoque', vendas: 'Vendas', clientes: 'Clientes', caixa: 'Caixa' };
    const modalTitles: any = { scooter: 'Novo modelo', venda: 'Registrar venda', cliente: 'Novo cliente', despesa: 'Lançar despesa', meta: 'Meta mensal' };

    return (
        <div style={{ minHeight: '100vh', background: C.bg, fontFamily: "'Inter', sans-serif" }}>
            <div style={{ maxWidth: 480, margin: '0 auto', padding: '18px 16px 96px' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
                    <div>
                        <div style={{ fontSize: 12, letterSpacing: 1.5, fontWeight: 700, color: C.volt, textTransform: 'uppercase' }}>RG Scooters {adminBadge && '· admin'}</div>
                        <h1 style={{ margin: '2px 0 0', fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, color: C.ink }}>{titles[tab]}</h1>
                    </div>
                </header>

                {tab === 'inicio' && <Dashboard data={data} setModal={setModal} />}
                {tab === 'estoque' && <Estoque data={data} setModal={setModal} incModel={incModel} delModel={delModel} />}
                {tab === 'vendas' && <Vendas data={data} setModal={setModal} />}
                {tab === 'clientes' && <Clientes data={data} setModal={setModal} setClienteStatus={setClienteStatus} />}
                {tab === 'caixa' && <Caixa data={data} setModal={setModal} />}
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
                    {modal.type === 'scooter' && <FormScooter addModel={addModel} close={() => setModal(null)} />}
                    {modal.type === 'venda' && <FormVenda data={data} addVenda={addVenda} close={() => setModal(null)} />}
                    {modal.type === 'cliente' && <FormCliente addCliente={addCliente} close={() => setModal(null)} />}
                    {modal.type === 'despesa' && <FormDespesa addDespesa={addDespesa} close={() => setModal(null)} />}
                    {modal.type === 'meta' && <FormMeta data={data} setMeta={setMeta} close={() => setModal(null)} />}
                </Sheet>
            )}
        </div>
    );
}
