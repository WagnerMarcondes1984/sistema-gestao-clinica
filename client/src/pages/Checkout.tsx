import React, { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { trpc } from '../lib/trpc';
import { useVertical } from '../contexts/VerticalContext';
import { FinancialLayout } from '../components/FinancialLayout';
import { ReceiptModal } from '../components/ReceiptModal';
import { InvoiceModal } from '../components/InvoiceModal';
import { PaymentMethod } from '../types/finance';
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  Building2,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  DollarSign,
  FileCheck2,
  FileText,
  HelpCircle,
  Percent,
  Plus,
  QrCode,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  User,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';

export default function Checkout() {
  const { currentVertical, verticalCode } = useVertical();
  const utils = trpc.useUtils();

  // Step do Checkout: 1 = Dados do Atendimento, 2 = Pagamento & Confirmação, 3 = Sucesso
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Dados do Paciente e Atendimento
  const [patientName, setPatientName] = useState('Mariana Siqueira Fontes');
  const [patientDocument, setPatientDocument] = useState('341.890.128-44');
  const [patientEmail, setPatientEmail] = useState('mariana.fontes@email.com');
  const [patientPhone, setPatientPhone] = useState('(11) 98122-3344');
  const [professionalName, setProfessionalName] = useState(currentVertical.defaultProfessional);
  const [unitName, setUnitName] = useState(currentVertical.defaultUnit);

  // Itens do Atendimento
  const [items, setItems] = useState<
    Array<{ name: string; quantity: number; unitPrice: number; subtotal: number }>
  >([]);

  // Desconto e Acréscimo em Reais
  const [discountReais, setDiscountReais] = useState<number>(0);
  const [additionReais, setAdditionReais] = useState<number>(0);

  // Método de pagamento selecionado
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const [installments, setInstallments] = useState<number>(1);
  const [cardBrand, setCardBrand] = useState<string>('Mastercard');
  const [cardLast4, setCardLast4] = useState<string>('5421');
  const [cashReceivedReais, setCashReceivedReais] = useState<number>(0);

  // Estado do PIX (Timer e simulação)
  const [pixTimeRemaining, setPixTimeRemaining] = useState<number>(1800); // 30 minutos em segundos
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Transação criada
  const [createdTx, setCreatedTx] = useState<any | null>(null);
  const [showReceipt, setShowReceipt] = useState<boolean>(false);
  const [showInvoice, setShowInvoice] = useState<boolean>(false);

  // Inicializar com o catálogo da vertical
  useEffect(() => {
    if (currentVertical.catalog.length > 0) {
      const initialItem = currentVertical.catalog[0];
      setItems([
        {
          name: initialItem.name,
          quantity: 1,
          unitPrice: initialItem.defaultPrice,
          subtotal: initialItem.defaultPrice,
        },
      ]);
    }
    setProfessionalName(currentVertical.defaultProfessional);
    setUnitName(currentVertical.defaultUnit);
  }, [currentVertical]);

  // Timer do Pix quando no step 2 e método PIX
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (step === 2 && paymentMethod === 'PIX' && pixTimeRemaining > 0) {
      timer = setInterval(() => {
        setPixTimeRemaining((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [step, paymentMethod, pixTimeRemaining]);

  // Cálculos financeiros
  const subtotalCents = items.reduce((acc, curr) => acc + curr.subtotal, 0);
  const discountCents = Math.round((discountReais || 0) * 100);
  const additionCents = Math.round((additionReais || 0) * 100);
  const totalCents = Math.max(0, subtotalCents - discountCents + additionCents);
  const cashReceivedCents = Math.round((cashReceivedReais || 0) * 100);
  const cashChangeCents = Math.max(0, cashReceivedCents - totalCents);

  const formatBRL = (cents: number = 0) => {
    return (cents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  // Formatação do timer MM:SS
  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Adicionar item do catálogo
  const handleAddItemFromCatalog = (catItem: any) => {
    setItems((prev) => [
      ...prev,
      {
        name: catItem.name,
        quantity: 1,
        unitPrice: catItem.defaultPrice,
        subtotal: catItem.defaultPrice,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateItemQuantity = (index: number, newQty: number) => {
    if (newQty < 1) return;
    setItems((prev) =>
      prev.map((item, i) => {
        if (i === index) {
          return {
            ...item,
            quantity: newQty,
            subtotal: item.unitPrice * newQty,
          };
        }
        return item;
      })
    );
  };

  // Criar cobrança no banco via tRPC
  const createChargeMutation = trpc.transactions.create.useMutation({
    onSuccess: (tx) => {
      setCreatedTx(tx);
      setIsProcessing(false);
      if (paymentMethod === 'CASH') {
        setStep(3);
        toast.success('Pagamento em dinheiro recebido e caixa atualizado!');
      } else {
        setStep(2);
        toast.success(`Cobrança ${tx?.code} gerada com sucesso!`);
      }
      utils.dashboard.metrics.invalidate();
      utils.transactions.list.invalidate();
    },
    onError: (err) => {
      setIsProcessing(false);
      toast.error(`Erro ao criar cobrança: ${err.message}`);
    },
  });

  // Simular confirmação eletrônica (Webhook ou maquininha)
  const confirmMutation = trpc.transactions.confirm.useMutation({
    onSuccess: (tx) => {
      setCreatedTx(tx);
      setIsProcessing(false);
      setStep(3);
      toast.success('Pagamento confirmado com sucesso! NFS-e emitida.');
      utils.dashboard.metrics.invalidate();
      utils.transactions.list.invalidate();
    },
    onError: (err) => {
      setIsProcessing(false);
      toast.error(`Erro ao confirmar: ${err.message}`);
    },
  });

  const handleProceedToPayment = () => {
    if (!patientName.trim()) {
      toast.error('Informe o nome do paciente');
      return;
    }
    if (!patientDocument.trim()) {
      toast.error('Informe o CPF/Documento do paciente');
      return;
    }
    if (items.length === 0) {
      toast.error('Adicione ao menos um procedimento ao atendimento');
      return;
    }
    if (paymentMethod === 'CASH' && cashReceivedCents < totalCents) {
      toast.error('O valor recebido em dinheiro é inferior ao total da cobrança.');
      return;
    }

    setIsProcessing(true);
    createChargeMutation.mutate({
      verticalCode: currentVertical.code === 'ALL' ? 'DENTAL_CLINIC' : currentVertical.code,
      patientName,
      patientDocument,
      patientEmail,
      patientPhone,
      professionalName,
      unitName,
      title: items.map((i) => i.name).join(' + '),
      category: currentVertical.badge,
      paymentMethod,
      status: paymentMethod === 'CASH' ? 'PAID' : 'PENDING',
      subtotal: subtotalCents,
      discount: discountCents,
      addition: additionCents,
      totalAmount: totalCents,
      installments,
      installmentValue: Math.round(totalCents / installments),
      dueDate: new Date(),
      cardBrand: paymentMethod === 'CREDIT_CARD' || paymentMethod === 'DEBIT_CARD' ? cardBrand : undefined,
      cardLast4: paymentMethod === 'CREDIT_CARD' || paymentMethod === 'DEBIT_CARD' ? cardLast4 : undefined,
      cashReceived: paymentMethod === 'CASH' ? cashReceivedCents : undefined,
      cashChange: paymentMethod === 'CASH' ? cashChangeCents : undefined,
      operatorName: currentVertical.defaultOperator,
      items,
    });
  };

  const handleSimulatePaymentApproval = () => {
    if (!createdTx) return;
    setIsProcessing(true);
    confirmMutation.mutate({
      code: createdTx.code,
      operatorName: currentVertical.defaultOperator,
    });
  };

  const handleResetCheckout = () => {
    setStep(1);
    setCreatedTx(null);
    setPixTimeRemaining(1800);
    setCashReceivedReais(0);
  };

  return (
    <FinancialLayout>
      {/* Checkout Breadcrumb / Step Indicator */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-xl border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors text-slate-500"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold font-display text-slate-900 dark:text-white flex items-center gap-2">
              Checkout Clínico & Cobrança
              <span
                className="px-2.5 py-0.5 rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: currentVertical.primaryColor }}
              >
                {currentVertical.badge}
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Finalização do atendimento com recebimento imediato, conciliação e emissão de NFS-e
            </p>
          </div>
        </div>

        {/* Stepper Wizard */}
        <div className="hidden sm:flex items-center gap-2 text-xs font-semibold">
          <span
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${
              step === 1
                ? 'bg-slate-900 text-white dark:bg-white dark:text-zinc-900'
                : 'text-slate-400'
            }`}
          >
            1. Atendimento
          </span>
          <span className="text-slate-300">→</span>
          <span
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${
              step === 2
                ? 'bg-slate-900 text-white dark:bg-white dark:text-zinc-900'
                : 'text-slate-400'
            }`}
          >
            2. Pagamento
          </span>
          <span className="text-slate-300">→</span>
          <span
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 ${
              step === 3
                ? 'bg-emerald-600 text-white'
                : 'text-slate-400'
            }`}
          >
            3. Concluído
          </span>
        </div>
      </div>

      {/* STEP 1: RESUMO DO ATENDIMENTO E ITENS */}
      {step === 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Form: Atendimento e Procedimentos */}
          <div className="lg:col-span-2 space-y-6">
            {/* Patient & Clinic Details Card */}
            <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 border border-slate-200 dark:border-zinc-800 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800/80 pb-3">
                <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                  <User className="w-4 h-4 text-slate-400" />
                  Dados do Paciente / Cliente
                </h3>
                <span className="text-xs text-slate-400 font-medium">
                  Unidade: {unitName}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                    Nome do Paciente:
                  </label>
                  <input
                    type="text"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    placeholder="Nome completo do paciente"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                    CPF / CNPJ (para NFS-e):
                  </label>
                  <input
                    type="text"
                    value={patientDocument}
                    onChange={(e) => setPatientDocument(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3 py-2.5 text-slate-900 dark:text-white font-financial focus:outline-none focus:ring-2 focus:ring-teal-500"
                    placeholder="000.000.000-00"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                    E-mail do Paciente (para Comprovante & Nota):
                  </label>
                  <input
                    type="email"
                    value={patientEmail}
                    onChange={(e) => setPatientEmail(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                    placeholder="paciente@exemplo.com"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                    Profissional Responsável:
                  </label>
                  <input
                    type="text"
                    value={professionalName}
                    onChange={(e) => setProfessionalName(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
            </div>

            {/* Items & Procedures List */}
            <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 border border-slate-200 dark:border-zinc-800 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800/80 pb-3">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Procedimentos & Serviços do Atendimento
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    Itens realizados durante a consulta ou procedimento clínico
                  </p>
                </div>
              </div>

              {/* Items Selected Table */}
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-100 dark:border-zinc-800 text-xs"
                  >
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="font-bold text-slate-900 dark:text-white truncate">
                        {item.name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Valor Unitário: {formatBRL(item.unitPrice)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center border border-slate-200 dark:border-zinc-700 rounded-lg overflow-hidden bg-white dark:bg-zinc-900">
                        <button
                          type="button"
                          onClick={() => handleUpdateItemQuantity(idx, item.quantity - 1)}
                          className="px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800"
                        >
                          -
                        </button>
                        <span className="px-2.5 py-1 font-bold text-slate-800 dark:text-zinc-200 font-financial">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateItemQuantity(idx, item.quantity + 1)}
                          className="px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800"
                        >
                          +
                        </button>
                      </div>

                      <span className="font-extrabold text-slate-900 dark:text-white font-financial min-w-[80px] text-right">
                        {formatBRL(item.subtotal)}
                      </span>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                        title="Remover procedimento"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick Add From Vertical Catalog */}
              {currentVertical.catalog.length > 0 && (
                <div className="pt-3 border-t border-slate-100 dark:border-zinc-800/80">
                  <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400 block mb-2">
                    + Inserir Procedimento do Catálogo ({currentVertical.name}):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {currentVertical.catalog.map((catItem, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleAddItemFromCatalog(catItem)}
                        className="text-left px-3 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-slate-400 dark:hover:border-zinc-500 text-xs text-slate-700 dark:text-zinc-300 transition-all flex items-center gap-1.5"
                      >
                        <Plus className="w-3 h-3 text-slate-400" />
                        <span className="font-medium truncate max-w-[200px]">{catItem.name}</span>
                        <span className="font-bold text-slate-900 dark:text-white font-financial">
                          ({formatBRL(catItem.defaultPrice)})
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Method Picker & Options */}
            <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 border border-slate-200 dark:border-zinc-800 shadow-xs space-y-4">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                Selecione a Forma de Pagamento
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { id: 'PIX', label: 'PIX Dinâmico', icon: QrCode, badge: 'Instantâneo' },
                  { id: 'CREDIT_CARD', label: 'Cartão Crédito', icon: CreditCard, badge: 'Até 12x' },
                  { id: 'DEBIT_CARD', label: 'Cartão Débito', icon: CreditCard, badge: 'À vista' },
                  { id: 'BOLETO', label: 'Boleto Bancário', icon: FileText, badge: 'D+1/D+2' },
                  { id: 'CASH', label: 'Dinheiro', icon: Banknote, badge: 'Espécie' },
                ].map((m) => {
                  const Icon = m.icon;
                  const isSelected = paymentMethod === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id as PaymentMethod)}
                      className={`p-3.5 rounded-2xl border text-center transition-all flex flex-col items-center justify-between gap-2 ${
                        isSelected
                          ? 'border-2 text-slate-900 dark:text-white shadow-md'
                          : 'border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-slate-300'
                      }`}
                      style={{
                        borderColor: isSelected ? currentVertical.primaryColor : undefined,
                        backgroundColor: isSelected ? `${currentVertical.primaryColor}10` : undefined,
                      }}
                    >
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-white"
                        style={{ backgroundColor: isSelected ? currentVertical.primaryColor : '#64748B' }}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold block">{m.label}</span>
                        <span className="text-[10px] text-slate-400 font-medium">{m.badge}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Specific Method Configurations */}
              {paymentMethod === 'CREDIT_CARD' && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      Condição de Parcelamento no Cartão:
                    </span>
                    <span className="text-xs text-slate-500">Sem juros repassados</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[1, 2, 3, 4, 6, 10, 12].map((parc) => {
                      const parcValue = Math.round(totalCents / parc);
                      return (
                        <button
                          key={parc}
                          type="button"
                          onClick={() => setInstallments(parc)}
                          className={`p-2.5 rounded-xl border text-xs font-semibold transition-all text-center ${
                            installments === parc
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700'
                          }`}
                        >
                          <div>{parc}x de {formatBRL(parcValue)}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {paymentMethod === 'CASH' && (
                <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                      Recebimento em Dinheiro no Caixa
                    </span>
                    <span className="text-xs text-emerald-700 dark:text-emerald-400">
                      Operador: {currentVertical.defaultOperator}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block mb-1">
                        Valor Entregue pelo Paciente (R$):
                      </label>
                      <input
                        type="number"
                        min={totalCents / 100}
                        step="0.01"
                        value={cashReceivedReais || ''}
                        onChange={(e) => setCashReceivedReais(parseFloat(e.target.value) || 0)}
                        placeholder={(totalCents / 100).toFixed(2)}
                        className="w-full text-sm font-bold text-slate-900 dark:text-white rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-2.5 font-financial"
                      />
                    </div>
                    <div className="p-3 rounded-xl bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-800 flex flex-col justify-center">
                      <span className="text-[11px] text-slate-400 uppercase font-semibold">
                        Troco a Devolver:
                      </span>
                      <span className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 font-financial">
                        {formatBRL(cashChangeCents)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Summary Column */}
          <div className="space-y-6">
            <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 border border-slate-200 dark:border-zinc-800 shadow-md sticky top-24 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-3">
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Resumo Financeiro
                </h3>
                <span className="text-xs text-slate-400">
                  {items.length} {items.length === 1 ? 'item' : 'itens'}
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between text-slate-600 dark:text-zinc-400">
                  <span>Subtotal dos Serviços:</span>
                  <span className="font-bold text-slate-900 dark:text-white font-financial">
                    {formatBRL(subtotalCents)}
                  </span>
                </div>

                {/* Desconto autorizado */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    Desconto Autorizado (R$):
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={discountReais || ''}
                    onChange={(e) => setDiscountReais(parseFloat(e.target.value) || 0)}
                    placeholder="0,00"
                    className="w-24 text-right text-xs font-bold text-emerald-700 dark:text-emerald-300 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30 px-2 py-1 font-financial"
                  />
                </div>

                {/* Acréscimo */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-slate-500">Acréscimo Autorizado (R$):</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={additionReais || ''}
                    onChange={(e) => setAdditionReais(parseFloat(e.target.value) || 0)}
                    placeholder="0,00"
                    className="w-24 text-right text-xs font-bold text-slate-700 dark:text-zinc-300 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-2 py-1 font-financial"
                  />
                </div>

                <div className="pt-3 border-t border-slate-200 dark:border-zinc-800 flex justify-between items-baseline">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    Total a Cobrar:
                  </span>
                  <span className="text-2xl font-extrabold text-slate-900 dark:text-white font-financial">
                    {formatBRL(totalCents)}
                  </span>
                </div>

                {paymentMethod === 'CREDIT_CARD' && installments > 1 && (
                  <div className="text-right text-xs text-blue-600 font-semibold font-financial">
                    {installments}x de {formatBRL(Math.round(totalCents / installments))}
                  </div>
                )}
              </div>

              {/* Action Button */}
              <button
                type="button"
                disabled={isProcessing || totalCents === 0}
                onClick={handleProceedToPayment}
                className="w-full py-3.5 rounded-2xl text-sm font-extrabold text-white shadow-lg transition-all hover:brightness-110 active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ backgroundColor: currentVertical.primaryColor }}
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Gerando Cobrança...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {paymentMethod === 'CASH'
                        ? 'Confirmar Recebimento em Dinheiro'
                        : 'Avançar para Pagamento'}
                    </span>
                  </>
                )}
              </button>

              <div className="text-[11px] text-slate-400 text-center flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>Transação protegida por criptografia bancária</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: TELA DE PAGAMENTO INTERATIVA (PIX, CARTÃO, BOLETO) */}
      {step === 2 && createdTx && (
        <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-6 sm:p-8 border border-slate-200 dark:border-zinc-800 shadow-xl space-y-6">
            {/* Header com Valor e Protocolo */}
            <div className="text-center pb-5 border-b border-slate-100 dark:border-zinc-800">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                Cobrança #{createdTx.code}
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white font-financial">
                {formatBRL(createdTx.totalAmount)}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Paciente: {createdTx.patientName} • {createdTx.patientDocument}
              </p>
            </div>

            {/* PIX MODAL / DISPLAY */}
            {createdTx.paymentMethod === 'PIX' && (
              <div className="space-y-6">
                <div className="flex flex-col items-center justify-center space-y-4">
                  <div className="w-56 h-56 p-4 rounded-3xl bg-white border-2 border-slate-200 dark:border-zinc-700 shadow-md flex items-center justify-center relative group">
                    {/* SVG QR Code Simulation with Realistic Matrix */}
                    <svg viewBox="0 0 100 100" className="w-full h-full text-slate-900">
                      <rect x="0" y="0" width="100" height="100" fill="white" />
                      {/* Corner 1 */}
                      <rect x="10" y="10" width="22" height="22" fill="#0D9488" rx="3" />
                      <rect x="14" y="14" width="14" height="14" fill="white" rx="2" />
                      <rect x="18" y="18" width="6" height="6" fill="#0D9488" />
                      {/* Corner 2 */}
                      <rect x="68" y="10" width="22" height="22" fill="#0D9488" rx="3" />
                      <rect x="72" y="14" width="14" height="14" fill="white" rx="2" />
                      <rect x="76" y="18" width="6" height="6" fill="#0D9488" />
                      {/* Corner 3 */}
                      <rect x="10" y="68" width="22" height="22" fill="#0D9488" rx="3" />
                      <rect x="14" y="72" width="14" height="14" fill="white" rx="2" />
                      <rect x="18" y="76" width="6" height="6" fill="#0D9488" />
                      {/* Data Pattern Modules */}
                      <rect x="40" y="12" width="6" height="6" fill="#14B8A6" />
                      <rect x="52" y="12" width="6" height="6" fill="#0F766E" />
                      <rect x="44" y="24" width="8" height="8" fill="#0D9488" />
                      <rect x="12" y="40" width="6" height="6" fill="#14B8A6" />
                      <rect x="24" y="44" width="8" height="6" fill="#0F766E" />
                      <rect x="38" y="38" width="24" height="24" fill="#0D9488" rx="4" />
                      <rect x="44" y="44" width="12" height="12" fill="white" rx="2" />
                      <rect x="48" y="48" width="4" height="4" fill="#0D9488" />
                      <rect x="68" y="40" width="8" height="6" fill="#14B8A6" />
                      <rect x="80" y="46" width="6" height="6" fill="#0F766E" />
                      <rect x="40" y="68" width="6" height="6" fill="#0D9488" />
                      <rect x="52" y="72" width="8" height="6" fill="#14B8A6" />
                      <rect x="68" y="68" width="6" height="12" fill="#0F766E" />
                      <rect x="78" y="78" width="10" height="8" fill="#0D9488" />
                    </svg>
                  </div>

                  {/* Status Indicator & Timer */}
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5 text-amber-600 font-semibold bg-amber-50 dark:bg-amber-950/50 px-3 py-1 rounded-full border border-amber-200">
                      <Clock className="w-3.5 h-3.5 animate-pulse" />
                      Aguardando pagamento...
                    </span>
                    <span className="text-slate-400 font-financial">
                      Expira em: <strong className="text-slate-700 dark:text-zinc-200">{formatTimer(pixTimeRemaining)}</strong>
                    </span>
                  </div>
                </div>

                {/* Copia e Cola Box */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300 block">
                    Código Pix Copia e Cola:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={createdTx.pixCopiaECola || '00020126580014br.gov.bcb.pix0136...'}
                      className="w-full text-xs font-mono rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800 px-3 py-2.5 text-slate-600 dark:text-zinc-300 select-all"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(createdTx.pixCopiaECola || '');
                        toast.success('Código Pix copiado para a área de transferência!');
                      }}
                      className="shrink-0 p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 hover:bg-slate-100 transition-colors flex items-center gap-1 text-xs font-semibold"
                    >
                      <Copy className="w-4 h-4" />
                      <span>Copiar</span>
                    </button>
                  </div>
                </div>

                {/* Interactive Webhook Simulator Button */}
                <div className="pt-4 border-t border-slate-100 dark:border-zinc-800 space-y-3">
                  <div className="p-3.5 rounded-2xl bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200/80 dark:border-teal-800 text-xs text-teal-800 dark:text-teal-300 flex items-center gap-2.5">
                    <Sparkles className="w-5 h-5 shrink-0 text-teal-600" />
                    <div>
                      <span className="font-bold block">Simulação de Confirmação Automática (Webhook)</span>
                      <span>No fluxo real, o banco notifica via webhook em ~2 segundos. Clique abaixo para simular a resposta do Banco Central.</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleSimulatePaymentApproval}
                    className="w-full py-3 rounded-2xl text-xs sm:text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-md flex items-center justify-center gap-2 transition-all active:scale-98"
                  >
                    {isProcessing ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    <span>Simular Pagamento Pix Recebido no Banco</span>
                  </button>
                </div>
              </div>
            )}

            {/* CARTÃO DE CRÉDITO OU DÉBITO MODAL / DISPLAY */}
            {(createdTx.paymentMethod === 'CREDIT_CARD' || createdTx.paymentMethod === 'DEBIT_CARD') && (
              <div className="space-y-6">
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-blue-600" />
                      {createdTx.paymentMethod === 'CREDIT_CARD' ? 'Cartão de Crédito' : 'Cartão de Débito'}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                      {createdTx.installments}x de {formatBRL(createdTx.installmentValue || Math.round(createdTx.totalAmount / createdTx.installments))}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    Aproxime ou insira o cartão na máquina Smart POS conectada à recepção.
                  </div>
                  <div className="p-3 bg-white dark:bg-zinc-900 rounded-xl border border-slate-200 dark:border-zinc-700 font-mono text-xs flex justify-between">
                    <span>Terminal: TEF-PINPAD-01</span>
                    <span className="text-emerald-600 font-bold">PRONTO PARA CAPTURA</span>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleSimulatePaymentApproval}
                  className="w-full py-3.5 rounded-2xl text-xs sm:text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md flex items-center justify-center gap-2 transition-all active:scale-98"
                >
                  {isProcessing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>Autorizar Transação na Maquininha (Smart POS)</span>
                </button>
              </div>
            )}

            {/* BOLETO DISPLAY */}
            {createdTx.paymentMethod === 'BOLETO' && (
              <div className="space-y-6">
                <div className="p-5 rounded-2xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-200 dark:border-zinc-800 space-y-3 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-900 dark:text-white">
                      Boleto Bancário Registrado
                    </span>
                    <span className="text-amber-600 font-semibold">
                      Vencimento: {new Date(Date.now() + 3 * 86400000).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <div className="font-mono bg-white dark:bg-zinc-900 p-3 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs break-all">
                    {createdTx.digitableLine || '23793.38128 60083.013028 40110.000001 8 98210000120000'}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={handleSimulatePaymentApproval}
                  className="w-full py-3.5 rounded-2xl text-xs sm:text-sm font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md flex items-center justify-center gap-2 transition-all active:scale-98"
                >
                  {isProcessing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>Simular Compensação do Boleto</span>
                </button>
              </div>
            )}

            {/* Back Button */}
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
              >
                ← Voltar e editar dados do atendimento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: SUCESSO & EMISSÃO FISCAL */}
      {step === 3 && createdTx && (
        <div className="max-w-xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-slate-200 dark:border-zinc-800 shadow-2xl text-center space-y-6">
            {/* Success Icon */}
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1">
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                Atendimento Concluído com Sucesso
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                Pagamento Confirmado
              </h2>
              <p className="text-xs text-slate-500">
                Cobrança #{createdTx.code} • Total: {formatBRL(createdTx.totalAmount)}
              </p>
            </div>

            {/* Card with Receipt & Fiscal Status */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-zinc-800/50 border border-slate-100 dark:border-zinc-800 text-left space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Paciente:</span>
                <span className="font-bold text-slate-900 dark:text-white">{createdTx.patientName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Documento Fiscal:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <FileCheck2 className="w-3.5 h-3.5" />
                  {createdTx.invoiceNumber || 'NFS-e Emitida'} (Autorizada)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Forma de Pagamento:</span>
                <span className="font-semibold text-slate-800 dark:text-zinc-200">{createdTx.paymentMethod}</span>
              </div>
              {createdTx.cashChange > 0 && (
                <div className="flex justify-between text-emerald-600 font-bold">
                  <span>Troco Devolvido:</span>
                  <span>{formatBRL(createdTx.cashChange)}</span>
                </div>
              )}
            </div>

            {/* Action Buttons: Comprovante e NFS-e */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowReceipt(true)}
                className="py-3 px-4 rounded-2xl text-xs font-bold border border-slate-200 dark:border-zinc-700 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-800 dark:text-zinc-200 flex items-center justify-center gap-2 transition-colors"
              >
                <FileText className="w-4 h-4" />
                <span>Visualizar Comprovante</span>
              </button>

              <button
                type="button"
                onClick={() => setShowInvoice(true)}
                className="py-3 px-4 rounded-2xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 shadow-sm transition-colors"
              >
                <FileCheck2 className="w-4 h-4" />
                <span>Espelho da NFS-e</span>
              </button>
            </div>

            {/* Return to Dashboard */}
            <div className="pt-2 flex justify-center gap-4">
              <button
                type="button"
                onClick={handleResetCheckout}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                + Realizar Novo Checkout
              </button>
              <span className="text-slate-300">•</span>
              <Link
                href="/"
                className="text-xs font-bold text-slate-900 dark:text-white hover:underline"
              >
                Voltar ao Dashboard Financeiro →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <ReceiptModal
        transaction={createdTx}
        isOpen={showReceipt}
        onClose={() => setShowReceipt(false)}
      />

      <InvoiceModal
        transaction={createdTx}
        isOpen={showInvoice}
        onClose={() => setShowInvoice(false)}
      />
    </FinancialLayout>
  );
}
