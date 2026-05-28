import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, CheckCircle2, AlertTriangle, Clock, MessageSquareShare, 
  ChevronLeft, ChevronRight, Edit3, Trash2, ArrowUpDown, Filter, X 
} from 'lucide-react';
import { BillingRecord, BillingStatus } from '@/types';

interface DataGridProps {
  records: BillingRecord[];
  onMarkAsPaid: (id: string) => void;
  onEditRecord: (record: BillingRecord) => void;
  onSendReminder: (record: BillingRecord) => void;
  onDeleteRecord: (id: string) => void;
  onToggleTelefoneInvalido?: (id: string, isInvalid: boolean) => void;
  onChangeFase?: (id: string, newFase: 'NORMAL' | 'ENVIO_JURIDICO' | 'JURIDICO_VENDEDORES' | 'ENVIO_FORUM') => void;
}

type SortField = 'clienteFornecedor' | 'valor' | 'vencimento' | 'status';
type SortOrder = 'asc' | 'desc';

export default function DataGrid({ 
  records, 
  onMarkAsPaid, 
  onEditRecord, 
  onSendReminder, 
  onDeleteRecord,
  onToggleTelefoneInvalido,
  onChangeFase
}: DataGridProps) {
  const [filterCliente, setFilterCliente] = useState('');
  const [filterDescricao, setFilterDescricao] = useState('');
  const [filterVeiculo, setFilterVeiculo] = useState('');
  const [filterVencimento, setFilterVencimento] = useState('');

  const [statusFilter, setStatusFilter] = useState<'ATIVOS' | 'TODOS' | BillingStatus>('ATIVOS');
  const [faseFilter, setFaseFilter] = useState<'TODOS' | 'NORMAL' | 'ENVIO_JURIDICO' | 'JURIDICO_VENDEDORES' | 'ENVIO_FORUM' | 'PAGOS'>('TODOS');

  const handleStatusFilterChange = (status: 'ATIVOS' | 'TODOS' | BillingStatus) => {
    setStatusFilter(status);
    setCurrentPage(1);
    if (status === 'PAGO') {
      setFaseFilter('PAGOS');
    } else if (faseFilter === 'PAGOS') {
      setFaseFilter('TODOS');
    }
  };

  const handleFaseFilterChange = (fase: 'TODOS' | 'NORMAL' | 'ENVIO_JURIDICO' | 'JURIDICO_VENDEDORES' | 'ENVIO_FORUM' | 'PAGOS') => {
    setFaseFilter(fase);
    setCurrentPage(1);
    if (fase === 'PAGOS') {
      setStatusFilter('PAGO');
    } else if (statusFilter === 'PAGO') {
      setStatusFilter('ATIVOS');
    }
  };

  const [sortField, setSortField] = useState<SortField>('vencimento');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilterCliente('');
    setFilterDescricao('');
    setFilterVeiculo('');
    setFilterVencimento('');
    setStatusFilter('ATIVOS');
    setFaseFilter('TODOS');
    setSelectedIds([]);
    setCurrentPage(1);
  };

  const processedRecords = useMemo(() => {
    let result = [...records];

    if (filterCliente.trim() !== '') {
      const query = filterCliente.toLowerCase();
      const queryDigits = query.replace(/\D/g, '');
      result = result.filter(rec => {
        const nameMatches = rec.clienteFornecedor.toLowerCase().includes(query);
        const docMatches = (rec.cpfCnpj || '').includes(query);
        const phoneDigits = (rec.telefone || '').replace(/\D/g, '');
        const phoneMatches = queryDigits !== '' && phoneDigits.includes(queryDigits);
        return nameMatches || docMatches || phoneMatches;
      });
    }

    if (filterDescricao.trim() !== '') {
      const query = filterDescricao.toLowerCase();
      result = result.filter(rec => 
        (rec.observacoes || '').toLowerCase().includes(query) || 
        rec.status.toLowerCase().includes(query)
      );
    }

    if (filterVeiculo.trim() !== '') {
      const query = filterVeiculo.toLowerCase();
      result = result.filter(rec => 
        rec.veiculo.toLowerCase().includes(query)
      );
    }

    if (filterVencimento.trim() !== '') {
      result = result.filter(rec => rec.vencimento.includes(filterVencimento));
    }

    if (statusFilter === 'PAGO' || faseFilter === 'PAGOS') {
      result = result.filter(rec => rec.status === 'PAGO' || rec.fase === 'PAGOS');
    } else {
      if (statusFilter === 'ATIVOS') {
        result = result.filter(rec => rec.status === 'PENDENTE' || rec.status === 'ATRASADO');
      } else if (statusFilter !== 'TODOS') {
        result = result.filter(rec => rec.status === statusFilter);
      }

      if (faseFilter !== 'TODOS') {
        result = result.filter(rec => (rec.fase || 'NORMAL') === faseFilter);
      }
    }

    result.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'valor') {
        comparison = a.valor - b.valor;
      } else if (sortField === 'vencimento') {
        comparison = a.vencimento.localeCompare(b.vencimento);
      } else if (sortField === 'status') {
        comparison = a.status.localeCompare(b.status);
      } else {
        comparison = a.clienteFornecedor.localeCompare(b.clienteFornecedor);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [records, filterCliente, filterDescricao, filterVeiculo, filterVencimento, statusFilter, faseFilter, sortField, sortOrder]);

  const paginatedRecords = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return processedRecords.slice(startIndex, startIndex + itemsPerPage);
  }, [processedRecords, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(processedRecords.length / itemsPerPage) || 1;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(val);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const handleSelectRow = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    const paginatedIds = paginatedRecords.map(r => r.id);
    const allSelectedInPage = paginatedIds.every(id => selectedIds.includes(id));
    
    if (allSelectedInPage) {
      setSelectedIds(prev => prev.filter(id => !paginatedIds.includes(id)));
    } else {
      setSelectedIds(prev => [...new Set([...prev, ...paginatedIds])]);
    }
  };

  const selectedSum = useMemo(() => {
    return records
      .filter(r => selectedIds.includes(r.id))
      .reduce((acc, r) => acc + r.valor, 0);
  }, [records, selectedIds]);

  const totals = useMemo(() => {
    let total = 0;
    let aVencer = 0;
    let vencidos = 0;
    let quitados = 0;

    processedRecords.forEach(rec => {
      const val = rec.valor || 0;
      total += val;
      if (rec.status === 'PAGO') {
        quitados += val;
      } else if (rec.status === 'ATRASADO') {
        vencidos += val;
      } else {
        aVencer += val;
      }
    });

    return { total, aVencer, vencidos, quitados };
  }, [processedRecords]);

  const getSubtextByStatus = (record: BillingRecord) => {
    if (record.status === 'PAGO') {
      return `COMPENSADO PARCELA VEÍCULO`;
    } else if (record.status === 'ATRASADO') {
      return `ENVIADO COBRANÇA JUDICIAL`;
    }
    return `NOTIFICAÇÃO COMERCIAL AGENDADA`;
  };

  return (
    <div className="space-y-6 font-sans text-zinc-300 animate-fade-in" id="datagrid-main-wrapper">
      
      {/* Search & Filter Controls */}
      <div className="relative p-5 bg-zinc-900/40 backdrop-blur-xl border border-zinc-800 rounded-2xl shadow-2xl space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          <div className="flex flex-col">
            <label className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1.5">Cliente/Fornecedor</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Nome ou CPF/CNPJ do c..."
                value={filterCliente}
                onChange={(e) => { setFilterCliente(e.target.value); setCurrentPage(1); }}
                className="w-full pl-9 pr-3 py-2 bg-zinc-950/60 border border-zinc-850 hover:border-zinc-700 text-white focus:outline-none focus:border-violet-500/80 rounded-xl text-xs transition-colors"
              />
            </div>
          </div>

          <div className="flex flex-col">
            <label className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1.5">Descrição</label>
            <input
              type="text"
              placeholder="Pesquisar descrição"
              value={filterDescricao}
              onChange={(e) => { setFilterDescricao(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 bg-zinc-950/60 border border-zinc-850 hover:border-zinc-700 text-white focus:outline-none focus:border-violet-500/80 rounded-xl text-xs transition-colors"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1.5">Veículo</label>
            <input
              type="text"
              placeholder="Marca, modelo, cor ou ano..."
              value={filterVeiculo}
              onChange={(e) => { setFilterVeiculo(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 bg-zinc-950/60 border border-zinc-850 hover:border-zinc-700 text-white focus:outline-none focus:border-violet-500/80 rounded-xl text-xs transition-colors"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1.5">Mês de Vencimento</label>
            <input
              type="text"
              placeholder="Ex: 2026-01"
              value={filterVencimento}
              onChange={(e) => { setFilterVencimento(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2 bg-zinc-950/60 border border-zinc-850 hover:border-zinc-700 text-white focus:outline-none focus:border-violet-500/80 rounded-xl text-xs transition-colors"
            />
          </div>

        </div>

        {/* Action Toggle Strip */}
        <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 pt-4 border-t border-white/[0.06] text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2.5">
              <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Status:</span>
              <div className="inline-flex bg-zinc-950/60 p-0.5 rounded-xl border border-zinc-850">
                {([
                  { key: 'ATIVOS', label: 'Ativos' },
                  { key: 'TODOS', label: 'Todos' },
                  { key: 'PAGO', label: 'Pagos' },
                  { key: 'PENDENTE', label: 'Pendentes' },
                  { key: 'ATRASADO', label: 'Atrasados' }
                ] as const).map((filter) => (
                  <button
                    key={filter.key}
                    onClick={() => handleStatusFilterChange(filter.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      statusFilter === filter.key
                        ? 'bg-zinc-800 text-white shadow-md'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="text-zinc-500 text-[10px] font-black uppercase tracking-widest">Estágio:</span>
              <div className="inline-flex bg-zinc-950/60 p-0.5 rounded-xl border border-zinc-850">
                {([
                  { key: 'TODOS', label: 'Todos' },
                  { key: 'NORMAL', label: 'Normal' },
                  { key: 'ENVIO_JURIDICO', label: 'Jurídico' },
                  { key: 'JURIDICO_VENDEDORES', label: 'Vendedores' },
                  { key: 'ENVIO_FORUM', label: 'Fórum' },
                  { key: 'PAGOS', label: 'Pagos' }
                ] as const).map((f) => (
                  <button
                    key={f.key}
                    onClick={() => handleFaseFilterChange(f.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      faseFilter === f.key
                        ? 'bg-zinc-800 text-white shadow-md'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end xl:self-auto">
            {(filterCliente || filterDescricao || filterVeiculo || filterVencimento || statusFilter !== 'TODOS' || faseFilter !== 'TODOS') && (
              <button
                onClick={clearFilters}
                className="px-3.5 py-1.5 text-xs text-red-400 hover:text-red-300 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 hover:border-red-500/20 rounded-xl font-bold transition-all"
              >
                Limpar Filtros
              </button>
            )}
            <span className="text-zinc-500 text-xs font-bold">
              Filtro: {processedRecords.length} resultado(s)
            </span>
          </div>
        </div>
      </div>

      {/* Main Table Layout */}
      <div className="bg-zinc-900/40 backdrop-blur-xl border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-auto border-collapse text-left" id="main-billing-table">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/40 text-zinc-500">
                <th className="p-4 w-12 text-center">
                  <input
                    type="checkbox"
                    checked={paginatedRecords.length > 0 && paginatedRecords.every(r => selectedIds.includes(r.id))}
                    onChange={handleSelectAll}
                    className="w-4 h-4 text-violet-600 border-zinc-850 rounded focus:ring-violet-500 bg-zinc-950/60"
                  />
                </th>
                <th 
                  className="p-4 text-xs font-black uppercase tracking-widest text-zinc-500 cursor-pointer select-none hover:text-zinc-300"
                  onClick={() => handleSort('clienteFornecedor')}
                >
                  <div className="flex items-center gap-1.5">
                    ID & Vencimento <ArrowUpDown className="w-3.5 h-3.5 text-zinc-500" />
                  </div>
                </th>
                <th className="p-4 text-xs font-black uppercase tracking-widest text-zinc-500">
                  Cliente / Fornecedor
                </th>
                <th className="p-4 text-xs font-black uppercase tracking-widest text-zinc-500">
                  Descrição do Veículo & Status
                </th>
                <th 
                  className="p-4 text-xs font-black uppercase tracking-widest text-zinc-500 cursor-pointer select-none hover:text-zinc-300 text-right pr-6"
                  onClick={() => handleSort('valor')}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    Valor <ArrowUpDown className="w-3.5 h-3.5 text-zinc-500" />
                  </div>
                </th>
                <th className="p-4 text-xs font-black uppercase tracking-widest text-zinc-500">
                  Estágio Cobrança
                </th>
                <th className="p-4 text-xs font-black uppercase tracking-widest text-zinc-500 text-right pr-6">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/40 text-xs">
              <AnimatePresence mode="popLayout">
                {paginatedRecords.length > 0 ? (
                  paginatedRecords.map((record, index) => {
                    const isSelected = selectedIds.includes(record.id);
                    const isOverdue = record.status === 'ATRASADO';
                    const numericId = 3762000 + (index * 7) + (currentPage * 13);
                    
                    return (
                      <motion.tr
                        key={record.id}
                        id={`row-${record.id}`}
                        layoutId={record.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className={`group transition-all hover:bg-zinc-800/20 ${isSelected ? 'bg-violet-950/10' : ''}`}
                      >
                        {/* Checkbox */}
                        <td className="p-4 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectRow(record.id)}
                            className="w-4 h-4 text-violet-600 border-zinc-850 rounded focus:ring-violet-500 bg-zinc-950/60"
                          />
                        </td>

                        {/* ID & Vencimento */}
                        <td className="p-4">
                          <div className="text-red-500 font-extrabold text-[11px] mb-0.5 tracking-tight">
                            {numericId}
                          </div>
                          <div className={`font-mono font-bold ${isOverdue ? 'text-red-400' : 'text-zinc-500'}`}>
                            {formatDate(record.vencimento)}
                          </div>
                        </td>

                        {/* Cliente/Fornecedor */}
                        <td className="p-4">
                          <div className="font-extrabold text-zinc-100 uppercase tracking-tight">
                            {record.clienteFornecedor}
                          </div>
                          <div className="text-zinc-500 text-[10px] font-mono mt-1 font-semibold flex flex-wrap items-center gap-1.5 leading-relaxed">
                            <span>CPF/CNPJ: {record.cpfCnpj || '000.000.000-00'}</span>
                            <span>|</span>
                            <span className={record.telefone_invalido ? 'line-through text-red-400 font-bold' : ''}>
                              Tel: {record.telefone || 'Sem Telefone'}
                            </span>
                            
                            <button
                              onClick={() => onToggleTelefoneInvalido?.(record.id, !record.telefone_invalido)}
                              className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase border transition-all cursor-pointer ${
                                record.telefone_invalido 
                                  ? 'bg-red-500/10 text-red-450 border-red-500/20' 
                                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border-zinc-700/80 hover:text-zinc-200'
                              }`}
                              title={record.telefone_invalido ? 'Marcar telefone como VÁLIDO' : 'Sinalizar telefone como INVÁLIDO'}
                            >
                              {record.telefone_invalido ? 'Inválido ⚠️' : 'Sinalizar Inválido'}
                            </button>

                            {record.vendedor_nome && (
                              <span className="bg-violet-500/10 text-violet-400 border border-violet-500/20 px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider">
                                Assumido: {record.vendedor_nome}
                              </span>
                            )}
                            {record.quem_vendeu && (
                              <span className="bg-zinc-950 text-zinc-500 border border-zinc-850 px-1.5 py-0.5 rounded text-[8.5px] font-bold">
                                Vendedor: {record.quem_vendeu}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Descrição & Status */}
                        <td className="p-4 space-y-1">
                          <div className="text-zinc-400 font-bold tracking-tight">
                            {record.veiculo || 'Nenhum veículo cadastrado'}
                          </div>
                          <div className="text-[10px] uppercase font-bold text-zinc-500 flex flex-wrap items-center gap-1.5">
                            <span className="text-zinc-500">{getSubtextByStatus(record)}</span>
                            <span>•</span>
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase border ${
                              record.status === 'PAGO' 
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                : record.status === 'ATRASADO'
                                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            }`}>
                              {record.status}
                            </span>

                            {record.acordos_ativos && record.acordos_ativos > 0 ? (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase border bg-purple-500/10 text-purple-400 border-purple-500/20">
                                Renegociando
                              </span>
                            ) : null}
                          </div>
                        </td>

                        {/* Valor */}
                        <td className="p-4 text-right pr-6 font-mono font-black text-sky-400 text-[13px]">
                          {formatCurrency(record.valor)}
                        </td>

                        {/* Estágio Cobrança */}
                        <td className="p-4">
                          <select
                            value={record.fase || 'NORMAL'}
                            onChange={(e) => onChangeFase?.(record.id, e.target.value as any)}
                            className="bg-zinc-950 border border-zinc-850 hover:border-zinc-700 text-zinc-300 text-[11px] rounded-lg py-1 px-1.5 focus:outline-none cursor-pointer font-bold transition-all"
                          >
                            <option value="NORMAL">Normal</option>
                            <option value="ENVIO_JURIDICO">Cobrança Jurídica</option>
                            <option value="JURIDICO_VENDEDORES">Cobrança Vendedores</option>
                            <option value="ENVIO_FORUM">Envio ao Fórum</option>
                            <option value="PAGOS">Pagos</option>
                          </select>
                        </td>

                        {/* Actions */}
                        <td className="p-4 text-right pr-6">
                          <div className="flex items-center justify-end gap-2">
                            
                            {record.status !== 'PAGO' && (
                              <button
                                onClick={() => onMarkAsPaid(record.id)}
                                className="px-2.5 py-1 text-[10px] rounded-lg font-black text-emerald-400 hover:text-emerald-350 bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 hover:border-emerald-500/20 transition-all cursor-pointer"
                                title="Baixar Financeiro"
                                id={`btn-pay-${record.id}`}
                              >
                                Quitar
                              </button>
                            )}

                            <button
                              onClick={() => onSendReminder(record)}
                              className="p-1.5 rounded-xl text-violet-400 hover:text-violet-300 bg-violet-500/5 hover:bg-violet-500/10 border border-violet-500/10 hover:border-violet-500/20 transition-all cursor-pointer"
                              title="Enviar Lembrete WhatsApp"
                              id={`btn-remind-${record.id}`}
                            >
                              <MessageSquareShare className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => onEditRecord(record)}
                              className="p-1.5 rounded-xl text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700/80 border border-zinc-700/50 transition-all cursor-pointer"
                              title="Editar Cobrança"
                              id={`btn-edit-${record.id}`}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              onClick={() => onDeleteRecord(record.id)}
                              className="p-1.5 rounded-xl text-red-400 hover:text-red-300 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 hover:border-red-500/20 transition-all cursor-pointer"
                              title="Excluir Cobrança"
                              id={`btn-delete-${record.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>

                          </div>
                        </td>
                      </motion.tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-zinc-500 bg-zinc-950/20">
                      <div className="max-w-xs mx-auto">
                        <AlertTriangle className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                        <p className="text-sm font-bold text-zinc-400">Nenhum faturamento encontrado</p>
                        <p className="text-xs text-zinc-500 mt-1">
                          Nenhum registro corresponde aos filtros definidos.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* Dynamic bottom strip */}
        <div className="p-4 bg-zinc-950/40 border-t border-zinc-800 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 font-sans text-xs">
          
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-x-5 gap-y-2 text-zinc-400 font-bold leading-tight">
            <div>Total: <strong className="text-white">{formatCurrency(totals.total)}</strong></div>
            <div className="hidden sm:block text-zinc-800">|</div>
            <div>A vencer: <strong className="text-zinc-200">{formatCurrency(totals.aVencer)}</strong></div>
            <div className="hidden sm:block text-zinc-800">|</div>
            <div>Vencidos: <strong className="text-red-450">{formatCurrency(totals.vencidos)}</strong></div>
            <div className="hidden sm:block text-zinc-800">|</div>
            <div>Quitados: <strong className="text-emerald-400">{formatCurrency(totals.quitados)}</strong></div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2 px-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
            <div className="text-zinc-400 text-[11px] font-bold">
              Selecionados: <strong className="text-red-400">{selectedIds.length}</strong> {selectedIds.length > 0 && `(Total: ${formatCurrency(selectedSum)})`}
            </div>
            
            <div className="flex items-center gap-2 self-end">
              <button
                disabled={selectedIds.length === 0}
                onClick={() => alert(`Iniciada renegociação assistida para ${selectedIds.length} faturamentos.`)}
                className="px-3 py-1.5 text-[11px] font-bold tracking-tight rounded-lg bg-zinc-850 hover:bg-zinc-800 border border-zinc-700/60 text-zinc-200 disabled:opacity-40"
              >
                Renegociar
              </button>
              <button
                disabled={selectedIds.length === 0}
                onClick={() => {
                  selectedIds.forEach(id => onMarkAsPaid(id));
                  setSelectedIds([]);
                }}
                className="px-3 py-1.5 text-[11px] font-black tracking-tight rounded-lg bg-violet-600 hover:bg-violet-750 text-white disabled:opacity-40 shadow-md shadow-violet-550/20"
              >
                Quitar Seleção
              </button>
            </div>
          </div>

        </div>

        {/* Pagination Controls */}
        <div className="p-4 bg-zinc-950/20 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-zinc-500 text-xs font-bold">
            <span>Linhas por página:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="bg-zinc-950 border border-zinc-850 focus:border-violet-500 text-zinc-300 text-xs rounded-lg px-2.5 py-1 focus:outline-none cursor-pointer font-bold"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
            </select>
            <span className="ml-2 text-zinc-500">
              {processedRecords.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} - {Math.min(currentPage * itemsPerPage, processedRecords.length)} de {processedRecords.length}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-45 cursor-pointer text-zinc-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <div className="flex items-center gap-1 text-xs">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setCurrentPage(n)}
                  className={`w-8 h-8 rounded-xl font-bold transition-all ${
                    currentPage === n
                      ? 'bg-violet-650 text-white shadow-lg shadow-violet-900/40'
                      : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 border border-zinc-800 cursor-pointer'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>

            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-45 cursor-pointer text-zinc-400 hover:text-white transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>

    </div>
  );
}
