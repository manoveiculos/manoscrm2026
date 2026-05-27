import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, FileSpreadsheet, Check, AlertCircle, RefreshCw, HelpCircle, Download, Upload } from 'lucide-react';
import Papa from 'papaparse';
import { BillingRecord } from '@/types';

interface CsvImporterProps {
  onRecordsImported: (newRecords: Omit<BillingRecord, 'id' | 'status'>[]) => Promise<void>;
  onClose?: () => void;
}

export default function CsvImporter({ onRecordsImported, onClose }: CsvImporterProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = () => {
    const csvContent = 
      "CLIENTE/FORNECEDOR;CPF/CNPJ;TELEFONE;VEICULO;VENCIMENTO;VALOR\n" +
      "André Luiz Rodrigues;111.222.333-44;(47) 99185-3163;Fiat Argo Trekking 2023;2026-06-05;1550,00\n" +
      "Distribuidora Polar S/A;44.555.666/0001-22;(47) 98828-8165;Volkswagen Delivery 2022;2026-06-10;4800,50\n" +
      "Fernanda Costa de Jesus;222.333.444-55;(47) 98900-5385;Chevrolet Tracker Premier 2022;2026-05-15;2100,00\n" +
      "Empresa de Transportes Rápido Brasil;12.888.999/0001-00;(47) 99171-5198;Mercedes-Benz Sprinter 2021;2026-05-20;3850,75";

    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "modelo_cobrancas.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const validateFile = (selectedFile: File): boolean => {
    setError(null);
    setSuccessCount(null);
    
    const isCsv = selectedFile.name.endsWith('.csv') || selectedFile.type === 'text/csv' || selectedFile.type === 'application/vnd.ms-excel';
    if (!isCsv) {
      setError('Por favor, selecione apenas arquivos com extensão .csv');
      return false;
    }
    
    if (selectedFile.size > 5 * 1024 * 1024) {
      setError('O arquivo excede o limite máximo de 5MB.');
      return false;
    }
    
    setFile(selectedFile);
    return true;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateFile(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const processPlanSheat = () => {
    if (!file) return;
    
    setImporting(true);
    setError(null);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      
      let separator = ';';
      if (text.includes(';') && !text.includes(',')) {
        separator = ';';
      } else if (text.includes(',') && !text.includes(';')) {
        separator = ',';
      } else {
        const firstLine = text.split('\n')[0] || '';
        const semicolons = (firstLine.match(/;/g) || []).length;
        const commas = (firstLine.match(/,/g) || []).length;
        separator = semicolons >= commas ? ';' : ',';
      }

      Papa.parse<any>(text, {
        header: true,
        skipEmptyLines: true,
        delimiter: separator,
        complete: async (results) => {
          try {
            const rawRows = results.data;
            if (!rawRows || rawRows.length === 0) {
              setImporting(false);
              setError('O arquivo CSV está vazio ou em formato inválido.');
              return;
            }

            const cleanRows: Omit<BillingRecord, 'id' | 'status'>[] = [];
            const missingColumns: string[] = [];
            
            const firstRow = rawRows[0];
            const originalKeys = Object.keys(firstRow);
            
            const findKeyByTerms = (terms: string[]): string | undefined => {
              const upperTerms = terms.map(t => t.toUpperCase());
              
              for (const term of upperTerms) {
                const found = originalKeys.find(key => {
                  const kClean = key.trim().toUpperCase();
                  return kClean === term || 
                         kClean.replace('_', '/') === term || 
                         kClean.replace('-', '/') === term;
                });
                if (found) return found;
              }
              
              for (const term of upperTerms) {
                const found = originalKeys.find(key => {
                  const kClean = key.trim().toUpperCase();
                  return kClean.includes(term);
                });
                if (found) return found;
              }
              
              return undefined;
            };

            const clientKey = findKeyByTerms(['CLIENTE/FORNECEDOR', 'CLIENTE', 'FORNECEDOR', 'NOME']);
            const documentKey = findKeyByTerms(['CPF/CNPJ', 'CPF', 'CNPJ', 'DOCUMENTO']);
            const phoneKey = findKeyByTerms(['TELEFONE', 'FONE', 'CELULAR', 'TELEFONE/CELULAR']);
            const vehicleKey = findKeyByTerms(['VEICULO', 'CARRO', 'VEÍCULO', 'PLACA']);
            const dueDateKey = findKeyByTerms(['VENCIMENTO', 'DATA VENCIMENTO', 'DATA']);
            const valueKey = findKeyByTerms(['VALOR', 'PREÇO', 'PRECO', 'TOTAL']);

            if (!clientKey) missingColumns.push('CLIENTE/FORNECEDOR');
            if (!documentKey) missingColumns.push('CPF/CNPJ');
            if (!phoneKey) missingColumns.push('TELEFONE');
            if (!vehicleKey) missingColumns.push('VEICULO');
            if (!dueDateKey) missingColumns.push('VENCIMENTO');
            if (!valueKey) missingColumns.push('VALOR');

            if (missingColumns.length > 0) {
              setImporting(false);
              setError(`Colunas não encontradas no CSV: ${missingColumns.join(', ')}. Use o modelo padrão para compatibilidade.`);
              return;
            }

            rawRows.forEach((row) => {
              const rawValStr = String(row[valueKey!] || '0');
              const cleanValStr = rawValStr
                .replace(/\s/g, '')
                .replace(/\./g, '')
                .replace(',', '.');
              const parsedVal = parseFloat(cleanValStr) || 0;

              let dueDateStr = String(row[dueDateKey!] || '').trim();
              const brDateMatch = dueDateStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
              if (brDateMatch) {
                const day = brDateMatch[1].padStart(2, '0');
                const month = brDateMatch[2].padStart(2, '0');
                const year = brDateMatch[3];
                dueDateStr = `${year}-${month}-${day}`;
              }

              cleanRows.push({
                clienteFornecedor: String(row[clientKey!] || '').trim(),
                cpfCnpj: String(row[documentKey!] || '').trim(),
                telefone: String(row[phoneKey!] || '').trim(),
                veiculo: String(row[vehicleKey!] || '').trim(),
                vencimento: dueDateStr,
                valor: parsedVal
              });
            });

            if (cleanRows.length === 0) {
              setImporting(false);
              setError('Nenhuma linha pôde ser convertida adequadamente do arquivo.');
              return;
            }

            await onRecordsImported(cleanRows);
            setSuccessCount(cleanRows.length);
            setFile(null);
            
            setTimeout(() => {
              setSuccessCount(null);
              if (onClose) onClose();
            }, 3000);
          } catch (err: any) {
            console.error(err);
            setError(`Ocorreu um erro no processamento: ${err.message || err}`);
          } finally {
            setImporting(false);
          }
        },
        error: (err: any) => {
          setImporting(false);
          setError(`Erro ao ler planilha: ${err.message}`);
        }
      });
    };
    reader.onerror = () => {
      setImporting(false);
      setError('Falha ao abrir a planilha de cobranças.');
    };
    reader.readAsText(file);
  };

  const handleClear = () => {
    setFile(null);
    setError(null);
    setSuccessCount(null);
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl max-w-2xl mx-auto shadow-2xl relative" id="csv-importer-container">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-violet-500" />
            Importação de Planilha Mensal (CSV)
          </h2>
          <p className="text-zinc-400 text-xs mt-1">
            Selecione ou solte a planilha de faturamentos de veículos.
          </p>
        </div>
        <button
          onClick={handleDownloadTemplate}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700/80 border border-zinc-700/50 rounded-xl text-xs text-zinc-200 font-bold transition-colors cursor-pointer"
          id="btn-download-template"
        >
          <Download className="w-3.5 h-3.5" />
          Modelo CSV
        </button>
      </div>

      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center transition-all ${
          dragActive 
            ? 'border-violet-500 bg-violet-500/5' 
            : file 
            ? 'border-emerald-500 bg-emerald-500/5' 
            : 'border-zinc-800 hover:border-zinc-700 bg-zinc-950/30 hover:bg-zinc-950/50'
        }`}
        id="drag-drop-zone"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="hidden"
          id="csv-file-input"
        />

        {!file ? (
          <>
            <div className="p-4 rounded-full bg-zinc-900 border border-zinc-800 mb-4 text-violet-400 shadow-xl">
              <UploadCloud className="w-8 h-8" />
            </div>
            <p className="text-sm font-bold text-zinc-200">
              Arraste seu arquivo CSV ou{' '}
              <button 
                onClick={triggerFileInput} 
                className="text-violet-400 hover:text-violet-300 underline font-black cursor-pointer bg-transparent border-none p-0 inline"
              >
                clique para buscar
              </button>
            </p>
            <p className="text-xs text-zinc-500 mt-2">
              Delimitador aceito: <code className="bg-zinc-900 px-1.5 py-0.5 rounded text-zinc-300 font-mono font-bold">;</code> ou <code className="bg-zinc-900 px-1.5 py-0.5 rounded text-zinc-300 font-mono font-bold">,</code> (Máx: 5MB)
            </p>
          </>
        ) : (
          <div className="flex flex-col items-center">
            <div className="p-4 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-4 text-emerald-400">
              <FileSpreadsheet className="w-8 h-8" />
            </div>
            <p className="text-sm font-black text-white">{file.name}</p>
            <p className="text-xs text-zinc-400 mt-1">
              {(file.size / 1024).toFixed(1)} KB — Pronto para submissão
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={handleClear}
                className="px-4 py-2 text-xs font-bold text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700/80 border border-zinc-700/50 rounded-xl transition-all"
                disabled={importing}
              >
                Cancelar
              </button>
              <button
                onClick={processPlanSheat}
                disabled={importing}
                className="px-5 py-2 text-xs text-white font-black bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 rounded-xl shadow-lg shadow-violet-550/20 transition-all flex items-center gap-1.5 cursor-pointer"
                id="btn-process-sheet"
              >
                {importing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5" />
                    Enviar Planilha
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden"
          >
            <div className="flex items-start gap-3 p-4 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
              <div>
                <p className="font-black text-red-300">Erro ao processar planilha</p>
                <p className="mt-1 text-red-450 leading-relaxed font-mono text-[10.5px]">{error}</p>
              </div>
            </div>
          </motion.div>
        )}

        {successCount !== null && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden"
          >
            <div className="flex items-start gap-3 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-xs animate-fade-in">
              <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
              <div>
                <p className="font-black text-emerald-300">Processado com sucesso</p>
                <p className="mt-1 text-emerald-450">
                  Carregadas <strong>{successCount} cobranças</strong> diretamente no Supabase! Duplicidades foram ignoradas para proteção.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-5 p-4 rounded-xl bg-zinc-950/40 border border-zinc-800/80 text-[11px] text-zinc-400 flex items-start gap-2.5 leading-relaxed">
        <HelpCircle className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
        <div>
          <span className="text-zinc-200 font-bold">Colunas Obrigatórias:</span> A planilha deve conter exatamente os cabeçalhos de identificação: <code className="bg-zinc-900 border border-zinc-850 px-1 py-0.2 rounded text-zinc-300 font-mono font-bold">CLIENTE/FORNECEDOR</code>, <code className="bg-zinc-900 border border-zinc-850 px-1 py-0.2 rounded text-zinc-300 font-mono font-bold">CPF/CNPJ</code>, <code className="bg-zinc-900 border border-zinc-850 px-1 py-0.2 rounded text-zinc-300 font-mono font-bold">TELEFONE</code>, <code className="bg-zinc-900 border border-zinc-850 px-1 py-0.2 rounded text-zinc-300 font-mono font-bold">VEICULO</code>, <code className="bg-zinc-900 border border-zinc-850 px-1 py-0.2 rounded text-zinc-300 font-mono font-bold">VENCIMENTO</code> e <code className="bg-zinc-900 border border-zinc-850 px-1 py-0.2 rounded text-zinc-300 font-mono font-bold">VALOR</code>.
        </div>
      </div>
    </div>
  );
}
