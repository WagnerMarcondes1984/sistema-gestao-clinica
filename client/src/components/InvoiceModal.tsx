import React from 'react';
import { useVertical } from '../contexts/VerticalContext';
import {
  Copy,
  FileCheck2,
  Printer,
  QrCode,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

interface InvoiceModalProps {
  transaction: any | null;
  isOpen: boolean;
  onClose: () => void;
}

export function InvoiceModal({ transaction, isOpen, onClose }: InvoiceModalProps) {
  const { currentVertical } = useVertical();

  if (!isOpen || !transaction) return null;

  const formatBRL = (cents: number) => {
    return (cents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  const invoiceNumber = transaction.invoiceNumber || 'NFS-2026/00918';
  const invoiceKey = transaction.invoiceKey || `NFS-SP-3550308-2026-09-${transaction.code?.replace(/\D/g, '') || '9912'}`;
  const issueDate = transaction.invoiceIssuedAt
    ? new Date(transaction.invoiceIssuedAt).toLocaleString('pt-BR')
    : new Date().toLocaleString('pt-BR');

  // Simulação de alíquotas fiscais de saúde
  const issAmount = Math.round(transaction.totalAmount * 0.02); // 2% ISS Saúde
  const pisAmount = Math.round(transaction.totalAmount * 0.0065); // 0.65% PIS
  const cofinsAmount = Math.round(transaction.totalAmount * 0.03); // 3% COFINS

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-zinc-800 max-w-2xl w-full overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-slate-50/80 dark:bg-zinc-900/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold">
              <FileCheck2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                NFS-e — Nota Fiscal de Serviços Eletrônica
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                  AUTORIZADA
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 font-mono">
                Número: {invoiceNumber} • Série 1
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
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

        {/* Invoice Layout */}
        <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-600 dark:text-zinc-300">
          {/* Prestador vs Tomador Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Prestador */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-800 space-y-1">
              <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block mb-1">
                PRESTADOR DE SERVIÇOS (EMISSOR)
              </span>
              <div className="font-bold text-slate-900 dark:text-white text-sm">
                {currentVertical.name}
              </div>
              <div className="text-[11px] text-slate-500">
                CNPJ: {currentVertical.cnpj}
              </div>
              <div className="text-[11px] text-slate-500">
                Inscrição Municipal: {currentVertical.municipalReg}
              </div>
              <div className="text-[11px] text-slate-500">
                {currentVertical.defaultUnit} — {currentVertical.city}
              </div>
            </div>

            {/* Tomador */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-800 space-y-1">
              <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block mb-1">
                TOMADOR DOS SERVIÇOS (PACIENTE)
              </span>
              <div className="font-bold text-slate-900 dark:text-white text-sm">
                {transaction.patientName}
              </div>
              <div className="text-[11px] text-slate-500 font-financial">
                CPF/CNPJ: {transaction.patientDocument}
              </div>
              <div className="text-[11px] text-slate-500">
                E-mail: {transaction.patientEmail || 'Não informado'}
              </div>
              <div className="text-[11px] text-slate-500">
                Telefone: {transaction.patientPhone || 'Não informado'}
              </div>
            </div>
          </div>

          {/* Discriminativo dos Serviços */}
          <div className="space-y-2">
            <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
              Discriminação dos Serviços Prestados
            </h4>
            <div className="p-4 rounded-2xl bg-white dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-800 space-y-2">
              <p className="font-medium text-slate-800 dark:text-zinc-200">
                {transaction.title}
              </p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Atendimento clínico especializado em saúde humana executado por{' '}
                <strong className="text-slate-700 dark:text-zinc-300">
                  {transaction.professionalName}
                </strong>
                . Código de Serviço Municipal: 04.01 — Medicina e Odontologia. Deduções Legais aplicadas conforme LC 116/2003.
              </p>
            </div>
          </div>

          {/* Quadro de Valores e Tributos */}
          <div className="bg-slate-50 dark:bg-zinc-800/40 rounded-2xl p-4 border border-slate-200 dark:border-zinc-800 space-y-3">
            <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">
              Quadro de Valores e Retenções Tributárias
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-slate-100 dark:border-zinc-700">
                <span className="text-[10px] text-slate-400 block">Valor Bruto</span>
                <span className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm font-financial">
                  {formatBRL(transaction.totalAmount)}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-slate-100 dark:border-zinc-700">
                <span className="text-[10px] text-slate-400 block">ISSQN (2%)</span>
                <span className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm font-financial">
                  {formatBRL(issAmount)}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-white dark:bg-zinc-800 border border-slate-100 dark:border-zinc-700">
                <span className="text-[10px] text-slate-400 block">PIS / COFINS</span>
                <span className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm font-financial">
                  {formatBRL(pisAmount + cofinsAmount)}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                <span className="text-[10px] text-emerald-700 dark:text-emerald-300 block">Valor Líquido</span>
                <span className="font-bold text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm font-financial">
                  {formatBRL(transaction.totalAmount)}
                </span>
              </div>
            </div>
          </div>

          {/* Chave de Acesso & QR Code */}
          <div className="p-4 rounded-2xl bg-white dark:bg-zinc-800 border border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">
                Chave de Verificação e Autenticidade Municipal
              </span>
              <p className="font-mono text-xs font-semibold text-slate-900 dark:text-white break-all">
                {invoiceKey}
              </p>
              <p className="text-[10px] text-slate-500">
                Emitida em {issueDate} • Assinatura Eletrônica ICP-Brasil válida
              </p>
            </div>
            <div className="shrink-0 w-14 h-14 bg-slate-100 dark:bg-zinc-700 rounded-xl flex items-center justify-center text-slate-600 dark:text-zinc-300">
              <QrCode className="w-8 h-8" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-zinc-900 border-t border-slate-100 dark:border-zinc-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-800 transition-colors"
          >
            Fechar
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(invoiceKey);
              toast.success('Chave de acesso da NFS-e copiada com sucesso!');
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-white text-white dark:text-zinc-900 transition-opacity hover:opacity-90"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copiar Chave NFS-e</span>
          </button>
        </div>
      </div>
    </div>
  );
}
