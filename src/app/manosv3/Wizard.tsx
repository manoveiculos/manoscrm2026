'use client';

// Assistente de lançamento: sobe o contrato, lê o PDF e faz as perguntas-chave (quem pagou, quem recebe,
// comissão, imposto...) antes de gravar. Nada é salvo sem o resumo conferido pelo sócio.

import React, { useMemo, useState } from 'react';
import { FileUp, Plus, Trash2, X } from 'lucide-react';
import {
    CURTO, FORMAS, FORMA_TROCA, LADOS, NOME_LADO, brl, calcularNegocio, centavosParaTexto, reaisParaCentavos,
    type Lado, type Movimento, type MovimentoNovo, type Negocio,
} from '@/lib/manosv3';

type Tipo = 'compra' | 'venda';
interface Linha { quem: Lado; valor: string; forma: string; status: 'pago' | 'pendente'; data: string; vencimento: string; descricao: string }

const hoje = () => new Date().toISOString().slice(0, 10);
const novaLinha = (quem: Lado, valor = '', status: 'pago' | 'pendente' = 'pago'): Linha => ({ quem, valor, forma: 'pix', status, data: hoje(), vencimento: '', descricao: '' });
const campo = 'w-full border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 rounded-md px-2.5 py-1.5 text-sm';
const num = 'tabular-nums';

interface Props { negocios: Negocio[]; movimentos: Movimento[]; onClose: () => void; onSalvo: () => void }

