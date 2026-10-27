'use client';

import React, { useState, useMemo } from 'react';
import {
  Calendar,
  AlertCircle,
  Clock,
  CheckCircle2,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  Filter,
  Check,
  Edit2,
  Trash2,
  Building,
  Car,
} from 'lucide-react';
import { FinLancamento, FinConta } from '@/lib/financeiro/types';
import { brl, dataBR, hojeISO } from '@/lib/financeiro/format';

interface AbaContasPagarReceberProps {
  lancamentos: FinLancamento[];
  contas: FinConta[];
  onDarBaixa: (id: string, contaId?: string) => Promise<boolean>;
  onEditar: (item: FinLancamento) => void;
  onExcluir: (item: FinLancamento) => void;
  onNovo: (tipo: 'entrada' | 'saida') => void;
}

type SubAba = 'todas' | 'pagar' | 'receber';
type FiltroPrazo = 'todas_pendentes' | 'vencidas' | 'hoje' | 'semana' | 'mes' | 'liquidadas';

export function AbaContasPagarReceber({
  lancamentos,
  contas,
  onDarBaixa,
  onEditar,
  onExcluir,
  onNovo,
}: AbaContasPagarReceberProps) {
  const [subAba, setSubAba] = useState<SubAba>('pagar');
  const [filtroPrazo, setFiltroPrazo] = useState<FiltroPrazo>('todas_pendentes');
  const [contaBaixaId, setContaBaixaId] = useState<string>(contas[0]?.id || '');
  const [baixandoId, setBaixandoId] = useState<string | null>(null);

  const hoje = hojeISO();

  // Filtragem e Classificação dos Lançamentos
  const itensFiltrados = useMemo(() => {
    return lancamentos.filter((l) => {
      // 1. Filtro de Sub-Aba (Pagar = saida, Receber = entrada)
      if (subAba === 'pagar' && l.tipo !== 'saida') return false;
      if (subAba === 'receber' && l.tipo !== 'entrada') return false;

      const vencimento = l.data_vencimento || l.data;
      const isPendente = l.status === 'previsto';
      const isPago = l.status === 'pago';

      // 2. Filtro de Prazo/Status
      if (filtroPrazo === 'liquidadas') {
        return isPago;
      }

      if (!isPendente) return false;

      if (filtroPrazo === 'todas_pendentes') return true;
      if (filtroPrazo === 'vencidas') return vencimento < hoje;
      if (filtroPrazo === 'hoje') return vencimento === hoje;
      if (filtroPrazo === 'semana') {
        // Próximos 7 dias
        const limiteSemana = new Date();
        limiteSemana.setDate(limiteSemana.getDate() + 7);
        const limiteStr = limiteSemana.toISOString().slice(0, 10);
        return vencimento >= hoje && vencimento <= limiteStr;
      }
      if (filtroPrazo === 'mes') {
        const anoMesHoje = hoje.slice(0, 7);
        return vencimento.slice(0, 7) === anoMesHoje;
      }

      return true;
    }).sort((a, b) => (a.data_vencimento || a.data).localeCompare(b.data_vencimento || b.data));
  }, [lancamentos, subAba, filtroPrazo, hoje]);

  // Cálculos de KPIs Globais de Contas a Pagar e Receber
  const kpis = useMemo(() => {
    const pendentes = lancamentos.filter((l) => l.status === 'previsto');

    const totalPagar = pendentes
      .filter((l) => l.tipo === 'saida')
      .reduce((s, l) => s + Number(l.valor || 0), 0);

    const totalReceber = pendentes
      .filter((l) => l.tipo === 'entrada')
      .reduce((s, l) => s + Number(l.valor || 0), 0);

    const vencidasCount = pendentes.filter(
      (l) => (l.data_vencimento || l.data) < hoje
    ).length;

    const vencemHojeCount = pendentes.filter(
      (l) => (l.data_vencimento || l.data) === hoje
    ).length;

    return {
      totalPagar,
      totalReceber,
      saldoLiquidoPrevisto: totalReceber - totalPagar,
      vencidasCount,
      vencemHojeCount,
    };
  }, [lancamentos, hoje]);

  async function handleConfirmarBaixa(item: FinLancamento) {
    setBaixandoId(item.id);
    await onDarBaixa(item.id, contaBaixaId || item.conta_id || contas[0]?.id);
    setBaixandoId(null);
  }

  return (
    <div className="space-y-6">
      {/* Topo com KPIs e Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Contas a Pagar Pendentes */}
        <div className="bg-rose-950/20 border border-rose-900/30 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-rose-400 flex items-center gap-1.5">
              <ArrowUpRight className="w-4 h-4 text-rose-400" /> A Pagar Pendente
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-500/10 text-rose-300 font-bold">
              {lancamentos.filter((l) => l.tipo === 'saida' && l.status === 'previsto').length} contas
            </span>
          </div>
          <p className="text-xl font-black text-rose-400 mt-2">{brl(kpis.totalPagar)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Saídas futuras / compromissos</p>
        </div>

        {/* Contas a Receber Pendentes */}
        <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1.5">
              <ArrowDownLeft className="w-4 h-4 text-emerald-400" /> A Receber Pendente
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/10 text-emerald-300 font-bold">
              {lancamentos.filter((l) => l.tipo === 'entrada' && l.status === 'previsto').length} contas
            </span>
          </div>
          <p className="text-xl font-black text-emerald-400 mt-2">{brl(kpis.totalReceber)}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Receitas a liquidar / cheques</p>
        </div>

        {/* Saldo Líquido Previsto */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-purple-400" /> Saldo Projetado
            </span>
            <span className="text-[10px] text-slate-500">Receber - Pagar</span>
          </div>
          <p className={`text-xl font-black mt-2 ${kpis.saldoLiquidoPrevisto >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {brl(kpis.saldoLiquidoPrevisto)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Resultado futuro previsto</p>
        </div>

        {/* Alertas de Vencimento */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-amber-400" /> Prazos Críticos
          </span>
          <div className="flex items-center gap-2 mt-2">
            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
              kpis.vencidasCount > 0 ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-slate-800 text-slate-400'
            }`}>
              ⚠️ {kpis.vencidasCount} Vencidas
            </span>
            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
              kpis.vencemHojeCount > 0 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-slate-800 text-slate-400'
            }`}>
              ⚡ {kpis.vencemHojeCount} Vencem Hoje
            </span>
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Abas Pagar / Receber */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Sub-Aba: Pagar x Receber */}
          <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setSubAba('pagar')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                subAba === 'pagar'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5 text-rose-400" />
              Contas a Pagar
            </button>
            <button
              type="button"
              onClick={() => setSubAba('receber')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                subAba === 'receber'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
              Contas a Receber
            </button>
            <button
              type="button"
              onClick={() => setSubAba('todas')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                subAba === 'todas'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Todas
            </button>
          </div>

          {/* Botões de Novo Lançamento Rápido */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNovo('saida')}
              className="px-3 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/30 text-rose-300 font-bold text-xs flex items-center gap-1.5 transition"
            >
              <Plus className="w-3.5 h-3.5" /> + Conta a Pagar
            </button>
            <button
              type="button"
              onClick={() => onNovo('entrada')}
              className="px-3 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 font-bold text-xs flex items-center gap-1.5 transition"
            >
              <Plus className="w-3.5 h-3.5" /> + Conta a Receber
            </button>
          </div>
        </div>

        {/* Filtros de Vencimento e Status */}
        <div className="flex items-center gap-2 overflow-x-auto pt-2 border-t border-slate-800/80 text-xs">
          <span className="text-slate-500 text-[11px] font-semibold uppercase flex items-center gap-1 mr-1">
            <Filter className="w-3 h-3" /> Prazo:
          </span>
          <button
            type="button"
            onClick={() => setFiltroPrazo('todas_pendentes')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              filtroPrazo === 'todas_pendentes'
                ? 'bg-slate-800 text-white font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Todas as Pendentes
          </button>
          <button
            type="button"
            onClick={() => setFiltroPrazo('vencidas')}
            className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 ${
              filtroPrazo === 'vencidas'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold'
                : 'text-slate-400 hover:text-rose-300'
            }`}
          >
            ⚠️ Vencidas
          </button>
          <button
            type="button"
            onClick={() => setFiltroPrazo('hoje')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              filtroPrazo === 'hoje'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            ⚡ Vence Hoje
          </button>
          <button
            type="button"
            onClick={() => setFiltroPrazo('semana')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              filtroPrazo === 'semana'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Próximos 7 Dias
          </button>
          <button
            type="button"
            onClick={() => setFiltroPrazo('mes')}
            className={`px-3 py-1.5 rounded-lg font-medium transition ${
              filtroPrazo === 'mes'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Deste Mês
          </button>
          <button
            type="button"
            onClick={() => setFiltroPrazo('liquidadas')}
            className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1 ${
              filtroPrazo === 'liquidadas'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Já Pagas / Liquidadas
          </button>
        </div>
      </div>

      {/* Tabela de Contas */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xs font-bold text-white">
            {itensFiltrados.length} lançamentos encontrados
          </span>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span>Conta para baixa:</span>
            <select
              value={contaBaixaId}
              onChange={(e) => setContaBaixaId(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
            >
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} ({c.escopo})
                </option>
              ))}
            </select>
          </div>
        </div>

        {itensFiltrados.length === 0 ? (
          <div className="py-16 text-center text-slate-500 space-y-2">
            <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500/40" />
            <p className="text-sm font-semibold text-slate-400">Nenhuma conta pendente para este filtro.</p>
            <p className="text-xs">Tudo em dia ou nenhum lançamento previsto cadastrado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Vencimento</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Descrição</th>
                  <th className="py-3 px-4">Ref / Veículo</th>
                  <th className="py-3 px-4">Destinação</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {itensFiltrados.map((item) => {
                  const venc = item.data_vencimento || item.data;
                  const isVencida = item.status === 'previsto' && venc < hoje;
                  const isHoje = item.status === 'previsto' && venc === hoje;
                  const isPaga = item.status === 'pago';

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-800/30 transition ${
                        isVencida ? 'bg-rose-950/10' : isHoje ? 'bg-amber-950/10' : ''
                      }`}
                    >
                      {/* Vencimento */}
                      <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-300">
                        {dataBR(venc)}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isPaga ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 w-fit">
                            <Check className="w-3 h-3" /> Pago
                          </span>
                        ) : isVencida ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1 w-fit animate-pulse">
                            <AlertCircle className="w-3 h-3" /> Vencida
                          </span>
                        ) : isHoje ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 w-fit">
                            <Clock className="w-3 h-3" /> Vence Hoje
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500/10 text-blue-300 border border-blue-500/20 flex items-center gap-1 w-fit">
                            <Clock className="w-3 h-3" /> No Prazo
                          </span>
                        )}
                      </td>

                      {/* Descrição */}
                      <td className="py-3 px-4">
                        <p className="font-semibold text-white">{item.descricao}</p>
                        <p className="text-[11px] text-slate-400">
                          {item.tipo === 'entrada' ? 'Recebimento previsto' : 'Pagamento a fornecedor/conta'}
                        </p>
                      </td>

                      {/* Referência / Placa */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {item.placa ? (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px] flex items-center gap-1 w-fit">
                            <Car className="w-3 h-3 text-slate-400" />
                            {item.placa}
                          </span>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>

                      {/* Destinação */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {item.destinacao === 'loja_100' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            100% Loja
                          </span>
                        ) : item.destinacao === 'loja_50' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            Meio a Meio
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">Particular</span>
                        )}
                      </td>

                      {/* Valor */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span
                          className={`font-black text-sm ${
                            item.tipo === 'entrada' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {brl(item.valor)}
                        </span>
                      </td>

                      {/* Ações */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {!isPaga && (
                            <button
                              type="button"
                              disabled={baixandoId === item.id}
                              onClick={() => handleConfirmarBaixa(item)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-md shadow-emerald-950/40 transition"
                              title="Confirmar pagamento / recebimento (dar baixa no caixa)"
                            >
                              <Check className="w-3.5 h-3.5" />
                              {baixandoId === item.id ? 'Baixando...' : 'Dar Baixa'}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => onEditar(item)}
                            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
                            title="Editar"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => onExcluir(item)}
                            className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition"
                            title="Excluir com Log de Auditoria"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
