import React from 'react';
import { trpc } from '../lib/trpc';
import { useVertical } from '../contexts/VerticalContext';
import { FinancialLayout } from '../components/FinancialLayout';
import {
  ShieldCheck,
} from 'lucide-react';

export default function AuditFiscal() {
  const { currentVertical, verticalCode } = useVertical();

  const { data: auditLogs } = trpc.audit.list.useQuery({
    verticalCode: verticalCode === 'ALL' ? undefined : verticalCode,
    limit: 50,
  });

  return (
    <FinancialLayout>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold font-display text-slate-900 dark:text-white flex items-center gap-2">
            Trilha de Auditoria & Conformidade Fiscal
            <span
              className="px-2.5 py-0.5 rounded-full text-xs font-semibold text-white"
              style={{ backgroundColor: currentVertical.primaryColor }}
            >
              {currentVertical.badge}
            </span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
            Registro imutável de todas as cobranças, liquidações, webhooks bancários, estornos e emissões fiscais
          </p>
        </div>
      </div>

      {/* Security Banner */}
      <div className="mb-6 p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-xs flex items-center gap-3">
        <ShieldCheck className="w-8 h-8 text-emerald-600 shrink-0" />
        <div className="text-xs">
          <span className="font-bold text-slate-900 dark:text-white block">
            Integridade Criptográfica Garantida
          </span>
          <span className="text-slate-500 dark:text-zinc-400 text-[11px]">
            Todos os eventos financeiros e fiscais contêm hash SHA-256 de autenticidade, com carimbo de data/hora (timestamp) inviolável.
          </span>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 dark:bg-zinc-800/50 text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
              <tr>
                <th className="py-3 px-6">Data / Hora</th>
                <th className="py-3 px-4">Vertical</th>
                <th className="py-3 px-4">Protocolo</th>
                <th className="py-3 px-4">Ação</th>
                <th className="py-3 px-4">Operador</th>
                <th className="py-3 px-6">Detalhes do Evento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
              {auditLogs?.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-zinc-800/30">
                  <td className="py-3.5 px-6 font-financial text-slate-500">
                    {new Date(log.createdAt).toLocaleString('pt-BR')}
                  </td>
                  <td className="py-3.5 px-4 font-semibold text-slate-800 dark:text-zinc-200">
                    {log.verticalCode}
                  </td>
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                    {log.transactionCode || '—'}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-zinc-800 text-slate-800 dark:text-zinc-200">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-medium text-slate-700 dark:text-zinc-300">
                    {log.operator}
                  </td>
                  <td className="py-3.5 px-6 text-slate-600 dark:text-zinc-300">
                    {log.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </FinancialLayout>
  );
}