export default function Wizard({ negocios, movimentos, onClose, onSalvo }: Props) {
    const [tipo, setTipo] = useState<Tipo>('compra');
    const [contrato, setContrato] = useState<{ path: string; nome: string } | null>(null);
    const [lendo, setLendo] = useState(false);
    const [aviso, setAviso] = useState<string | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [salvando, setSalvando] = useState(false);

    // dados comuns
    const [loja, setLoja] = useState<Lado>('manos'); // compra: quem comprou | venda: quem vendeu
    const [parte, setParte] = useState('');          // fornecedor | comprador
    const [data, setData] = useState(hoje());
    const [total, setTotal] = useState('');
    // veículo (compra)
    const [veiculo, setVeiculo] = useState(''); const [placa, setPlaca] = useState(''); const [chassi, setChassi] = useState('');
    const [ano, setAno] = useState(''); const [km, setKm] = useState(''); const [cor, setCor] = useState('');
    // venda
    const [negocioId, setNegocioId] = useState('');
    // linhas
    const [pagamentos, setPagamentos] = useState<Linha[]>([novaLinha('manos')]);   // compra: quem pagou | venda: quem recebeu
    const [custos, setCustos] = useState<Linha[]>([]);
    const [comissao, setComissao] = useState({ valor: '', quem: 'manos' as Lado, benef: '', status: 'pago' as 'pago' | 'pendente' });
    const [imposto, setImposto] = useState({ valor: '', quem: 'manos' as Lado, status: 'pago' as 'pago' | 'pendente' });

    const abertos = negocios.filter((n) => n.status === 'estoque' && !n.venda_registrada_em);
    const negocio = negocios.find((n) => n.id === negocioId) || null;

    async function lerContrato(file: File) {
        setLendo(true); setErro(null); setAviso(null);
        try {
            const fd = new FormData(); fd.append('file', file);
            const res = await fetch('/api/manosv3/contrato', { method: 'POST', body: fd });
            const j = await res.json();
            if (!j.success) { setErro(j.error || 'Erro ao enviar o contrato.'); return; }
            setContrato({ path: j.path, nome: j.nome });
            const p = j.parsed;
            // mostra tudo que o leitor não conseguiu identificar (antes isso ficava escondido)
            setAviso([j.aviso, ...((p?.alertas as string[]) || [])].filter(Boolean).join('\n') || null);
            if (!p) return;
            const t: Tipo = p.tipo === 'venda' ? 'venda' : 'compra';
            setTipo(t);
            const l: Lado = p.lojaDetectada === 'v3' ? 'v3' : 'manos';
            setLoja(l);
            if (p.nomeParteInversa) setParte(p.nomeParteInversa);
            if (p.dataContrato) setData(p.dataContrato);
            const totalReais = Number(p.valorTotal || 0);
            if (totalReais > 0) setTotal(centavosParaTexto(Math.round(totalReais * 100)));
            setPlaca(p.placa || ''); setChassi(p.chassi || ''); setCor(p.cor || '');
            setVeiculo(p.marcaModelo || [p.marca, p.modelo].filter(Boolean).join(' '));
            setAno(p.anoModelo ? String(p.anoModelo) : ''); setKm(p.km ? String(p.km) : '');
            if (t === 'venda') {
                const placaLimpa = String(p.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
                const achado = abertos.find((n) => n.placa && n.placa === placaLimpa);
                setNegocioId(achado?.id || '');
                const linhas: Linha[] = [];
                if (Number(p.valorEntradaMoeda) > 0) linhas.push(novaLinha(l, centavosParaTexto(Math.round(p.valorEntradaMoeda * 100))));
                if (Number(p.valorTroca) > 0) linhas.push({ ...novaLinha(l, centavosParaTexto(Math.round(p.valorTroca * 100))), forma: FORMA_TROCA, descricao: `Carro de troca ${p.trocaModelo || ''} ${p.trocaPlaca || ''}`.trim() });
                if (Number(p.saldo) > 0) linhas.push({ ...novaLinha(l, centavosParaTexto(Math.round(p.saldo * 100)), 'pendente'), forma: 'financiamento' });
                setPagamentos(linhas.length ? linhas : [novaLinha(l, totalReais > 0 ? centavosParaTexto(Math.round(totalReais * 100)) : '')]);
                setComissao((c) => ({ ...c, quem: l, benef: p.vendedorCaptador || '' }));
                setImposto((i) => ({ ...i, quem: l }));
            } else {
                setPagamentos([novaLinha(l, totalReais > 0 ? centavosParaTexto(Math.round(totalReais * 100)) : '')]);
            }
        } catch (e: any) {
            setErro(e?.message || 'Falha de rede.');
        } finally {
            setLendo(false);
        }
    }

    const totalC = reaisParaCentavos(total);
    const somaPag = pagamentos.reduce((s, l) => s + reaisParaCentavos(l.valor), 0);
    const falta = totalC - somaPag;

    // Movimentos que serão gravados (também alimentam o resumo ao vivo).
    const movs: MovimentoNovo[] = useMemo(() => {
        const out: MovimentoNovo[] = [];
        const desc = (s: string) => s || undefined;
        if (tipo === 'compra') {
            for (const l of pagamentos) { const v = reaisParaCentavos(l.valor); if (v) out.push({ tipo: 'compra', de_lado: l.quem, para_lado: 'externo', valor_centavos: v, status: l.status, data: l.data || hoje(), vencimento: l.vencimento || null, forma: l.forma, descricao: desc(l.descricao) || `Compra ${veiculo}` }); }
            for (const l of custos) { const v = reaisParaCentavos(l.valor); if (v) out.push({ tipo: 'custo', de_lado: l.quem, para_lado: 'externo', valor_centavos: v, status: l.status, data: l.data || hoje(), vencimento: l.vencimento || null, forma: l.forma, descricao: desc(l.descricao) || 'Custo' }); }
        } else {
            for (const l of pagamentos) { const v = reaisParaCentavos(l.valor); if (v) out.push({ tipo: 'venda', de_lado: 'externo', para_lado: l.quem, valor_centavos: v, status: l.status, data: l.data || hoje(), vencimento: l.vencimento || null, forma: l.forma, descricao: desc(l.descricao) || `Venda para ${parte || 'cliente'}` }); }
            const cv = reaisParaCentavos(comissao.valor);
            if (cv) out.push({ tipo: 'comissao', de_lado: comissao.quem, para_lado: 'externo', valor_centavos: cv, status: comissao.status, data: hoje(), descricao: `Comissão${comissao.benef ? ' - ' + comissao.benef : ''}` });
            const iv = reaisParaCentavos(imposto.valor);
            if (iv) out.push({ tipo: 'imposto', de_lado: imposto.quem, para_lado: 'externo', valor_centavos: iv, status: imposto.status, data: hoje(), descricao: 'Imposto / NF' });
            for (const l of custos) { const v = reaisParaCentavos(l.valor); if (v) out.push({ tipo: 'custo', de_lado: l.quem, para_lado: 'externo', valor_centavos: v, status: l.status, data: l.data || hoje(), vencimento: l.vencimento || null, forma: l.forma, descricao: desc(l.descricao) || 'Custo' }); }
        }
        return out;
    }, [tipo, pagamentos, custos, comissao, imposto, veiculo, parte]);

    // Resumo ao vivo: negócio (existente ou novo) + movimentos novos.
    const resumo = useMemo(() => {
        const base: Negocio = negocio ?? ({
            id: 'novo', status: 'estoque', compra_loja: loja, compra_valor_centavos: totalC, venda_loja: null, veiculo,
        } as unknown as Negocio);
        const fakes = [
            ...(negocio ? movimentos.filter((m) => m.negocio_id === negocio.id) : []),
            ...movs.map((m, i) => ({ ...m, id: `n${i}`, negocio_id: base.id, created_at: '', criado_por: null, pago_em: null, pago_por: null, forma: m.forma ?? null, descricao: m.descricao ?? null, vencimento: m.vencimento ?? null, estornado_em: null, estornado_por: null }) as Movimento),
        ];
        return calcularNegocio({ ...base, status: tipo === 'venda' ? 'vendido' : 'estoque' }, fakes);
    }, [negocio, movs, movimentos, loja, totalC, veiculo, tipo]);

    async function salvar() {
        setErro(null);
        if (totalC <= 0) return setErro('Informe o valor total do contrato.');
        if (falta !== 0) return setErro(tipo === 'compra'
            ? `Os pagamentos somam ${brl(somaPag)} e o contrato é ${brl(totalC)}. ${falta > 0 ? `Falta ${brl(falta)}: adicione quem vai pagar (como pendente).` : `Sobram ${brl(-falta)}: ajuste os valores.`}`
            : `Os recebimentos somam ${brl(somaPag)} e a venda é ${brl(totalC)}. ${falta > 0 ? `Falta ${brl(falta)}: informe quem vai receber (pendente, financiamento ou troca).` : `Sobram ${brl(-falta)}: ajuste.`}`);
        if (tipo === 'compra' && !veiculo.trim()) return setErro('Informe o veículo.');
        if (tipo === 'venda' && !negocio) return setErro('Escolha o carro vendido. Se ele não está na lista, lance antes o contrato de COMPRA.');
        setSalvando(true);
        try {
            const body = tipo === 'compra'
                ? { acao: 'criar_negocio', negocio: { veiculo, placa, chassi, ano_modelo: ano, km, cor, compra_loja: loja, compra_data: data, compra_valor_centavos: totalC, compra_parte: parte, compra_contrato_path: contrato?.path }, movimentos: movs }
                : { acao: 'registrar_venda', negocio_id: negocio!.id, venda: { venda_loja: loja, venda_data: data, venda_valor_centavos: totalC, venda_parte: parte, venda_contrato_path: contrato?.path, comissao_beneficiario: comissao.benef }, movimentos: movs };
            const res = await fetch('/api/manosv3', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            const j = await res.json();
            if (!j.success) return setErro(j.error || 'Erro ao salvar.');
            onSalvo();
        } catch (e: any) {
            setErro(e?.message || 'Falha de rede.');
        } finally {
            setSalvando(false);
        }
    }

    return (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center p-3 overflow-y-auto" onClick={onClose}>
            <div onClick={(e) => e.stopPropagation()} className="bg-white text-slate-900 border border-slate-200 rounded-xl w-full max-w-3xl my-4 p-5 space-y-5 shadow-xl [color-scheme:light]">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Novo lançamento por contrato</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
                </div>

                <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-sm">
                    {(['compra', 'venda'] as Tipo[]).map((t) => (
                        <button key={t} onClick={() => setTipo(t)} className={`px-4 py-1.5 rounded-md ${tipo === t ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                            Contrato de {t}
                        </button>
                    ))}
                </div>

                <label className="flex items-center gap-3 border-2 border-dashed border-slate-300 rounded-lg p-4 cursor-pointer hover:bg-slate-50">
                    <FileUp className="w-5 h-5 text-slate-500" />
                    <div className="text-sm">
                        <div className="font-medium">{contrato ? `Contrato arquivado: ${contrato.nome}` : 'Subir o PDF do contrato'}</div>
                        <div className="text-xs text-slate-500">{lendo ? 'Lendo o contrato…' : 'O PDF fica guardado no arquivo e eu preencho o que conseguir ler. Confira tudo abaixo.'}</div>
                    </div>
                    <input type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && lerContrato(e.target.files[0])} />
                </label>
                {aviso && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2 whitespace-pre-line">{aviso}</p>}

                {tipo === 'venda' && (
                    <Q n={1} t="Qual carro foi vendido?">
                        <select value={negocioId} onChange={(e) => setNegocioId(e.target.value)} className={campo}>
                            <option value="">— escolha o carro em estoque —</option>
                            {abertos.map((n) => <option key={n.id} value={n.id}>{n.placa || 's/ placa'} · {n.veiculo} · comprado pela {CURTO[n.compra_loja]}</option>)}
                        </select>
                        {!negocio && <p className="text-xs text-amber-700">Não achou? Lance antes o contrato de compra desse carro.</p>}
                    </Q>
                )}

                {tipo === 'compra' && (
                    <Q n={1} t="Qual é o carro?">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            <input className={`${campo} col-span-2`} placeholder="Marca / modelo" value={veiculo} onChange={(e) => setVeiculo(e.target.value)} />
                            <input className={campo} placeholder="Placa" value={placa} onChange={(e) => setPlaca(e.target.value.toUpperCase())} />
                            <input className={campo} placeholder="Chassi" value={chassi} onChange={(e) => setChassi(e.target.value)} />
                            <input className={campo} placeholder="Ano/modelo" value={ano} onChange={(e) => setAno(e.target.value)} />
                            <input className={campo} placeholder="KM" value={km} onChange={(e) => setKm(e.target.value)} />
                            <input className={campo} placeholder="Cor" value={cor} onChange={(e) => setCor(e.target.value)} />
                        </div>
                    </Q>
                )}

                <Q n={2} t={tipo === 'compra' ? 'Qual empresa assinou a compra, de quem e por quanto?' : 'Qual empresa vendeu, para quem e por quanto?'}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                        <label className="text-xs text-slate-500">{tipo === 'compra' ? 'Empresa que comprou' : 'Empresa que vendeu'}
                            <select value={loja} onChange={(e) => { setLoja(e.target.value as Lado); }} className={campo}>
                                {LADOS.map((l) => <option key={l} value={l}>{NOME_LADO[l]}</option>)}
                            </select>
                        </label>
                        <label className="text-xs text-slate-500">{tipo === 'compra' ? 'Fornecedor' : 'Comprador'}
                            <input className={campo} value={parte} onChange={(e) => setParte(e.target.value)} />
                        </label>
                        <label className="text-xs text-slate-500">Data do contrato
                            <input type="date" className={campo} value={data} onChange={(e) => setData(e.target.value)} />
                        </label>
                        <label className="text-xs text-slate-500">Valor total (R$)
                            <input className={`${campo} ${num}`} inputMode="decimal" placeholder="0,00" value={total} onChange={(e) => setTotal(e.target.value)} />
                        </label>
                    </div>
                </Q>

                <Q n={3} t={tipo === 'compra' ? 'Quem pagou (ou vai pagar) este carro? Tudo é 50/50: quem pagar mais que a metade é reembolsado pela outra.' : 'Quem recebeu (ou vai receber)? Entrada, parcelas, financiamento, carro de troca.'}>
                    <Linhas linhas={pagamentos} onChange={setPagamentos} rotuloQuem={tipo === 'compra' ? 'Pago por' : 'Entra no caixa de'} permitirTroca rotuloAdd={tipo === 'compra' ? 'Adicionar pagamento' : 'Adicionar recebimento'} padraoQuem={loja} />
                    <p className={`text-xs ${falta === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {falta === 0 ? 'Fechou: soma igual ao valor do contrato.' : falta > 0 ? `Falta ${brl(falta)} para fechar o valor do contrato.` : `Passou ${brl(-falta)} do valor do contrato.`}
                        {' '}Use “Pendente” para o que ainda não foi pago/recebido e “troca_veiculo” para carro dado na troca (não é dinheiro).
                    </p>
                </Q>

                {tipo === 'venda' && (
                    <>
                        <Q n={4} t="Houve comissão? Quem paga e para quem?">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
                                <label className="text-xs text-slate-500">Valor (R$)<input className={`${campo} ${num}`} value={comissao.valor} onChange={(e) => setComissao({ ...comissao, valor: e.target.value })} placeholder="0,00" /></label>
                                <label className="text-xs text-slate-500">Quem paga<select className={campo} value={comissao.quem} onChange={(e) => setComissao({ ...comissao, quem: e.target.value as Lado })}>{LADOS.map((l) => <option key={l} value={l}>{CURTO[l]}</option>)}</select></label>
                                <label className="text-xs text-slate-500">Vendedor / beneficiário<input className={campo} value={comissao.benef} onChange={(e) => setComissao({ ...comissao, benef: e.target.value })} /></label>
                                <label className="text-xs text-slate-500">Situação<select className={campo} value={comissao.status} onChange={(e) => setComissao({ ...comissao, status: e.target.value as any })}><option value="pago">Já pago</option><option value="pendente">A pagar</option></select></label>
                            </div>
                        </Q>
                        <Q n={5} t="Imposto / NF desta venda: quanto e quem paga?">
                            <div className="grid grid-cols-3 gap-2 items-end">
                                <label className="text-xs text-slate-500">Valor (R$)<input className={`${campo} ${num}`} value={imposto.valor} onChange={(e) => setImposto({ ...imposto, valor: e.target.value })} placeholder="0,00" /></label>
                                <label className="text-xs text-slate-500">Quem paga<select className={campo} value={imposto.quem} onChange={(e) => setImposto({ ...imposto, quem: e.target.value as Lado })}>{LADOS.map((l) => <option key={l} value={l}>{CURTO[l]}</option>)}</select></label>
                                <label className="text-xs text-slate-500">Situação<select className={campo} value={imposto.status} onChange={(e) => setImposto({ ...imposto, status: e.target.value as any })}><option value="pago">Já pago</option><option value="pendente">A pagar</option></select></label>
                            </div>
                        </Q>
                    </>
                )}

                <Q n={tipo === 'venda' ? 6 : 4} t={tipo === 'compra' ? 'Já teve gasto neste carro (oficina, vistoria, transferência, guincho)? Quem pagou?' : 'Algum gasto da venda (despachante, transferência)? Quem pagou?'}>
                    <Linhas linhas={custos} onChange={setCustos} rotuloQuem="Pago por" rotuloAdd="Adicionar gasto" comDescricao padraoQuem={loja} />
                </Q>

                <section className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-2 text-sm">
                    <h3 className="font-semibold">Resumo (tudo 50/50) — confira antes de salvar</h3>
                    <div className={`text-xs text-slate-600 ${num}`}>Custo total do carro até aqui: {brl(resumo.compra + resumo.custos + resumo.comissao + resumo.imposto)} → cada empresa arca com {brl(resumo.cota.manos)} (50%).</div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                        {(['manos', 'v3'] as Lado[]).map((l) => (
                            <div key={l}>
                                <div className="font-medium">{NOME_LADO[l]}</div>
                                <div className={`text-xs text-slate-600 ${num}`}>Pagou: {brl(resumo.investidoPago[l])} · vai pagar: {brl(resumo.investido[l] - resumo.investidoPago[l])}</div>
                                {tipo === 'venda' && <div className={`text-xs text-slate-600 ${num}`}>Recebeu da venda: {brl(resumo.recebidoPago[l])} · a receber: {brl(resumo.recebido[l] - resumo.recebidoPago[l])}</div>}
                            </div>
                        ))}
                    </div>
                    <div className={`border-t border-slate-200 pt-2 ${num}`}>
                        {tipo === 'venda' && <div>Lucro líquido: <b>{brl(resumo.lucro)}</b> → Manos {brl(resumo.parte.manos)} · V3 {brl(resumo.parte.v3)}</div>}
                        <div>{resumo.devedora && resumo.credora
                            ? <>Acerto: <b>{NOME_LADO[resumo.devedora]}</b> deve <b>{brl(resumo.valorAcerto)}</b> à <b>{NOME_LADO[resumo.credora]}</b> pelo que já foi pago.</>
                            : 'Acerto: as empresas estão quites neste carro.'}</div>
                    </div>
                </section>

                {erro && <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg p-3">{erro}</div>}
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-3 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-100">Cancelar</button>
                    <button onClick={salvar} disabled={salvando || lendo} className="px-4 py-2 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50">
                        {salvando ? 'Salvando…' : tipo === 'compra' ? 'Salvar compra' : 'Salvar venda'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function Q({ n, t, children }: { n: number; t: string; children: React.ReactNode }) {
    return (
        <section className="space-y-2">
            <h3 className="text-sm font-semibold"><span className="inline-flex w-5 h-5 mr-2 rounded-full bg-slate-900 text-white text-xs items-center justify-center">{n}</span>{t}</h3>
            {children}
        </section>
    );
}

function Linhas({ linhas, onChange, rotuloQuem, rotuloAdd, permitirTroca, comDescricao, padraoQuem }: {
    linhas: Linha[]; onChange: (l: Linha[]) => void; rotuloQuem: string; rotuloAdd: string; permitirTroca?: boolean; comDescricao?: boolean; padraoQuem: Lado;
}) {
    const set = (i: number, p: Partial<Linha>) => onChange(linhas.map((l, k) => (k === i ? { ...l, ...p } : l)));
    const formas = permitirTroca ? FORMAS : FORMAS.filter((f) => f !== FORMA_TROCA);
    return (
        <div className="space-y-2">
            {linhas.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                    <label className="col-span-3 md:col-span-2 text-[11px] text-slate-500">{rotuloQuem}
                        <select className={campo} value={l.quem} onChange={(e) => set(i, { quem: e.target.value as Lado })}>{LADOS.map((x) => <option key={x} value={x}>{CURTO[x]}</option>)}</select>
                    </label>
                    <label className="col-span-4 md:col-span-2 text-[11px] text-slate-500">Valor (R$)
                        <input className={`${campo} ${num}`} inputMode="decimal" value={l.valor} onChange={(e) => set(i, { valor: e.target.value })} placeholder="0,00" />
                    </label>
                    <label className="col-span-5 md:col-span-2 text-[11px] text-slate-500">Forma
                        <select className={campo} value={l.forma} onChange={(e) => set(i, { forma: e.target.value })}>{formas.map((f) => <option key={f}>{f}</option>)}</select>
                    </label>
                    <label className="col-span-4 md:col-span-2 text-[11px] text-slate-500">Situação
                        <select className={campo} value={l.status} onChange={(e) => set(i, { status: e.target.value as any })}><option value="pago">Pago</option><option value="pendente">Pendente</option></select>
                    </label>
                    <label className="col-span-5 md:col-span-3 text-[11px] text-slate-500">{l.status === 'pendente' ? 'Vencimento' : 'Data'}
                        <input type="date" className={campo} value={l.status === 'pendente' ? l.vencimento : l.data} onChange={(e) => set(i, l.status === 'pendente' ? { vencimento: e.target.value } : { data: e.target.value })} />
                    </label>
                    <button type="button" onClick={() => onChange(linhas.filter((_, k) => k !== i))} className="col-span-3 md:col-span-1 pb-2 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                    {(comDescricao || l.forma === FORMA_TROCA) && (
                        <input className={`${campo} col-span-12`} placeholder="Descrição (ex.: oficina - troca de embreagem / carro de troca)" value={l.descricao} onChange={(e) => set(i, { descricao: e.target.value })} />
                    )}
                </div>
            ))}
            <button type="button" onClick={() => onChange([...linhas, novaLinha(padraoQuem)])} className="inline-flex items-center gap-1 text-sm text-slate-700 hover:underline"><Plus className="w-4 h-4" />{rotuloAdd}</button>
        </div>
    );
}
