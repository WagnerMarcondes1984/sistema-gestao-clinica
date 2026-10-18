import React, { useState } from 'react';
import { Link } from 'wouter';
import { trpc } from '../lib/trpc';
import { useVertical } from '../contexts/VerticalContext';
import { FinancialLayout } from '../components/FinancialLayout';
import { ReceiptModal } from '../components/ReceiptModal';
import { InvoiceModal } from '../components/InvoiceModal';
import {
  AlertCircle,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  FileCheck2,
  FileText,
  Filter,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

export default function Transactions() {
  const { currentVertical, verticalCode } = useVertical();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [methodFilter, setMethodFilter] = useState('ALL');
  const [selectedReceiptTx, setSelectedReceiptTx] = useState<any | null>(null);
  const [selectedInvoiceTx, setSelectedInvoiceTx] = useState<any | null>(null);
  const [refundTargetTx, setRefundTargetTx] = useState<any | null>(null);
  const [refundReason, setRefundReason] = useState('');

  const utils = trpc.useUtils();

  const { data: transactions, isLoading } = trpc.transactions.list.useQuery({
    verticalCode,
    status: statusFilter,
    paymentMethod: methodFilter,
    search,
    limit: 100,
  });

  const confirmMutation = trpc.transactions.confirm.useMutation({
    onSuccess: (data) => {
      toast.success(`Pagamento da cobrança ${data?.code} confirmado! NFS-e emitida.`);
      utils.transactions.list.invalidate();
      utils.dashboard.metrics.invalidate();
    },
    onError: (err) => {
      toast.error(`Erro ao confirmar: ${err.message}`);
    },
  });

  const webhookMutation = trpc.transactions.simulateWebhook.useMutation({
    onSuccess: (res) => {
      toast.success('Confirmação bancária simulada via webhook com sucesso!');
      utils.transactions.list.invalidate();
      utils.dashboard.metrics.invalidate();
    },
  });

  const refundMutation = trpc.transactions.refund.useMutation({
    onSuccess: (data) => {
      toast.success(`Cobrança ${data?.code} estornada com sucesso.`);
      setRefundTargetTx(null);
      setRefundReason('');
      utils.transactions.list.invalidate();
      utils.dashboard.metrics.invalidate();
    },
    onError: (err) => {
      toast.error(`Erro ao processar estorno: ${err.message}`);
    },
  });

  const formatBRL = (cents: number = 0) => {
    return (cents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3 h-3" />
            Pago
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <Clock className="w-3 h-3 animate-pulse" />
            Pendente
          </span>
        );
      case 'OVERDUE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800">
            <AlertCircle className="w-3 h-3" />
            Vencido
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-300 dark:border-zinc-700">
            <XCircle className="w-3 h-3" />
            Falhou
          </span>
        );
      case 'REFUNDED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            <RotateCcw className="w-3 h-3" />
            Estornado
          </span>
        );
      default:
        return <span className="text-xs">{status}</span>;
    }
  };

  const totalFilteredAmount = transactions?.reduce((acc, curr) => acc + curr.totalAmount, 0) || 0;
  const totalPaidFiltered = transactions?.filter(t => t.status === 'PAID').reduce((acc, curr) => acc + (curr.paidAmount || curr.totalAmount), 0) || 0;

  return (
    <FinancialLayout>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold font-display text-slate-900 dark:text-white flex items-center gap-2">
            Transações & Cobranças Clínicas
            <span
              className="px-2.5 py-0.5 rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: currentVertical.primaryColor }}
            >
              {currentVertical.badge}
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Acompanhamento integral das cobranças, status de liquidação, comprovantes e NFS-e
          </p>
        </div>

        <Link
          href="/checkout"
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-white px-4 py-2 rounded-xl shadow-sm transition-all hover:brightness-110 active:scale-95 self-start md:self-auto"
          style={{ backgroundColor: currentVertical.primaryColor }}
        >
          <Plus className="w-4 h-4" />
          <span>Nova Cobrança no Caixa</span>
        </Link>
      </div>

      {/* Summary Filter Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs">
          <span className="text-xs text-slate-400 font-semibold uppercase">Total das Cobranças Filtradas</span>
          <div className="text-xl font-extrabold text-slate-900 dark:text-white font-financial mt-1">
            {formatBRL(totalFilteredAmount)}
          </div>
          <span className="text-[11px] text-slate-500">{transactions?.length || 0} lançamentos</span>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs">
          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold uppercase">Total Liquidado (Pago)</span>
          <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400 font-financial mt-1">
            {formatBRL(totalPaidFiltered)}
          </div>
          <span className="text-[11px] text-emerald-600">Comprovantes & NFS-e emitidos</span>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs">
          <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold uppercase">Pendente de Recebimento</span>
          <div className="text-xl font-extrabold text-amber-700 dark:text-amber-400 font-financial mt-1">
            {formatBRL(totalFilteredAmount - totalPaidFiltered)}
          </div>
          <span className="text-[11px] text-amber-600">Aguardando baixa bancária</span>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-slate-200 dark:border-zinc-800 shadow-xs mb-6 space-y-3">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por paciente, CPF, código (ex: COB-2026) ou procedimento..."
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-auto text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3 py-2 text-slate-700 dark:text-zinc-200 focus:outline-none"
          >
            <option value="ALL">Todos os Estados de Pagamento</option>
            <option value="PAID">Pago</option>
            <option value="PENDING">Pendente</option>
            <option value="OVERDUE">Vencido</option>
            <option value="FAILED">Falhou</option>
            <option value="REFUNDED">Estornado</option>
          </select>

          {/* Method Filter */}
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="w-full sm:w-auto text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3 py-2 text-slate-700 dark:text-zinc-200 focus:outline-none"
          >
            <option value="ALL">Todas as Formas de Pagamento</option>
            <option value="PIX">PIX</option>
            <option value="CREDIT_CARD">Cartão de Crédito</option>
            <option value="DEBIT_CARD">Cartão de Débito</option>
            <option value="BOLETO">Boleto</option>
            <option value="CASH">Dinheiro</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 dark:bg-zinc-800/50 text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
              <tr>
                <th className="py-3 px-6">Código / Data</th>
                <th className="py-3 px-4">Paciente & Documento</th>
                <th className="py-3 px-4">Procedimento</th>
                <th className="py-3 px-4">Forma</th>
                <th className="py-3 px-4">Total</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">NFS-e</th>
                <th className="py-3 px-6 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
              {transactions?.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Nenhuma transação encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                transactions?.map((tx) => (
                  <tr
                    key={tx.id}
                    className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/30 transition-colors"
                  >
                    <td className="py-3.5 px-6 font-mono font-semibold text-slate-900 dark:text-white">
                      <div>{tx.code}</div>
                      <div className="text-[10px] text-slate-400 font-sans font-normal">
                        {new Date(tx.createdAt).toLocaleDateString('pt-BR')}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-800 dark:text-zinc-200">
                        {tx.patientName}
                      </div>
                      <div className="text-[11px] text-slate-400 font-financial">
                        {tx.patientDocument}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="font-medium text-slate-800 dark:text-zinc-200 truncate">
                        {tx.title}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {tx.professionalName}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-700 dark:text-zinc-300">
                      <span className="inline-flex items-center gap-1.5">
                        {tx.paymentMethod === 'PIX' ? (
                          <QrCode className="w-3.5 h-3.5 text-teal-600" />
                        ) : tx.paymentMethod === 'CREDIT_CARD' || tx.paymentMethod === 'DEBIT_CARD' ? (
                          <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                        ) : tx.paymentMethod === 'BOLETO' ? (
                          <FileText className="w-3.5 h-3.5 text-amber-600" />
                        ) : (
                          <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                        {tx.paymentMethod}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white font-financial text-sm">
                      {formatBRL(tx.totalAmount)}
                    </td>
                    <td className="py-3.5 px-4">{getStatusBadge(tx.status)}</td>
                    <td className="py-3.5 px-4">
                      {tx.invoiceNumber ? (
                        <button
                          onClick={() => setSelectedInvoiceTx(tx)}
                          className="text-emerald-600 hover:underline font-mono text-[11px] flex items-center gap-1"
                        >
                          <FileCheck2 className="w-3.5 h-3.5" />
                          {tx.invoiceNumber}
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">Não emitida</span>
                      )}
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {tx.status === 'PAID' && (
                          <>
                            <button
                              type="button"
                              onClick={() => setSelectedReceiptTx(tx)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                              title="Ver Comprovante Oficial"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedInvoiceTx(tx)}
                              className="p-1.5 rounded-lg text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors"
                              title="Ver NFS-e Autorizada"
                            >
                              <FileCheck2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRefundTargetTx(tx)}
                              className="p-1.5 rounded-lg text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-colors"
                              title="Estornar Cobrança"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          </>
                        )}

                        {tx.status === 'PENDING' && (
                          <button
                            type="button"
                            onClick={() => webhookMutation.mutate({ code: tx.code })}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-xs"
                            title="Simular Webhook Bancário"
                          >
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Simular Baixa
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Justificativa de Estorno */}
      {refundTargetTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-zinc-800 max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4 text-purple-600">
              <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/50 flex items-center justify-center">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Estornar Cobrança
                </h3>
                <p className="text-xs text-slate-500">
                  Protocolo: {refundTargetTx.code} • {formatBRL(refundTargetTx.totalAmount)}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                  Justificativa Operacional do Estorno:
                </label>
                <textarea
                  required
                  rows={3}
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Informe o motivo para o cancelamento da NFS-e e auditoria..."
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 p-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRefundTargetTx(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-zinc-400"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={refundMutation.isPending}
                  onClick={() => {
                    if (!refundReason.trim()) {
                      toast.error('Informe a justificativa do estorno.');
                      return;
                    }
                    refundMutation.mutate({
                      code: refundTargetTx.code,
                      reason: refundReason,
                    });
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-sm"
                >
                  {refundMutation.isPending ? 'Processando...' : 'Confirmar Estorno'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modais */}
      <ReceiptModal
        transaction={selectedReceiptTx}
        isOpen={Boolean(selectedReceiptTx)}
        onClose={() => setSelectedReceiptTx(null)}
      />

      <InvoiceModal
        transaction={selectedInvoiceTx}
        isOpen={Boolean(selectedInvoiceTx)}
        onClose={() => setSelectedInvoiceTx(null)}
      />
    </FinancialLayout>
  );
}
