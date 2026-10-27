'use client';

import React, { useState, useMemo } from 'react';
import {
  X,
  Upload,
  FileText,
  Check,
  AlertCircle,
  ArrowUpRight,
  ArrowDownLeft,
  Trash2,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { FinConta, FinCategoria, DestinacaoGasto } from '@/lib/financeiro/types';

interface ItemExtratoParsed {
  id: string;
  selecionado: boolean;
  data: string; // YYYY-MM-DD
  descricao: string;
  valor: number;
  tipo: 'receita' | 'despesa';
  categoria_id: string | null;
  destinacao: DestinacaoGasto;
}

interface ModalImportarExtratoProps {
  aberto: boolean;
  onFechar: () => void;
  contas: FinConta[];
  categorias: FinCategoria[];
  ownerParam?: string;
  onImportadoComSucesso: () => void;
}

export function ModalImportarExtrato({
  aberto,
  onFechar,
  contas,
  categorias,
  ownerParam,
  onImportadoComSucesso,
}: ModalImportarExtratoProps) {
  const [contaId, setContaId] = useState<string>(contas[0]?.id || '');
  const [textoBruto, setTextoBruto] = useState('');
  const [itens, setItens] = useState<ItemExtratoParsed[]>([]);
  const [passo, setPasso] = useState<'colar' | 'revisar'>('colar');
  const [salvando, setSalvando] = useState(false);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  // Conta selecionada
  const contaSelecionada = useMemo(() => {
    return contas.find((c) => c.id === contaId) || contas[0];
  }, [contas, contaId]);

  if (!aberto) return null;

  // Função para adivinhar a categoria pelo nome
  function autoCategoria(desc: string, tipo: 'receita' | 'despesa'): string | null {
    const text = desc.toLowerCase();
    for (const cat of categorias) {
      if (cat.tipo === (tipo === 'receita' ? 'entrada' : 'saida')) {
        for (const kw of cat.palavras_chave || []) {
          if (text.includes(kw.toLowerCase())) {
            return cat.id;
          }
        }
      }
    }
    // Fallback por palavras comuns se não achou nas tags
    if (text.includes('posto') || text.includes('gasolina') || text.includes('combustivel')) {
      const match = categorias.find((c) => c.nome.toLowerCase().includes('combust'));
      if (match) return match.id;
    }
    if (text.includes('oficina') || text.includes('mecanic') || text.includes('peça') || text.includes('peca')) {
      const match = categorias.find((c) => c.nome.toLowerCase().includes('manuten'));
      if (match) return match.id;
    }
    if (text.includes('venda') || text.includes('comiss')) {
      const match = categorias.find((c) => c.nome.toLowerCase().includes('venda') || c.nome.toLowerCase().includes('comiss'));
      if (match) return match.id;
    }
    return null;
  }

  // Parser inteligente de extrato
  function processarTexto(texto: string) {
    if (!texto.trim()) {
      setMensagemErro('Cole o texto do extrato ou selecione um arquivo');
      return;
    }

    setMensagemErro(null);
    const linhas = texto.split(/\r?\n/);
    const parsed: ItemExtratoParsed[] = [];
    const hoje = new Date();
    const anoPadrao = hoje.getFullYear();

    linhas.forEach((linha, idx) => {
      const l = linha.trim();
      if (!l) return;

      // Pular cabeçalhos conhecidos
      if (
        l.toLowerCase().includes('saldo') ||
        l.toLowerCase().includes('data\t') ||
        l.toLowerCase().includes('extrato de conta') ||
        l.toLowerCase().includes('periodo:')
      ) {
        return;
      }

      // Regex para data: DD/MM/YYYY ou DD/MM ou DD MMM
      let dataStr = '';
      let linhaSemData = l;
      const dataMatch = l.match(/\b(\d{1,2})[\/\.-](\d{1,2})(?:[\/\.-](\d{2,4}))?\b/);

      if (dataMatch) {
        const dia = dataMatch[1].padStart(2, '0');
        const mes = dataMatch[2].padStart(2, '0');
        let ano = dataMatch[3];
        if (!ano) {
          ano = String(anoPadrao);
        } else if (ano.length === 2) {
          ano = '20' + ano;
        }
        dataStr = `${ano}-${mes}-${dia}`;
        linhaSemData = l.replace(dataMatch[0], ' ');
      } else {
        dataStr = hoje.toISOString().slice(0, 10);
      }

      // Regex para encontrar valores monetários: ex: R$ 1.500,00, -150,00, +2.300,50, 45,90 D
      const valorMatches = [...linhaSemData.matchAll(/(?:([+-])\s*)?(?:R\$\s*)?([0-9]{1,3}(?:\.[0-9]{3})*|\d+)(?:,(\d{2}))(?:\s*([CDcd]))?/g)];
      
      if (valorMatches.length === 0) return;

      // Pegamos o último valor monetário na linha (geralmente é o valor da transação)
      const valMatch = valorMatches[valorMatches.length - 1];
      const sinal = valMatch[1] || '';
      const parteInteira = valMatch[2].replace(/\./g, '');
      const parteDecimal = valMatch[3] || '00';
      const indicadorCD = (valMatch[4] || '').toUpperCase();

      const numVal = parseFloat(`${parteInteira}.${parteDecimal}`);
      if (isNaN(numVal) || numVal === 0) return;

      // Determina se é saída ou entrada
      let isSaida = false;
      if (sinal === '-') isSaida = true;
      if (indicadorCD === 'D') isSaida = true;
      if (
        linhaSemData.toLowerCase().includes('pagamento') ||
        linhaSemData.toLowerCase().includes('saida') ||
        linhaSemData.toLowerCase().includes('compra') ||
        linhaSemData.toLowerCase().includes('tarifa') ||
        linhaSemData.toLowerCase().includes('débito') ||
        linhaSemData.toLowerCase().includes('debito') ||
        linhaSemData.toLowerCase().includes('pix enviado')
      ) {
        isSaida = true;
      }
      if (sinal === '+' || indicadorCD === 'C' || linhaSemData.toLowerCase().includes('receb') || linhaSemData.toLowerCase().includes('pix recebido')) {
        isSaida = false;
      }

      // Descrição é o restante do texto limpando o valor encontrado
      let desc = linhaSemData.replace(valMatch[0], '').replace(/\s+/g, ' ').trim();
      if (!desc) desc = isSaida ? 'Despesa Extrato' : 'Receita Extrato';

      const tipo = isSaida ? 'despesa' : 'receita';
      const catSugerida = autoCategoria(desc, tipo);
      const destinacaoSugerida: DestinacaoGasto = contaSelecionada?.escopo === 'PJ' ? 'loja_100' : 'particular';

      parsed.push({
        id: `parsed_${idx}_${Date.now()}`,
        selecionado: true,
        data: dataStr,
        descricao: desc,
        valor: numVal,
        tipo,
        categoria_id: catSugerida,
        destinacao: destinacaoSugerida,
      });
    });

    if (parsed.length === 0) {
      setMensagemErro('Não conseguimos identificar nenhuma transação válida no texto. Tente colar linhas com Data, Descrição e Valor.');
      return;
    }

    setItens(parsed);
    setPasso('revisar');
  }

  // Upload de arquivo OFX ou CSV
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setTextoBruto(content);
        processarTexto(content);
      }
    };
    reader.readAsText(file);
  }

  // Alternar seleção
  function toggleSelecionado(id: string) {
    setItens((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selecionado: !item.selecionado } : item))
    );
  }

  function toggleTodos(selecionar: boolean) {
    setItens((prev) => prev.map((item) => ({ ...item, selecionado: !item.selecionar })));
  }

  function atualizarItem(id: string, campo: keyof ItemExtratoParsed, valor: any) {
    setItens((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [campo]: valor } : item))
    );
  }

  function removerItem(id: string) {
    setItens((prev) => prev.filter((item) => item.id !== id));
  }

  // Totais calculados
  const itensSelecionados = useMemo(() => itens.filter((i) => i.selecionado), [itens]);
  const totalReceitas = useMemo(
    () => itensSelecionados.filter((i) => i.tipo === 'receita').reduce((s, i) => s + i.valor, 0),
    [itensSelecionados]
  );
  const totalDespesas = useMemo(
    () => itensSelecionados.filter((i) => i.tipo === 'despesa').reduce((s, i) => s + i.valor, 0),
    [itensSelecionados]
  );

  // Confirmar e salvar lote
  async function confirmarImportacao() {
    if (itensSelecionados.length === 0) {
      setMensagemErro('Selecione pelo menos um lançamento para importar');
      return;
    }

    setSalvando(true);
    setMensagemErro(null);

    try {
      const url = `/api/financeiro/lancamentos/importar-lote${ownerParam ? `?owner=${encodeURIComponent(ownerParam)}` : ''}`;
      const payload = {
        conta_id: contaId || contas[0]?.id,
        lancamentos: itensSelecionados.map((it) => ({
          tipo: it.tipo,
          descricao: it.descricao,
          valor: it.valor,
          data_competencia: it.data,
          categoria_id: it.categoria_id,
          destinacao: it.destinacao,
        })),
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.sucesso) {
        throw new Error(data.erro || 'Falha ao importar lançamentos');
      }

      onImportadoComSucesso();
      onFechar();
    } catch (err: any) {
      setMensagemErro(err?.message || 'Erro ao comunicar com o servidor');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl text-white my-auto">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Importador de Extrato Bancário</h2>
              <p className="text-xs text-slate-400">
                Cole o extrato ou envie arquivo (CSV/OFX) para lançamento automático
              </p>
            </div>
          </div>
          <button
            onClick={onFechar}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Seleção de Conta Destino */}
        <div className="px-6 py-3 bg-slate-950/60 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Conta de Destino:</span>
            <select
              value={contaId}
              onChange={(e) => setContaId(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium text-white focus:outline-none focus:border-emerald-500"
            >
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} ({c.escopo}) - Saldo: R$ {(c.saldo || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </option>
              ))}
            </select>
          </div>

          {passo === 'revisar' && (
            <button
              onClick={() => setPasso('colar')}
              className="text-xs text-slate-400 hover:text-emerald-400 flex items-center gap-1.5 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Colar Outro Extrato
            </button>
          )}
        </div>

        {/* Conteúdo Dinâmico */}
        <div className="p-6 overflow-y-auto flex-1">
          {mensagemErro && (
            <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{mensagemErro}</span>
            </div>
          )}

          {passo === 'colar' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Cole as linhas do seu Extrato Bancário (Nubank, Sicredi, Itaú, BB, etc.)
                </label>
                <textarea
                  rows={8}
                  value={textoBruto}
                  onChange={(e) => setTextoBruto(e.target.value)}
                  placeholder={`Exemplo copiado do app do banco:\n24/10/2023  Transferência recebida de João Silva  R$ 1.500,00\n25/10/2023  Posto Ipiranga Gasolina  -R$ 250,00\n26/10/2023  Auto Peças Reparo Golf  -R$ 480,00`}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono resize-none leading-relaxed"
                />
              </div>

              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <label className="flex items-center justify-center gap-2 border border-dashed border-slate-700 hover:border-slate-500 rounded-xl py-3 px-4 text-xs text-slate-300 cursor-pointer bg-slate-900/40 hover:bg-slate-800/40 transition">
                    <FileText className="w-4 h-4 text-emerald-400" />
                    <span>Ou selecione um arquivo <strong>.CSV</strong> ou <strong>.OFX</strong></span>
                    <input
                      type="file"
                      accept=".csv,.txt,.ofx"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <button
                  onClick={() => processarTexto(textoBruto)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-6 py-3 rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-950/40 transition"
                >
                  <Sparkles className="w-4 h-4" />
                  Processar Linhas
                </button>
              </div>

              <div className="p-3.5 bg-slate-950/40 border border-slate-800/60 rounded-xl text-xs text-slate-400 space-y-1">
                <p className="font-semibold text-slate-300">💡 Como funciona o Importador Inteligente:</p>
                <p>• O sistema lê cada linha, detecta automaticamente datas, valores e se é entrada ou saída.</p>
                <p>• Categorias e acerto entre sócios são sugeridos automaticamente para você só conferir antes de salvar.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Resumo da Importação */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Itens Selecionados</span>
                  <p className="text-lg font-bold text-white mt-0.5">
                    {itensSelecionados.length} <span className="text-xs font-normal text-slate-400">/ {itens.length}</span>
                  </p>
                </div>
                <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-xl p-3">
                  <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">
                    <ArrowDownLeft className="w-3 h-3" /> Total Entradas
                  </span>
                  <p className="text-lg font-bold text-emerald-400 mt-0.5">
                    R$ {totalReceitas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-rose-950/20 border border-rose-900/30 rounded-xl p-3">
                  <span className="text-[10px] uppercase font-bold text-rose-400 flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" /> Total Saídas
                  </span>
                  <p className="text-lg font-bold text-rose-400 mt-0.5">
                    R$ {totalDespesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* Botões de Ação Rápida */}
              <div className="flex items-center justify-between text-xs text-slate-400 pb-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleTodos(true)}
                    className="hover:text-emerald-400 underline underline-offset-2"
                  >
                    Marcar Todos
                  </button>
                  <span>•</span>
                  <button
                    onClick={() => toggleTodos(false)}
                    className="hover:text-rose-400 underline underline-offset-2"
                  >
                    Desmarcar Todos
                  </button>
                </div>
                <span>Confira e ajuste os dados antes de lançar</span>
              </div>

              {/* Tabela de Revisão */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40 max-h-[360px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 text-[11px] uppercase tracking-wider sticky top-0 border-b border-slate-800 z-10">
                    <tr>
                      <th className="py-2.5 px-3 w-8">#</th>
                      <th className="py-2.5 px-3 w-28">Data</th>
                      <th className="py-2.5 px-3">Descrição</th>
                      <th className="py-2.5 px-3 w-28">Tipo</th>
                      <th className="py-2.5 px-3 w-28">Valor (R$)</th>
                      <th className="py-2.5 px-3 w-36">Categoria</th>
                      <th className="py-2.5 px-3 w-32">Destinação</th>
                      <th className="py-2.5 px-3 w-10 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {itens.map((it) => (
                      <tr
                        key={it.id}
                        className={`hover:bg-slate-800/30 transition ${
                          !it.selecionado ? 'opacity-40 bg-slate-950/80' : ''
                        }`}
                      >
                        <td className="py-2 px-3">
                          <input
                            type="checkbox"
                            checked={it.selecionado}
                            onChange={() => toggleSelecionado(it.id)}
                            className="rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-0 cursor-pointer"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="date"
                            value={it.data}
                            onChange={(e) => atualizarItem(it.id, 'data', e.target.value)}
                            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs w-full focus:outline-none focus:border-emerald-500"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={it.descricao}
                            onChange={(e) => atualizarItem(it.id, 'descricao', e.target.value)}
                            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 text-xs w-full focus:outline-none focus:border-emerald-500"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <button
                            type="button"
                            onClick={() =>
                              atualizarItem(it.id, 'tipo', it.tipo === 'receita' ? 'despesa' : 'receita')
                            }
                            className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center justify-center gap-1 w-full border ${
                              it.tipo === 'receita'
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                            }`}
                          >
                            {it.tipo === 'receita' ? 'Entrada' : 'Saída'}
                          </button>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            step="0.01"
                            value={it.valor}
                            onChange={(e) =>
                              atualizarItem(it.id, 'valor', Math.abs(parseFloat(e.target.value) || 0))
                            }
                            className={`bg-slate-900 border border-slate-800 rounded px-2 py-1 font-semibold text-xs w-full focus:outline-none focus:border-emerald-500 ${
                              it.tipo === 'receita' ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          />
                        </td>
                        <td className="py-2 px-3">
                          <select
                            value={it.categoria_id || ''}
                            onChange={(e) => atualizarItem(it.id, 'categoria_id', e.target.value || null)}
                            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-300 text-xs w-full focus:outline-none focus:border-emerald-500"
                          >
                            <option value="">Sem categoria</option>
                            {categorias
                              .filter((c) => c.tipo === (it.tipo === 'receita' ? 'entrada' : 'saida'))
                              .map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                  {cat.nome}
                                </option>
                              ))}
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <select
                            value={it.destinacao}
                            onChange={(e) =>
                              atualizarItem(it.id, 'destinacao', e.target.value as DestinacaoGasto)
                            }
                            className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-300 text-xs w-full focus:outline-none focus:border-emerald-500"
                          >
                            <option value="particular">Particular</option>
                            <option value="loja_100">100% Loja</option>
                            <option value="loja_50">Meio a Meio</option>
                          </select>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            onClick={() => removerItem(it.id)}
                            className="text-slate-500 hover:text-rose-400 p-1 transition"
                            title="Remover linha"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé com Ações */}
        <div className="p-5 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between">
          <button
            type="button"
            onClick={onFechar}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
          >
            Cancelar
          </button>

          {passo === 'revisar' && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPasso('colar')}
                className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white rounded-xl bg-slate-800 hover:bg-slate-700 transition"
              >
                Voltar
              </button>

              <button
                type="button"
                disabled={salvando || itensSelecionados.length === 0}
                onClick={confirmarImportacao}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-emerald-950/40 transition"
              >
                {salvando ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Lançando {itensSelecionados.length} Itens...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Confirmar e Lançar ({itensSelecionados.length}) na Conta {contaSelecionada?.nome}
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
