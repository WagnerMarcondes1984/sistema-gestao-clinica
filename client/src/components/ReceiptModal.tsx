import React from 'react';
import { useVertical } from '../contexts/VerticalContext';
import {
  CheckCircle2,
  Copy,
  FileText,
  Printer,
  ShieldCheck,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

interface ReceiptModalProps {
  transaction: any | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ReceiptModal({ transaction, isOpen, onClose }: ReceiptModalProps) {
  const { currentVertical } = useVertical();

  if (!isOpen || !transaction) return null;

  const formatBRL = (cents: number) => {
    return (cents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(transaction.code);
    toast.success('Código do comprovante copiado com sucesso!');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-zinc-800 max-w-xl w-full overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-50/80 dark:bg-zinc-900/80">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold"
              style={{ backgroundColor: currentVertical.primaryColor }}
            >
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Comprovante Oficial de Pagamento
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Protocolo: {transaction.code}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
              title="Imprimir Comprovante"
            >
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Body */}
        <div id="printable-receipt" className="p-6 overflow-y-auto space-y-6 text-xs text-slate-600 dark:text-zinc-300">
          {/* Header Receipt Banner */}
          <div className="text-center pb-5 border-b border-dashed border-slate-200 dark:border-zinc-800">
            <div
              className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-3 text-white"
              style={{ backgroundColor: currentVertical.primaryColor }}
            >
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold font-display text-slate-900 dark:text-white">
              {currentVertical.name}
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              {currentVertical.defaultUnit} • CNPJ: {currentVertical.cnpj}
            </p>
            <p className="text-[11px] text-slate-400">
              Inscrição Municipal: {currentVertical.municipalReg} • {currentVertical.council}
            </p>
            <div className="mt-3 inline-block px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 text-xs font-semibold border border-emerald-200 dark:border-emerald-800">
              PAGAMENTO CONFIRMADO
            </div>
          </div>

          {/* Amount Box */}
          <div className="bg-slate-50 dark:bg-zinc-800/60 rounded-2xl p-4 text-center border border-slate-100 dark:border-zinc-800">
            <span className="text-xs font-medium text-slate-400 block mb-1">
              VALOR TOTAL LIQUIDADO
            </span>
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-financial">
              {formatBRL(transaction.paidAmount || transaction.totalAmount)}
            </span>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-zinc-400 flex items-center justify-center gap-2">
              <span>Método: {transaction.paymentMethod}</span>
              {transaction.installments > 1 && (
                <span>• {transaction.installments}x de {formatBRL(transaction.installmentValue || Math.round(transaction.totalAmount / transaction.installments))}</span>
              )}
            </div>
          </div>

          {/* Details Table */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
              Dados do Atendimento
            </h4>
            <div className="bg-white dark:bg-zinc-800/40 rounded-xl border border-slate-200 dark:border-zinc-800 divide-y divide-slate-100 dark:divide-zinc-800">
              <div className="flex justify-between py-2 px-3">
                <span className="text-slate-400">Paciente:</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {transaction.patientName}
                </span>
              </div>
              <div className="flex justify-between py-2 px-3">
                <span className="text-slate-400">CPF:</span>
                <span className="font-semibold text-slate-900 dark:text-white font-financial">
                  {transaction.patientDocument}
                </span>
              </div>
              <div className="flex justify-between py-2 px-3">
                <span className="text-slate-400">Profissional:</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {transaction.professionalName}
                </span>
              </div>
              <div className="flex justify-between py-2 px-3">
                <span className="text-slate-400">Procedimento/Serviço:</span>
                <span className="font-semibold text-slate-900 dark:text-white text-right max-w-[280px]">
                  {transaction.title}
                </span>
              </div>
              <div className="flex justify-between py-2 px-3">
                <span className="text-slate-400">Data/Hora da Baixa:</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {transaction.paidAt
                    ? new Date(transaction.paidAt).toLocaleString('pt-BR')
                    : new Date(transaction.createdAt).toLocaleString('pt-BR')}
                </span>
              </div>
              {transaction.nsu && (
                <div className="flex justify-between py-2 px-3">
                  <span className="text-slate-400">NSU / Autorização:</span>
                  <span className="font-semibold text-slate-900 dark:text-white font-mono">
                    {transaction.nsu} / {transaction.authorizationCode || 'N/A'}
                  </span>
                </div>
              )}
              {transaction.invoiceNumber && (
                <div className="flex justify-between py-2 px-3">
                  <span className="text-slate-400">Documento Fiscal:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {transaction.invoiceNumber} (NFS-e Emitida)
                  </span>
                </div>
              )}
              {transaction.operatorName && (
                <div className="flex justify-between py-2 px-3">
                  <span className="text-slate-400">Operador do Caixa:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {transaction.operatorName}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Security & Authentication Token */}
          <div className="pt-2 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5 text-slate-500 dark:text-zinc-400">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Autenticação Digital: SHA256-{(transaction.code || 'TX').toUpperCase()}</span>
            </div>
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1 text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copiar</span>
            </button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 dark:bg-zinc-900 border-t border-slate-100 dark:border-zinc-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-800 transition-colors"
          >
            Fechar
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-opacity hover:opacity-90 shadow-sm"
            style={{ backgroundColor: currentVertical.primaryColor }}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir Comprovante</span>
          </button>
        </div>
      </div>
    </div>
  );
}
