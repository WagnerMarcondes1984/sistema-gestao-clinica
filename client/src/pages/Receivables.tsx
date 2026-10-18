import React, { useState } from 'react';
import { Link } from 'wouter';
import { trpc } from '../lib/trpc';
import { useVertical } from '../contexts/VerticalContext';
import { FinancialLayout } from '../components/FinancialLayout';
import {
  AlertCircle,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  DollarSign,
  FileText,
  Plus,
  QrCode,
  RefreshCw,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';

export default function Receivables() {
  const { currentVertical, verticalCode } = useVertical();
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'OVERDUE'>('ALL');
  const utils = trpc.useUtils();

  const { data: allTransactions, isLoading } = trpc.transactions.list.useQuery({
    verticalCode,
    limit: 100,
  });

  const confirmMutation = trpc.transactions.confirm.useMutation({
    onSuccess: (data) => {
      toast.success(`Cobrança ${data?.code} liquidada com sucesso! NFS-e emitida.`);
      utils.transactions.list.invalidate();
      utils.dashboard.metrics.invalidate();
    },
    onError: (err) => {
      toast.error(`Erro: ${err.message}`);
    },
  });

  const receivables = allTransactions?.filter((t) => {
    if (filter === 'ALL') return t.status === 'PENDING' || t.status === 'OVERDUE';
    return t.status === filter;
  }) || [];

  const formatBRL = (cents: number = 0) => {
    return (cents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  const totalPending = allTransactions
    ?.filter((t) => t.status === 'PENDING')
    .reduce((acc, curr) => acc + curr.totalAmount, 0) || 0;

  const totalOverdue = allTransactions
    ?.filter((t) => t.status === 'OVERDUE')
    .reduce((acc, curr) => acc + curr.totalAmount, 0) || 0;

  return (
    <FinancialLayout>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold font-display text-slate-900 dark:text-white flex items-center gap-2">
            Contas a Receber
            <span
              className="px-2.5 py-0.5 rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: currentVertical.primaryColor }}
            >
              {currentVertical.badge}
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Controle de créditos em aberto, vencimentos futuros e régua de cobrança clínica
          </p>
        </div>

        <Link
          href="/checkout"
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-white px-4 py-2 rounded-xl shadow-sm transition-all hover:brightness-110 active:scale-95 self-start md:self-auto"
          style={{ backgroundColor: currentVertical.primaryColor }}
        >
          <Plus className="w-4 h-4" />
          <span>Novo Recebimento</span>
        </Link>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs">
          <span className="text-xs text-slate-400 font-semibold uppercase">Total em Aberto</span>
          <div className="text-xl font-extrabold text-slate-900 dark:text-white font-financial mt-1">
            {formatBRL(totalPending + totalOverdue)}
          </div>
          <span className="text-[11px] text-slate-500">{receivables.length} títulos pendentes</span>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs">
          <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold uppercase">A Vencer (No Prazo)</span>
          <div className="text-xl font-extrabold text-amber-700 dark:text-amber-400 font-financial mt-1">
            {formatBRL(totalPending)}
          </div>
          <span className="text-[11px] text-amber-600">Cobranças ativas com QR Code</span>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs">
          <span className="text-xs text-red-600 dark:text-red-400 font-semibold uppercase">Vencidos (Inadimplência)</span>
          <div className="text-xl font-extrabold text-red-700 dark:text-red-400 font-financial mt-1">
            {formatBRL(totalOverdue)}
          </div>
          <span className="text-[11px] text-red-600">Requer reenvio ou contato</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4 text-xs font-semibold">
        <button
          onClick={() => setFilter('ALL')}
          className={`px-3 py-1.5 rounded-xl border transition-colors ${
            filter === 'ALL'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-zinc-900 border-slate-900 dark:border-white'
              : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-800'
          }`}
        >
          Todos ({allTransactions?.filter((t) => t.status === 'PENDING' || t.status === 'OVERDUE').length || 0})
        </button>
        <button
          onClick={() => setFilter('PENDING')}
          className={`px-3 py-1.5 rounded-xl border transition-colors ${
            filter === 'PENDING'
              ? 'bg-amber-600 text-white border-amber-600'
              : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-800'
          }`}
        >
          Apenas Pendentes
        </button>
        <button
          onClick={() => setFilter('OVERDUE')}
          className={`px-3 py-1.5 rounded-xl border transition-colors ${
            filter === 'OVERDUE'
              ? 'bg-red-600 text-white border-red-600'
              : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-800'
          }`}
        >
          Apenas Vencidos
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 dark:bg-zinc-800/50 text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
              <tr>
                <th className="py-3 px-6">Código</th>
                <th className="py-3 px-4">Paciente & Contato</th>
                <th className="py-3 px-4">Procedimento</th>
                <th className="py-3 px-4">Vencimento</th>
                <th className="py-3 px-4">Forma</th>
                <th className="py-3 px-4">Valor</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-6 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
              {receivables.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Nenhuma conta a receber pendente. Parabéns, caixa 100% adimplente!
                  </td>
                </tr>
              ) : (
                receivables.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/30">
                    <td className="py-3.5 px-6 font-mono font-bold text-slate-900 dark:text-white">
                      {tx.code}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-800 dark:text-zinc-200">
                        {tx.patientName}
                      </div>
                      <div className="text-[11px] text-slate-400 font-financial">
                        {tx.patientPhone || tx.patientEmail || tx.patientDocument}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 max-w-xs truncate">{tx.title}</td>
                    <td className="py-3.5 px-4 font-financial">
                      {new Date(tx.dueDate).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="py-3.5 px-4 font-semibold">{tx.paymentMethod}</td>
                    <td className="py-3.5 px-4 font-extrabold text-slate-900 dark:text-white font-financial text-sm">
                      {formatBRL(tx.totalAmount)}
                    </td>
                    <td className="py-3.5 px-4">
                      {tx.status === 'OVERDUE' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                          VENCIDO
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          PENDENTE
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(
                              `Olá ${tx.patientName}, segue seu link para liquidação da consulta na ${currentVertical.name}: https://fluxa.med.br/pay/${tx.code}`
                            );
                            toast.success('Mensagem de cobrança copiada para envio ao paciente!');
                          }}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800"
                          title="Copiar Mensagem de Cobrança"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={confirmMutation.isPending}
                          onClick={() => confirmMutation.mutate({ code: tx.code })}
                          className="px-3 py-1 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                        >
                          Dar Baixa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </FinancialLayout>
  );
}
