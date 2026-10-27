'use client';

import React, { useState, useEffect } from 'react';
import {
  History,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  Calendar,
  Layers,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { FinHistoricoPeriodo, FinHistoricoItem } from '@/lib/financeiro/types';

export function AbaHistoricoPlanilha() {
  const [periodos, setPeriodos] = useState<FinHistoricoPeriodo[]>([]);
  const [resumoGeral, setResumoGeral] = useState<{
    totalPeriodos: number;
    totalEntradasGeral: number;
    totalSaidasGeral: number;
    ultimoSaldo: number;
  } | null>(null);

  const [periodoSelecionadoId, setPeriodoSelecionadoId] = useState<string>('');
  const [periodoDetalhe, setPeriodoDetalhe] = useState<FinHistoricoPeriodo | null>(null);
  const [entradas, setEntradas] = useState<FinHistoricoItem[]>([]);
  const [saidas, setSaidas] = useState<FinHistoricoItem[]>([]);

  const [busca, setBusca] = useState('');
  const [buscaResultados, setBuscaResultados] = useState<FinHistoricoItem[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [carregando, setCarregando] = useState(true);

  // Carregar lista de períodos
  useEffect(() => {
    async function carregarLista() {
      try {
        setCarregando(true);
        const res = await fetch('/api/financeiro/historico-planilha');
        const data = await res.json();
        if (data.sucesso) {
          setPeriodos(data.periodos || []);
          setResumoGeral(data.resumoGeral);
          if (data.periodos && data.periodos.length > 0) {
            // Seleciona o último período por padrão (Outubro 2026) ou o primeiro
            setPeriodoSelecionadoId(data.periodos[data.periodos.length - 1].id);
          }
        }
      } catch (err) {
        console.error('Erro ao carregar lista de períodos:', err);
      } finally {
        setCarregando(false);
      }
    }
    carregarLista();
  }, []);

  // Carregar detalhes do período selecionado
  useEffect(() => {
    if (!periodoSelecionadoId) return;

    async function carregarDetalhe() {
      try {
        const res = await fetch(`/api/financeiro/historico-planilha?periodo_id=${periodoSelecionadoId}`);
        const data = await res.json();
        if (data.sucesso) {
          setPeriodoDetalhe(data.periodo);
          setEntradas(data.entradas || []);
          setSaidas(data.saidas || []);
        }
      } catch (err) {
        console.error('Erro ao carregar detalhes do período:', err);
      }
    }
    carregarDetalhe();
  }, [periodoSelecionadoId]);

  // Busca global com debounce
  useEffect(() => {
    if (!busca.trim()) {
      setBuscaResultados(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setBuscando(true);
        const res = await fetch(`/api/financeiro/historico-planilha?q=${encodeURIComponent(busca.trim())}`);
        const data = await res.json();
        if (data.sucesso) {
          setBuscaResultados(data.itens || []);
        }
      } catch (err) {
        console.error('Erro na busca global:', err);
      } finally {
        setBuscando(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [busca]);

  // Exportar para CSV
  function exportarPeriodoCSV() {
    if (!periodoDetalhe) return;

    let csv = `TIPO;DATA;DESCRICAO;PLACA_OU_MOTIVO;VALOR_R$\n`;
    entradas.forEach((e) => {
      csv += `ENTRADA;${e.data_registro || ''};"${e.descricao}";"${e.motivo_ou_placa || ''}";${e.valor.toFixed(2).replace('.', ',')}\n`;
    });
    saidas.forEach((s) => {
      csv += `SAIDA;${s.data_registro || ''};"${s.descricao}";"${s.motivo_ou_placa || ''}";${s.valor.toFixed(2).replace('.', ',')}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Historico_${periodoDetalhe.titulo.replace(/[\/\s]/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (carregando) {
    return (
      <div className="py-16 text-center text-slate-400">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm">Carregando histórico da planilha...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Banner de Isolamento e Segurança */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                LIVRO RAZÃO HISTÓRICO ISOLADO
              </span>
              <span className="text-xs text-slate-400">Setembro/2023 até Outubro/2026</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
              <History className="w-5 h-5 text-emerald-400" />
              Arquivo Histórico das Contas da Planilha
            </h2>
            <p className="text-xs text-slate-400 max-w-2xl">
              Todos os 30 períodos da sua planilha antiga foram importados e salvos separadamente para conferência e auditoria. Eles <strong>não misturam nem alteram</strong> os saldos das suas contas bancárias ativas atuais.
            </p>
          </div>

          {resumoGeral && (
            <div className="flex items-center gap-3">
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400">Saldo Histórico Final</span>
                <p className={`text-base font-bold ${resumoGeral.ultimoSaldo < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  R$ {resumoGeral.ultimoSaldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-2.5 text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400">Total Movimentado</span>
                <p className="text-base font-bold text-white">
                  R$ {(resumoGeral.totalEntradasGeral + resumoGeral.totalSaidasGeral).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Barra de Pesquisa Global */}
      <div className="relative">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-4 pointer-events-none" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar veículo, placa, cliente, cheque, comissão ou despesa em todos os 30 períodos..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-11 pr-10 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 shadow-inner"
          />
          {busca && (
            <button
              onClick={() => setBusca('')}
              className="absolute right-3.5 text-xs text-slate-400 hover:text-white"
            >
              Limpar
            </button>
          )}
        </div>

        {/* Resultados da Busca Global */}
        {busca.trim() && (
          <div className="mt-3 bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-2">
              <span className="font-semibold text-white">
                {buscando ? 'Pesquisando...' : `${buscaResultados?.length || 0} resultados encontrados para "${busca}"`}
              </span>
              <span>Busca em todos os 824 lançamentos</span>
            </div>

            {buscaResultados && buscaResultados.length > 0 ? (
              <div className="max-h-80 overflow-y-auto space-y-2 divide-y divide-slate-800/60 pr-1">
                {buscaResultados.map((it) => (
                  <div key={it.id} className="pt-2 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          it.tipo === 'receita'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {it.tipo === 'receita' ? 'Entrada' : 'Saída'}
                      </span>
                      <div>
                        <p className="font-medium text-white">{it.descricao}</p>
                        <p className="text-[11px] text-slate-400">
                          {it.data_registro ? `Data: ${it.data_registro} • ` : ''}
                          {it.motivo_ou_placa ? `Placa/Ref: ${it.motivo_ou_placa} • ` : ''}
                          <span className="text-emerald-400/80">
                            Período {it.fin_historico_periodos?.numero_ordem}: {it.fin_historico_periodos?.titulo}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`font-semibold text-sm ${
                          it.tipo === 'receita' ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        R$ {it.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                      <button
                        onClick={() => {
                          setPeriodoSelecionadoId(it.periodo_id);
                          setBusca('');
                        }}
                        className="text-xs text-slate-400 hover:text-emerald-400 underline underline-offset-2 ml-2"
                      >
                        Ver Período
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : !buscando ? (
              <p className="text-xs text-slate-500 py-4 text-center">Nenhum registro encontrado com esse termo.</p>
            ) : null}
          </div>
        )}
      </div>

      {/* Seletor de Período e Botão de Exportar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-[280px]">
          <Calendar className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <div className="flex-1">
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              Selecione o Período para Conferência:
            </label>
            <select
              value={periodoSelecionadoId}
              onChange={(e) => setPeriodoSelecionadoId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white font-medium focus:outline-none focus:border-emerald-500"
            >
              {periodos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.numero_ordem}. {p.titulo} • Saldo: R$ {p.saldo_final.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </option>
              ))}
            </select>
          </div>
        </div>

        {periodoDetalhe && (
          <button
            onClick={exportarPeriodoCSV}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            Exportar CSV do Período
          </button>
        )}
      </div>

      {/* Visualização do Período Selecionado */}
      {periodoDetalhe && (
        <div className="space-y-4">
          {/* Barra de Resumo do Período */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
              <span className="text-[10px] uppercase font-bold text-slate-400">Saldo Anterior</span>
              <p
                className={`text-base font-bold mt-0.5 ${
                  periodoDetalhe.saldo_inicial < 0 ? 'text-rose-400' : 'text-slate-200'
                }`}
              >
                R$ {periodoDetalhe.saldo_inicial.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>

            <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-xl p-3.5">
              <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1">
                <ArrowDownLeft className="w-3.5 h-3.5" /> Total Entradas
              </span>
              <p className="text-base font-bold text-emerald-400 mt-0.5">
                R$ {periodoDetalhe.total_recebido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-emerald-400/70">{periodoDetalhe.qtd_entradas} itens</span>
            </div>

            <div className="bg-rose-950/20 border border-rose-900/30 rounded-xl p-3.5">
              <span className="text-[10px] uppercase font-bold text-rose-400 flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5" /> Total Saídas
              </span>
              <p className="text-base font-bold text-rose-400 mt-0.5">
                R$ {periodoDetalhe.total_pago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-rose-400/70">{periodoDetalhe.qtd_saidas} itens</span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
              <span className="text-[10px] uppercase font-bold text-slate-400">Saldo Final Fechado</span>
              <p
                className={`text-base font-bold mt-0.5 ${
                  periodoDetalhe.saldo_final < 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                R$ {periodoDetalhe.saldo_final.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-slate-400">Passou p/ próximo período</span>
            </div>
          </div>

          {/* Duas Colunas: Entradas à Esquerda e Saídas à Direita */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Coluna de Entradas / Recebidos */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
              <div className="bg-emerald-950/30 border-b border-emerald-900/30 p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <ArrowDownLeft className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                      Entradas / Recebidos
                    </h3>
                    <p className="text-[11px] text-slate-400">{entradas.length} lançamentos registrados</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-emerald-400">
                  R$ {periodoDetalhe.total_recebido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-3 divide-y divide-slate-800/60 max-h-[500px] overflow-y-auto">
                {entradas.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-8">Nenhuma entrada registrada neste período.</p>
                ) : (
                  entradas.map((it, idx) => (
                    <div key={it.id || idx} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 font-mono text-[11px]">{it.data_registro || '—'}</span>
                          <span className="text-white font-medium">{it.descricao}</span>
                        </div>
                        {it.motivo_ou_placa && (
                          <span className="inline-block px-1.5 py-0.2 rounded bg-slate-800 text-[10px] text-slate-300 font-mono">
                            Ref/Placa: {it.motivo_ou_placa}
                          </span>
                        )}
                      </div>
                      <span className="font-semibold text-emerald-400 whitespace-nowrap">
                        R$ {it.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Coluna de Saídas / Pagamentos */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
              <div className="bg-rose-950/30 border-b border-rose-900/30 p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider">
                      Saídas / Pagamentos
                    </h3>
                    <p className="text-[11px] text-slate-400">{saidas.length} lançamentos registrados</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-rose-400">
                  R$ {periodoDetalhe.total_pago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-3 divide-y divide-slate-800/60 max-h-[500px] overflow-y-auto">
                {saidas.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-8">Nenhuma saída registrada neste período.</p>
                ) : (
                  saidas.map((it, idx) => (
                    <div key={it.id || idx} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 font-mono text-[11px]">{it.data_registro || '—'}</span>
                          <span className="text-white font-medium">{it.descricao}</span>
                        </div>
                        {it.motivo_ou_placa && (
                          <span className="inline-block px-1.5 py-0.2 rounded bg-slate-800 text-[10px] text-slate-300 font-mono">
                            Ref/Placa: {it.motivo_ou_placa}
                          </span>
                        )}
                      </div>
                      <span className="font-semibold text-rose-400 whitespace-nowrap">
                        R$ {it.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
