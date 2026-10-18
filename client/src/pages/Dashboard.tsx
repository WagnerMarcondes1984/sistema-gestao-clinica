import React, { useState } from 'react';
import { Link } from 'wouter';
import { trpc } from '../lib/trpc';
import { useVertical } from '../contexts/VerticalContext';
import { FinancialLayout } from '../components/FinancialLayout';
import { ReceiptModal } from '../components/ReceiptModal';
import { InvoiceModal } from '../components/InvoiceModal';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Download,
  FileCheck2,
  FileText,
  Filter,
  Percent,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
  XCircle,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { toast } from 'sonner';

export default function Dashboard() {
  const { currentVertical, verticalCode } = useVertical();
  const [period, setPeriod] = useState('month');
  const [selectedReceiptTx, setSelectedReceiptTx] = useState<any | null>(null);
  const [selectedInvoiceTx, setSelectedInvoiceTx] = useState<any | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundTargetTx, setRefundTargetTx] = useState<any | null>(null);

  const utils = trpc.useUtils();

  // Consultar métricas do dashboard
  const { data: metrics, isLoading: loadingMetrics } = trpc.dashboard.metrics.useQuery({
    verticalCode,
  });

  // Mutações para simular webhook, confirmar e estornar
  const confirmMutation = trpc.transactions.confirm.useMutation({
    onSuccess: (data) => {
      toast.success(`Pagamento da cobrança ${data?.code} confirmado com sucesso! NFS-e emitida.`);
      utils.dashboard.metrics.invalidate();
      utils.transactions.list.invalidate();
    },
    onError: (err) => {
      toast.error(`Erro ao confirmar pagamento: ${err.message}`);
    },
  });

  const webhookMutation = trpc.transactions.simulateWebhook.useMutation({
    onSuccess: (res) => {
      toast.success(`Webhook processado: Pagamento via Pix/Banco confirmado instantaneamente!`);
      utils.dashboard.metrics.invalidate();
      utils.transactions.list.invalidate();
    },
  });

  const refundMutation = trpc.transactions.refund.useMutation({
    onSuccess: (data) => {
      toast.success(`Cobrança ${data?.code} estornada com sucesso. Nota fiscal cancelada.`);
      setRefundTargetTx(null);
      setRefundReason('');
      utils.dashboard.metrics.invalidate();
      utils.transactions.list.invalidate();
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

  const handleConfirm = (code: string) => {
    confirmMutation.mutate({ code });
  };

  const handleSimulateWebhook = (code: string) => {
    webhookMutation.mutate({ code, event: 'PAYMENT_CONFIRMED' });
  };

  const handleRefundSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundTargetTx) return;
    if (!refundReason.trim()) {
      toast.error('Informe a justificativa do estorno.');
      return;
    }
    refundMutation.mutate({
      code: refundTargetTx.code,
      reason: refundReason,
    });
  };

  // Dados simulados de evolução temporal de 7 dias baseados no real
  const timelineData = [
    { day: '31/Ago', entradas: (metrics?.totalReceived || 0) * 0.12, saidas: 185000 },
    { day: '01/Set', entradas: (metrics?.totalReceived || 0) * 0.18, saidas: 98000 },
    { day: '02/Set', entradas: (metrics?.totalReceived || 0) * 0.15, saidas: 145000 },
    { day: '03/Set', entradas: (metrics?.totalReceived || 0) * 0.22, saidas: 220000 },
    { day: '04/Set', entradas: (metrics?.totalReceived || 0) * 0.35, saidas: 320000 },
    { day: '05/Set', entradas: (metrics?.totalReceived || 0) * 0.45, saidas: 110000 },
    { day: 'Hoje', entradas: (metrics?.totalReceived || 0) * 0.28, saidas: 85000 },
  ];

  // Cores por método de pagamento
  const METHOD_COLORS: Record<string, string> = {
    PIX: '#0D9488',
    CREDIT_CARD: '#3B82F6',
    DEBIT_CARD: '#6366F1',
    BOLETO: '#F59E0B',
    CASH: '#10B981',
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

  return (
    <FinancialLayout>
      {/* Dashboard Executive Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ backgroundColor: currentVertical.primaryColor }}
            />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Painel Financeiro Consolidado
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-slate-900 dark:text-white">
            {currentVertical.name}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl">
            {currentVertical.tagline}
          </p>
        </div>

        {/* Controls and Quick Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-800 p-1 flex items-center text-xs font-semibold">
            <button
              onClick={() => setPeriod('today')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                period === 'today'
                  ? 'bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-white'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Hoje
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                period === 'month'
                  ? 'bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-white'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Setembro 2026
            </button>
            <button
              onClick={() => setPeriod('year')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                period === 'year'
                  ? 'bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-white'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Ano
            </button>
          </div>

          <Link
            href="/checkout"
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-white px-4 py-2 rounded-xl shadow-md transition-all hover:brightness-110 active:scale-95"
            style={{ backgroundColor: currentVertical.primaryColor }}
          >
            <Plus className="w-4 h-4" />
            <span>Novo Atendimento / Checkout</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Card 1: Recebimentos */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-slate-200/80 dark:border-zinc-800/80 shadow-xs relative overflow-hidden group hover:border-slate-300 dark:hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Recebimentos Confirmados
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-financial">
            {loadingMetrics ? '...' : formatBRL(metrics?.totalReceived)}
          </div>
          <div className="mt-2.5 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>100% Conciliado e com NFS-e</span>
          </div>
          <div
            className="absolute bottom-0 left-0 right-0 h-1"
            style={{ backgroundColor: currentVertical.primaryColor }}
          />
        </div>

        {/* Card 2: A Receber */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-slate-200/80 dark:border-zinc-800/80 shadow-xs relative overflow-hidden group hover:border-slate-300 dark:hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              A Receber (Pendentes)
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-financial">
            {loadingMetrics ? '...' : formatBRL(metrics?.totalReceivable)}
          </div>
          <div className="mt-2.5 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
            <span>Cobranças com QR Code Pix & Cartão ativo</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-amber-400" />
        </div>

        {/* Card 3: A Pagar */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-slate-200/80 dark:border-zinc-800/80 shadow-xs relative overflow-hidden group hover:border-slate-300 dark:hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Contas a Pagar (Mês)
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <ArrowDownRight className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-financial">
            {loadingMetrics ? '...' : formatBRL(metrics?.totalPayable)}
          </div>
          <div className="mt-2.5 flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 font-medium">
            <span>Insumos clínicos, repasses e fornecedores</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-rose-500" />
        </div>

        {/* Card 4: Saldo de Caixa */}
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-5 border border-slate-200/80 dark:border-zinc-800/80 shadow-xs relative overflow-hidden group hover:border-slate-300 dark:hover:border-zinc-700 transition-all">
          <div className="flex items-center justify-between text-slate-500 dark:text-zinc-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Saldo em Caixa & Operador
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white font-financial">
            {loadingMetrics ? '...' : formatBRL(metrics?.cashBalance)}
          </div>
          <div className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400 font-medium">
            <span>Sessão Aberta • {currentVertical.defaultUnit}</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500" />
        </div>
      </div>

      {/* Charts & Payment Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Main Chart: Fluxo Temporal */}
        <div className="lg:col-span-2 bg-white dark:bg-zinc-900 rounded-3xl p-6 border border-slate-200 dark:border-zinc-800 shadow-xs">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                Fluxo de Caixa & Liquidez
                <span className="text-xs font-normal text-slate-400">
                  (Entradas vs Despesas)
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Acompanhamento contínuo dos pagamentos clínicos recebidos e liquidações
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: currentVertical.primaryColor }}
                />
                <span>Entradas</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-rose-500" />
                <span>Despesas</span>
              </div>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData}>
                <defs>
                  <linearGradient id="colorEntradas" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor={currentVertical.primaryColor}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor={currentVertical.primaryColor}
                      stopOpacity={0.0}
                    />
                  </linearGradient>
                  <linearGradient id="colorSaidas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#F43F5E" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="day" stroke="#94A3B8" fontSize={11} />
                <YAxis
                  stroke="#94A3B8"
                  fontSize={11}
                  tickFormatter={(val) => `R$ ${(val / 100).toFixed(0)}`}
                />
                <Tooltip
                  formatter={(value: any) => [formatBRL(Number(value)), 'Valor']}
                  contentStyle={{
                    borderRadius: '16px',
                    backgroundColor: '#18181B',
                    border: '1px solid #27272A',
                    color: '#fff',
                    fontSize: '12px',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="entradas"
                  stroke={currentVertical.primaryColor}
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#colorEntradas)"
                />
                <Area
                  type="monotone"
                  dataKey="saidas"
                  stroke="#F43F5E"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorSaidas)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Secondary: Meios de Pagamento e Conversão */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 border border-slate-200 dark:border-zinc-800 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white mb-1">
              Mix por Meio de Pagamento
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mb-5">
              Preferência dos pacientes no checkout da clínica
            </p>

            <div className="space-y-3.5">
              {metrics?.methodDistribution?.map((item) => {
                const totalRevenue = metrics.totalReceived || 1;
                const pct = Math.round((item.total / totalRevenue) * 100) || 0;
                const color = METHOD_COLORS[item.method] || '#64748B';
                return (
                  <div key={item.method} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        {item.method === 'PIX'
                          ? 'PIX Instantâneo'
                          : item.method === 'CREDIT_CARD'
                          ? 'Cartão de Crédito'
                          : item.method === 'DEBIT_CARD'
                          ? 'Cartão de Débito'
                          : item.method === 'BOLETO'
                          ? 'Boleto Registrado'
                          : 'Dinheiro (Espécie)'}
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white font-financial">
                        {formatBRL(item.total)} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Security & Conciliation Card */}
          <div className="mt-6 p-4 rounded-2xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-100 dark:border-zinc-800 flex items-center gap-3">
            <ShieldCheck className="w-8 h-8 text-emerald-600 shrink-0" />
            <div className="text-xs">
              <span className="font-bold text-slate-900 dark:text-white block">
                Automação Fiscal Ativada
              </span>
              <span className="text-slate-500 dark:text-zinc-400 text-[11px]">
                Cada pagamento aprovado gera automaticamente a NFS-e com retenções e envia ao e-mail do paciente.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* States Indicator Bar */}
      <div className="mb-6 bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-slate-200 dark:border-zinc-800">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Monitoramento em Tempo Real dos 5 Estados de Pagamento
          </span>
          <Link
            href="/transactions"
            className="text-xs font-semibold hover:underline"
            style={{ color: currentVertical.primaryColor }}
          >
            Ver todas as transações →
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/40">
            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              PAGO
            </div>
            <div className="text-lg font-extrabold text-emerald-900 dark:text-emerald-200 font-financial mt-1">
              {metrics?.statusDistribution?.find((s) => s.status === 'PAID')?.count || 0}
            </div>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
              {formatBRL(metrics?.statusDistribution?.find((s) => s.status === 'PAID')?.total || 0)}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40">
            <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 text-xs font-bold">
              <Clock className="w-3.5 h-3.5" />
              PENDENTE
            </div>
            <div className="text-lg font-extrabold text-amber-900 dark:text-amber-200 font-financial mt-1">
              {metrics?.statusDistribution?.find((s) => s.status === 'PENDING')?.count || 0}
            </div>
            <span className="text-[10px] text-amber-600 dark:text-amber-400">
              {formatBRL(metrics?.statusDistribution?.find((s) => s.status === 'PENDING')?.total || 0)}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-red-50/60 dark:bg-red-950/20 border border-red-200/80 dark:border-red-900/40">
            <div className="flex items-center gap-1.5 text-red-700 dark:text-red-400 text-xs font-bold">
              <AlertCircle className="w-3.5 h-3.5" />
              VENCIDO
            </div>
            <div className="text-lg font-extrabold text-red-900 dark:text-red-200 font-financial mt-1">
              {metrics?.statusDistribution?.find((s) => s.status === 'OVERDUE')?.count || 0}
            </div>
            <span className="text-[10px] text-red-600 dark:text-red-400">
              {formatBRL(metrics?.statusDistribution?.find((s) => s.status === 'OVERDUE')?.total || 0)}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-zinc-100/70 dark:bg-zinc-800/40 border border-zinc-200 dark:border-zinc-700">
            <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 text-xs font-bold">
              <XCircle className="w-3.5 h-3.5" />
              FALHOU
            </div>
            <div className="text-lg font-extrabold text-slate-900 dark:text-white font-financial mt-1">
              {metrics?.statusDistribution?.find((s) => s.status === 'FAILED')?.count || 0}
            </div>
            <span className="text-[10px] text-slate-500">
              Cartão recusado / erro
            </span>
          </div>

          <div className="p-3 rounded-xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200/80 dark:border-purple-900/40">
            <div className="flex items-center gap-1.5 text-purple-700 dark:text-purple-400 text-xs font-bold">
              <RotateCcw className="w-3.5 h-3.5" />
              ESTORNADO
            </div>
            <div className="text-lg font-extrabold text-purple-900 dark:text-purple-200 font-financial mt-1">
              {metrics?.statusDistribution?.find((s) => s.status === 'REFUNDED')?.count || 0}
            </div>
            <span className="text-[10px] text-purple-600 dark:text-purple-400">
              Cancelamentos auditados
            </span>
          </div>
        </div>
      </div>

      {/* Recent Transactions Table */}
      <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-xs overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white">
              Últimas Cobranças & Transações Clínicas
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Fluxo direto do atendimento médico e recepção
            </p>
          </div>
          <Link
            href="/transactions"
            className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors"
          >
            Ver Todas
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 dark:bg-zinc-800/50 text-slate-400 uppercase tracking-wider text-[10px] font-semibold">
              <tr>
                <th className="py-3 px-6">Código / Data</th>
                <th className="py-3 px-4">Paciente & Documento</th>
                <th className="py-3 px-4">Procedimento / Profissional</th>
                <th className="py-3 px-4">Método</th>
                <th className="py-3 px-4">Valor Total</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-6 text-right">Ações Rápidas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
              {metrics?.recentTransactions?.map((tx) => (
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
                        <>
                          <button
                            type="button"
                            onClick={() => handleSimulateWebhook(tx.code)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-xs"
                            title="Simular Webhook Bancário de Pagamento"
                          >
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            Simular Baixa
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
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
                  Confirmar Estorno / Reembolso
                </h3>
                <p className="text-xs text-slate-500">
                  Protocolo: {refundTargetTx.code} • {formatBRL(refundTargetTx.totalAmount)}
                </p>
              </div>
            </div>

            <form onSubmit={handleRefundSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                  Motivo / Justificativa Regulatória do Estorno:
                </label>
                <textarea
                  required
                  rows={3}
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Ex: Desistência do paciente, erro de digitação de valor, contraindicação clínica recente..."
                  className="w-full text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 p-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  O estorno cancelará a NFS-e correspondente e emitirá o registro no log de auditoria fiscal.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRefundTargetTx(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={refundMutation.isPending}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-sm"
                >
                  {refundMutation.isPending ? 'Processando...' : 'Confirmar Estorno'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modais de Comprovante e NFS-e */}
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
