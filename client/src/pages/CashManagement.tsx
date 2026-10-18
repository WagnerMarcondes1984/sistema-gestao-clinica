import React, { useState } from 'react';
import { trpc } from '../lib/trpc';
import { useVertical } from '../contexts/VerticalContext';
import { FinancialLayout } from '../components/FinancialLayout';
import {
  ArrowDownRight,
  ArrowUpRight,
  Lock,
  Unlock,
} from 'lucide-react';
import { toast } from 'sonner';

export default function CashManagement() {
  const { currentVertical, verticalCode } = useVertical();
  const utils = trpc.useUtils();

  const [countedCashReais, setCountedCashReais] = useState<number | ''>('');
  const [closingNotes, setClosingNotes] = useState('');
  const [showCloseModal, setShowCloseModal] = useState(false);

  const targetVerticalCode = verticalCode === 'ALL' ? 'DENTAL_CLINIC' : verticalCode;

  const { data: currentSession } = trpc.cash.current.useQuery({
    verticalCode: targetVerticalCode,
  });

  const { data: allSessions } = trpc.cash.list.useQuery({
    verticalCode: verticalCode === 'ALL' ? undefined : verticalCode,
  });

  const closeMutation = trpc.cash.close.useMutation({
    onSuccess: () => {
      toast.success('Sessão de caixa encerrada com sucesso!');
      setShowCloseModal(false);
      setCountedCashReais('');
      setClosingNotes('');
      utils.cash.current.invalidate();
      utils.cash.list.invalidate();
      utils.dashboard.metrics.invalidate();
    },
    onError: (err) => {
      toast.error(`Erro ao fechar caixa: ${err.message}`);
    },
  });

  const formatBRL = (cents: number = 0) => {
    return (cents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  const countedCashCents = typeof countedCashReais === 'number' ? Math.round(countedCashReais * 100) : 0;
  const differenceCents = currentSession ? countedCashCents - currentSession.expectedBalance : 0;

  const handleCloseSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSession) return;
    if (typeof countedCashReais !== 'number') {
      toast.error('Informe o valor físico contado na gaveta.');
      return;
    }

    closeMutation.mutate({
      sessionId: currentSession.id,
      closingBalance: countedCashCents,
      notes: closingNotes,
    });
  };

  return (
    <FinancialLayout>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold font-display text-slate-900 dark:text-white flex items-center gap-2">
            Caixa & Fechamento de Sessão
            <span
              className="px-2.5 py-0.5 rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: currentVertical.primaryColor }}
            >
              {currentVertical.badge}
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Conferência de numerário físico, abertura de gaveta, entradas em espécie e fechamento auditado
          </p>
        </div>

        {currentSession && (
          <button
            type="button"
            onClick={() => setShowCloseModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm hover:opacity-90 transition-all self-start md:self-auto"
          >
            <Lock className="w-4 h-4" />
            <span>Realizar Fechamento de Caixa</span>
          </button>
        )}
      </div>

      {/* Active Cash Session Card */}
      {currentSession ? (
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-zinc-800 shadow-sm mb-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-zinc-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center font-bold">
                <Unlock className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-base text-slate-900 dark:text-white">
                    Sessão {currentSession.sessionNumber}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    EM ABERTO
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Operador: <strong>{currentSession.operatorName}</strong> • Aberto em{' '}
                  {new Date(currentSession.openedAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-xs text-slate-400 block font-medium">Saldo Físico Esperado</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-financial">
                {formatBRL(currentSession.expectedBalance)}
              </span>
            </div>
          </div>

          {/* Balances Breakdown */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-800">
              <span className="text-xs text-slate-400 block font-medium">Fundo de Troco (Abertura)</span>
              <span className="text-lg font-bold text-slate-900 dark:text-white font-financial mt-1 block">
                {formatBRL(currentSession.openingBalance)}
              </span>
              <span className="text-[11px] text-slate-500">Valor inicial em gaveta</span>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
              <span className="text-xs text-emerald-700 dark:text-emerald-300 block font-medium flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5" />
                Entradas em Dinheiro
              </span>
              <span className="text-lg font-bold text-emerald-800 dark:text-emerald-200 font-financial mt-1 block">
                +{formatBRL(currentSession.cashInflow)}
              </span>
              <span className="text-[11px] text-emerald-600">Recebidos no checkout</span>
            </div>

            <div className="p-4 rounded-2xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800">
              <span className="text-xs text-rose-700 dark:text-rose-300 block font-medium flex items-center gap-1">
                <ArrowDownRight className="w-3.5 h-3.5" />
                Saídas / Sangrias
              </span>
              <span className="text-lg font-bold text-rose-800 dark:text-rose-200 font-financial mt-1 block">
                -{formatBRL(currentSession.cashOutflow)}
              </span>
              <span className="text-[11px] text-rose-600">Retiradas para cofre</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-slate-200 dark:border-zinc-800 text-center mb-8">
          <p className="text-slate-500 text-xs">Nenhuma sessão de caixa aberta para esta vertical no momento.</p>
        </div>
      )}

      {/* History of Cash Sessions */}
      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-xs overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-zinc-800">
          <h3 className="font-bold text-base text-slate-900 dark:text-white">
            Histórico de Sessões e Fechamentos
          </h3>
          <p className="text-xs text-slate-500">
            Conferência das sessões anteriores com diferenças e rubrica do operador
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 dark:bg-zinc-800/50 text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
              <tr>
                <th className="py-3 px-6">Sessão / Vertical</th>
                <th className="py-3 px-4">Operador</th>
                <th className="py-3 px-4">Abertura</th>
                <th className="py-3 px-4">Fundo Inicial</th>
                <th className="py-3 px-4">Entradas</th>
                <th className="py-3 px-4">Saldo Esperado</th>
                <th className="py-3 px-4">Saldo Fechado</th>
                <th className="py-3 px-6 text-right">Diferença</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
              {allSessions?.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/30">
                  <td className="py-3.5 px-6 font-mono font-bold text-slate-900 dark:text-white">
                    <div>{s.sessionNumber}</div>
                    <div className="text-[10px] text-slate-400 font-sans font-normal">{s.verticalCode}</div>
                  </td>
                  <td className="py-3.5 px-4 font-semibold text-slate-800 dark:text-zinc-200">
                    {s.operatorName}
                  </td>
                  <td className="py-3.5 px-4 font-financial">
                    {new Date(s.openedAt).toLocaleString('pt-BR')}
                  </td>
                  <td className="py-3.5 px-4 font-financial">{formatBRL(s.openingBalance)}</td>
                  <td className="py-3.5 px-4 font-financial text-emerald-600">+{formatBRL(s.cashInflow)}</td>
                  <td className="py-3.5 px-4 font-financial font-bold">{formatBRL(s.expectedBalance)}</td>
                  <td className="py-3.5 px-4 font-financial">
                    {s.closingBalance !== null && s.closingBalance !== undefined
                      ? formatBRL(s.closingBalance)
                      : 'Em aberto'}
                  </td>
                  <td className="py-3.5 px-6 text-right font-financial font-bold">
                    {s.difference === 0 ? (
                      <span className="text-emerald-600">R$ 0,00 (Exato)</span>
                    ) : s.difference ? (
                      <span className="text-amber-600">{formatBRL(s.difference)}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Fechamento de Caixa */}
      {showCloseModal && currentSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-zinc-800 max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4 text-slate-900 dark:text-white">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base">Fechamento da Sessão de Caixa</h3>
                <p className="text-xs text-slate-500">Sessão {currentSession.sessionNumber}</p>
              </div>
            </div>

            <form onSubmit={handleCloseSession} className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-700 flex justify-between items-center text-xs">
                <span className="text-slate-500">Saldo Esperado pelo Sistema:</span>
                <span className="font-extrabold text-slate-900 dark:text-white font-financial text-sm">
                  {formatBRL(currentSession.expectedBalance)}
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                  Valor Físico Contado na Gaveta (R$):
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={countedCashReais}
                  onChange={(e) => setCountedCashReais(e.target.value === '' ? '' : parseFloat(e.target.value))}
                  placeholder="0,00"
                  className="w-full text-base font-bold rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-slate-900 dark:text-white font-financial focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {typeof countedCashReais === 'number' && (
                <div className={`p-3 rounded-xl border text-xs flex justify-between items-center ${
                  differenceCents === 0
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 text-emerald-800 dark:text-emerald-300'
                    : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 text-amber-800 dark:text-amber-300'
                }`}>
                  <span className="font-medium">
                    {differenceCents === 0 ? 'Conferência Exata:' : differenceCents > 0 ? 'Sobra de Caixa:' : 'Falta de Caixa:'}
                  </span>
                  <span className="font-bold font-financial text-sm">
                    {formatBRL(Math.abs(differenceCents))}
                  </span>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                  Observações do Fechamento:
                </label>
                <textarea
                  rows={2}
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  placeholder="Observações pertinentes ou justificativa de eventuais diferenças..."
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-2 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCloseModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-zinc-400"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={closeMutation.isPending}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm"
                >
                  {closeMutation.isPending ? 'Encerrando...' : 'Confirmar Fechamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </FinancialLayout>
  );
}
