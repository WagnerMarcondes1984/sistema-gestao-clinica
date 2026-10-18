import React, { useState } from 'react';
import { trpc } from '../lib/trpc';
import { useVertical } from '../contexts/VerticalContext';
import { FinancialLayout } from '../components/FinancialLayout';
import {
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

export default function Payables() {
  const { currentVertical, verticalCode } = useVertical();
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'PAID'>('ALL');
  const utils = trpc.useUtils();

  const { data: payables } = trpc.accountsPayable.list.useQuery({
    verticalCode,
    status: statusFilter === 'ALL' ? undefined : statusFilter,
  });

  const payMutation = trpc.accountsPayable.pay.useMutation({
    onSuccess: () => {
      toast.success('Despesa quitada com sucesso!');
      utils.accountsPayable.list.invalidate();
      utils.dashboard.metrics.invalidate();
    },
    onError: (err) => {
      toast.error(`Erro: ${err.message}`);
    },
  });

  const formatBRL = (cents: number = 0) => {
    return (cents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  const totalPending = payables
    ?.filter((p) => p.status === 'PENDING' || p.status === 'OVERDUE')
    .reduce((acc, curr) => acc + curr.amount, 0) || 0;

  const totalPaid = payables
    ?.filter((p) => p.status === 'PAID')
    .reduce((acc, curr) => acc + curr.amount, 0) || 0;

  return (
    <FinancialLayout>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold font-display text-slate-900 dark:text-white flex items-center gap-2">
            Contas a Pagar & Fornecedores
            <span
              className="px-2.5 py-0.5 rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: currentVertical.primaryColor }}
            >
              {currentVertical.badge}
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Gestão de despesas operacionais, insumos clínicos, materiais e repasses aos profissionais
          </p>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs">
          <span className="text-xs text-slate-400 font-semibold uppercase">Total a Pagar (Aberto)</span>
          <div className="text-xl font-extrabold text-rose-600 dark:text-rose-400 font-financial mt-1">
            {formatBRL(totalPending)}
          </div>
          <span className="text-[11px] text-slate-500">Insumos e fornecedores</span>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs">
          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold uppercase">Total Liquidado (Mês)</span>
          <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-400 font-financial mt-1">
            {formatBRL(totalPaid)}
          </div>
          <span className="text-[11px] text-emerald-600">Comprovantes anexados</span>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs">
          <span className="text-xs text-slate-400 font-semibold uppercase">Volume de Fornecedores</span>
          <div className="text-xl font-extrabold text-slate-900 dark:text-white font-financial mt-1">
            {payables?.length || 0}
          </div>
          <span className="text-[11px] text-slate-500">Cadastrados no tenant</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4 text-xs font-semibold">
        <button
          onClick={() => setStatusFilter('ALL')}
          className={`px-3 py-1.5 rounded-xl border transition-colors ${
            statusFilter === 'ALL'
              ? 'bg-slate-900 text-white dark:bg-white dark:text-zinc-900 border-slate-900 dark:border-white'
              : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-800'
          }`}
        >
          Todos os Lançamentos
        </button>
        <button
          onClick={() => setStatusFilter('PENDING')}
          className={`px-3 py-1.5 rounded-xl border transition-colors ${
            statusFilter === 'PENDING'
              ? 'bg-rose-600 text-white border-rose-600'
              : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-800'
          }`}
        >
          Em Aberto
        </button>
        <button
          onClick={() => setStatusFilter('PAID')}
          className={`px-3 py-1.5 rounded-xl border transition-colors ${
            statusFilter === 'PAID'
              ? 'bg-emerald-600 text-white border-emerald-600'
              : 'bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-400 border-slate-200 dark:border-zinc-800'
          }`}
        >
          Quitados
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 dark:bg-zinc-800/50 text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
              <tr>
                <th className="py-3 px-6">Código / Vencimento</th>
                <th className="py-3 px-4">Fornecedor / Beneficiário</th>
                <th className="py-3 px-4">Descrição & Categoria</th>
                <th className="py-3 px-4">Forma</th>
                <th className="py-3 px-4">Valor</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-6 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
              {payables?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    Nenhuma conta a pagar encontrada.
                  </td>
                </tr>
              ) : (
                payables?.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/30">
                    <td className="py-3.5 px-6 font-mono font-semibold text-slate-900 dark:text-white">
                      <div>{p.code}</div>
                      <div className="text-[10px] text-slate-400 font-sans font-normal">
                        Venc: {new Date(p.dueDate).toLocaleDateString('pt-BR')}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-800 dark:text-zinc-200">
                      {p.supplierName}
                    </td>
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="font-medium text-slate-800 dark:text-zinc-200 truncate">{p.description}</div>
                      <div className="text-[10px] text-slate-400">{p.category}</div>
                    </td>
                    <td className="py-3.5 px-4 font-semibold">{p.paymentMethod || 'BOLETO'}</td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white font-financial text-sm">
                      {formatBRL(p.amount)}
                    </td>
                    <td className="py-3.5 px-4">
                      {p.status === 'PAID' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          QUITADO
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          A PAGAR
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-6 text-right">
                      {p.status !== 'PAID' && (
                        <button
                          type="button"
                          disabled={payMutation.isPending}
                          onClick={() => payMutation.mutate({ code: p.code })}
                          className="px-3 py-1 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-white text-white dark:text-zinc-900 hover:opacity-90 shadow-xs"
                        >
                          Registrar Pagamento
                        </button>
                      )}
                      {p.status === 'PAID' && (
                        <span className="text-[11px] text-emerald-600 font-semibold flex items-center justify-end gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Liquidado
                        </span>
                      )}
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
