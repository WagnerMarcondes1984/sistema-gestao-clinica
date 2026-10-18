import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "wouter";
import { trpc } from "../lib/trpc";
import { FinancialLayout } from "../components/FinancialLayout";
import { useAuth } from "../_core/hooks/useAuth";
import {
  fieldClass,
  buttonClass,
  SessionNotice,
} from "../components/patients/PatientSelector";
import {
  reaisToCents,
  calculateCharge,
  chargeInput,
} from "../../../shared/finance";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../components/ui/dialog";
const brl = (n: number) =>
  (n / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const statusLabels: Record<string, string> = {
  PENDING: "Pendente",
  OVERDUE: "Vencida",
  PAID: "Recebida",
  REFUNDED: "Totalmente revertida",
  PARTIALLY_REFUNDED: "Com reversão parcial",
  FAILED: "Falha",
  CANCELLED: "Cancelada",
};
const movementLabels: Record<string, string> = {
  RECEIPT: "Recebimento manual",
  REVERSAL: "Reversão interna",
  PAYABLE_PAYMENT: "Pagamento de despesa",
  CASH_IN: "Suprimento",
  CASH_OUT: "Sangria",
};
const methods = {
  CASH: "Dinheiro",
  TRANSFER: "Transferência",
  PIX: "PIX",
  CREDIT_CARD: "Cartão de crédito",
  DEBIT_CARD: "Cartão de débito",
  BOLETO: "Boleto",
};
type Method = keyof typeof methods;
type View =
  | "create"
  | "transactions"
  | "receivables"
  | "payables"
  | "cash"
  | "report";
const titles: Record<View, string> = {
  create: "Nova cobrança interna",
  transactions: "Cobranças e recebimentos",
  receivables: "Contas a receber",
  payables: "Contas a pagar",
  cash: "Caixa físico",
  report: "Resumo financeiro",
};
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
function Input({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label}>
      <input className={fieldClass} {...props} />
    </Field>
  );
}
function MethodSelect({
  value,
  onChange,
}: {
  value: Method;
  onChange: (v: Method) => void;
}) {
  return (
    <Field label="Meio informado">
      <select
        className={fieldClass}
        value={value}
        onChange={e => onChange(e.target.value as Method)}
      >
        {Object.entries(methods).map(([v, label]) => (
          <option key={v} value={v}>
            {label}
          </option>
        ))}
      </select>
    </Field>
  );
}
function Confirm({
  title,
  children,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  busy: boolean;
  error: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={v => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent
        showCloseButton={!busy}
        onEscapeKeyDown={e => {
          if (busy) e.preventDefault();
        }}
        onInteractOutside={e => e.preventDefault()}
        className="bg-white text-slate-900 max-h-[90vh] overflow-y-auto space-y-4"
      >
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          Revise os dados e confirme o registro interno.
        </DialogDescription>
        {children}
        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <p className="text-sm text-slate-600">
          Confira antes de confirmar. Esta operação registra o controle interno
          e não movimenta sua conta bancária.
        </p>
        <div className="flex gap-3">
          <button className={buttonClass} disabled={busy} onClick={onConfirm}>
            {busy ? "Registrando…" : "Confirmar registro"}
          </button>
          <button
            type="button"
            className="border rounded-xl px-4 py-2"
            disabled={busy}
            onClick={onClose}
          >
            Voltar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
function ChargeForm({ refresh }: { refresh: () => Promise<void> }) {
  const context = trpc.transactions.context.useQuery();
  const create = trpc.transactions.create.useMutation();
  const [patientId, setPatient] = useState(""),
    [appointmentId, setSession] = useState(""),
    [title, setTitle] = useState(""),
    [method, setMethod] = useState<Method>("TRANSFER"),
    [date, setDate] = useState(""),
    [count, setCount] = useState(1),
    [discount, setDiscount] = useState("0"),
    [addition, setAddition] = useState("0");
  const [items, setItems] = useState([{ name: "", quantity: 1, value: "" }]),
    [error, setError] = useState(""),
    [review, setReview] = useState<ReturnType<typeof chargeInput.parse> | null>(
      null
    ),
    [requestId, setRequest] = useState(() => crypto.randomUUID());
  const patients =
    context.data?.patients.filter(p => p.status === "ACTIVE") || [];
  function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const input = chargeInput.parse({
        requestId,
        patientId: Number(patientId),
        appointmentId: appointmentId ? Number(appointmentId) : undefined,
        verticalCode: "PSYCHOLOGY_CLINIC",
        title,
        category: "Atendimento",
        paymentMethod: method,
        dueDate: new Date(`${date}T12:00:00Z`),
        discount: reaisToCents(discount),
        addition: reaisToCents(addition),
        installments: count,
        items: items.map(i => ({
          name: i.name,
          quantity: i.quantity,
          unitPrice: reaisToCents(i.value),
        })),
      });
      calculateCharge(input);
      setError("");
      setReview(input);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confira os campos");
    }
  }
  async function confirm() {
    if (!review) return;
    try {
      const r = await create.mutateAsync(review);
      await refresh();
      setReview(null);
      setRequest(crypto.randomUUID());
      setTitle("");
      setItems([{ name: "", quantity: 1, value: "" }]);
      toast.success(`Cobrança ${r?.code} criada, aguardando recebimento.`);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const preview = review ? calculateCharge(review) : null;
  return (
    <>
      <form
        onSubmit={submit}
        className="rounded-2xl border bg-white p-5 space-y-4 text-slate-900"
      >
        <h2 className="font-bold text-lg">Dados da cobrança</h2>
        <Field label="Paciente">
          <select
            required
            className={fieldClass}
            value={patientId}
            onChange={e => {
              setPatient(e.target.value);
              setSession("");
            }}
          >
            <option value="">Selecione</option>
            {patients.map(p => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Atendimento vinculado (opcional)">
          <select
            className={fieldClass}
            value={appointmentId}
            onChange={e => setSession(e.target.value)}
          >
            <option value="">Sem atendimento</option>
            {context.data?.sessions
              .filter(
                s =>
                  s.patientId === Number(patientId) &&
                  !["CANCELLED", "RESCHEDULED"].includes(s.status)
              )
              .map(s => (
                <option key={s.id} value={s.id}>
                  {new Date(s.startsAt).toLocaleString("pt-BR", {
                    timeZone: context.data?.timezone,
                  })}{" "}
                  — {s.professionalName}
                </option>
              ))}
          </select>
        </Field>
        <Input
          label="Descrição"
          required
          minLength={2}
          maxLength={255}
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
        {items.map((item, index) => (
          <fieldset
            key={index}
            className="border rounded-xl p-3 grid gap-3 sm:grid-cols-3"
          >
            <legend>Item {index + 1}</legend>
            <Input
              label="Serviço"
              required
              minLength={2}
              value={item.name}
              onChange={e =>
                setItems(
                  items.map((i, n) =>
                    n === index ? { ...i, name: e.target.value } : i
                  )
                )
              }
            />
            <Input
              label="Quantidade"
              required
              type="number"
              min="1"
              max="10000"
              value={item.quantity}
              onChange={e =>
                setItems(
                  items.map((i, n) =>
                    n === index ? { ...i, quantity: Number(e.target.value) } : i
                  )
                )
              }
            />
            <Input
              label="Preço unitário (R$)"
              required
              inputMode="decimal"
              value={item.value}
              onChange={e =>
                setItems(
                  items.map((i, n) =>
                    n === index ? { ...i, value: e.target.value } : i
                  )
                )
              }
            />
            {items.length > 1 && (
              <button
                type="button"
                className="text-red-700"
                onClick={() => setItems(items.filter((_, n) => n !== index))}
              >
                Remover item {index + 1}
              </button>
            )}
          </fieldset>
        ))}
        <button
          type="button"
          className="border rounded-xl p-2"
          disabled={items.length >= 100}
          onClick={() =>
            setItems([...items, { name: "", quantity: 1, value: "" }])
          }
        >
          Adicionar item
        </button>
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Desconto (R$)"
            inputMode="decimal"
            value={discount}
            onChange={e => setDiscount(e.target.value)}
          />
          <Input
            label="Acréscimo (R$)"
            inputMode="decimal"
            value={addition}
            onChange={e => setAddition(e.target.value)}
          />
          <Input
            label="Parcelas"
            type="number"
            min="1"
            max="24"
            value={count}
            onChange={e => setCount(Number(e.target.value))}
          />
          <Input
            label="Primeiro vencimento"
            required
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
          <MethodSelect value={method} onChange={setMethod} />
        </div>
        {error && !review && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <button className={buttonClass} disabled={!context.data}>
          Revisar cobrança
        </button>
      </form>
      {review && preview && (
        <Confirm
          title="Revisar nova cobrança"
          busy={create.isPending}
          error={error}
          onConfirm={confirm}
          onClose={() => setReview(null)}
        >
          <p>
            {patients.find(p => p.id === review.patientId)?.fullName} —{" "}
            {review.title}
          </p>
          <p>
            Subtotal {brl(preview.subtotal)}; desconto {brl(review.discount)};
            acréscimo {brl(review.addition)}.
          </p>
          <p className="font-bold">Total: {brl(preview.total)}</p>
          <p>
            Parcelas: {preview.amounts.map(brl).join(" + ")}. Vencimentos
            mensais, ajustados ao último dia do mês.
          </p>
          <p>
            Nasce pendente. Nenhum recebimento ou documento fiscal será gerado
            automaticamente.
          </p>
        </Confirm>
      )}
    </>
  );
}
function MoneyAction({
  target,
  kind,
  refresh,
  onClose,
}: {
  target: {
    code: string;
    revision: number;
    paymentMethod: string | null;
    remaining: number;
  };
  kind: "receipt" | "reversal" | "payable";
  refresh: () => Promise<void>;
  onClose: () => void;
}) {
  const receipt = trpc.transactions.confirm.useMutation(),
    reversal = trpc.transactions.refund.useMutation(),
    pay = trpc.accountsPayable.pay.useMutation();
  const [amount, setAmount] = useState((target.remaining / 100).toFixed(2)),
    [reference, setReference] = useState(""),
    [reason, setReason] = useState(""),
    [cash, setCash] = useState(""),
    [requestId] = useState(() => crypto.randomUUID()),
    [error, setError] = useState(""),
    [review, setReview] = useState(false);
  const title =
    kind === "receipt"
      ? "Registrar recebimento manual"
      : kind === "payable"
        ? "Registrar pagamento manual"
        : "Registrar reversão interna";
  async function confirm() {
    try {
      const body = {
        code: target.code,
        revision: target.revision,
        requestId,
        amount: reaisToCents(amount),
        reference,
      };
      if (kind === "reversal") await reversal.mutateAsync({ ...body, reason });
      else if (kind === "payable") await pay.mutateAsync(body);
      else
        await receipt.mutateAsync({
          ...body,
          cashReceived:
            target.paymentMethod === "CASH" ? reaisToCents(cash) : undefined,
        });
      await refresh();
      toast.success("Registro interno salvo e auditado.");
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <Confirm
      title={title}
      busy={receipt.isPending || reversal.isPending || pay.isPending}
      error={error}
      onConfirm={() => {
        if (!review) {
          try {
            const value = reaisToCents(amount);
            if (!value || value > target.remaining)
              throw new Error("Confira o valor e o saldo disponível");
            if (reference.trim().length < 5)
              throw new Error(
                "Informe uma referência de pelo menos 5 caracteres"
              );
            if (kind === "reversal" && reason.trim().length < 8)
              throw new Error("Descreva o motivo");
            if (
              kind === "receipt" &&
              target.paymentMethod === "CASH" &&
              reaisToCents(cash) < value
            )
              throw new Error("Dinheiro recebido insuficiente");
            setError("");
            setReview(true);
          } catch (e) {
            setError((e as Error).message);
          }
          return;
        }
        void confirm();
      }}
      onClose={onClose}
    >
      <p>
        Código {target.code}; saldo disponível {brl(target.remaining)}.{" "}
        {methods[target.paymentMethod as Method] || target.paymentMethod}
      </p>
      {review ? (
        <>
          <p className="font-bold">Confira: {brl(reaisToCents(amount))}</p>
          <p>Referência: {reference}</p>
          {reason && <p>Motivo: {reason}</p>}
          {kind === "receipt" && target.paymentMethod === "CASH" && (
            <p>
              Recebido {brl(reaisToCents(cash))}; troco{" "}
              {brl(reaisToCents(cash) - reaisToCents(amount))}
            </p>
          )}
          <button className="underline" onClick={() => setReview(false)}>
            Corrigir dados
          </button>
        </>
      ) : (
        <>
          <Input
            label="Valor (R$)"
            inputMode="decimal"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
          <Input
            label="Referência do comprovante / controle"
            required
            minLength={5}
            maxLength={160}
            value={reference}
            onChange={e => setReference(e.target.value)}
          />
          {kind === "receipt" && target.paymentMethod === "CASH" && (
            <Input
              label="Dinheiro entregue (R$)"
              inputMode="decimal"
              value={cash}
              onChange={e => setCash(e.target.value)}
            />
          )}
          {kind === "reversal" && (
            <Input
              label="Motivo da reversão"
              required
              minLength={8}
              maxLength={1000}
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          )}
        </>
      )}
    </Confirm>
  );
}
function PayableForm({ refresh }: { refresh: () => Promise<void> }) {
  const create = trpc.accountsPayable.create.useMutation();
  const [supplier, setSupplier] = useState(""),
    [description, setDescription] = useState(""),
    [amount, setAmount] = useState(""),
    [date, setDate] = useState(""),
    [method, setMethod] = useState<Method>("TRANSFER"),
    [error, setError] = useState(""),
    [requestId, setRequest] = useState(() => crypto.randomUUID()),
    [review, setReview] = useState(false);
  async function submit() {
    try {
      await create.mutateAsync({
        requestId,
        verticalCode: "PSYCHOLOGY_CLINIC",
        supplierName: supplier,
        description,
        category: "Despesa",
        amount: reaisToCents(amount),
        dueDate: new Date(`${date}T12:00:00Z`),
        paymentMethod: method,
      });
      await refresh();
      setReview(false);
      setRequest(crypto.randomUUID());
      setDescription("");
      setAmount("");
      toast.success("Despesa cadastrada.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <form
        className="border rounded-2xl p-5 bg-white space-y-3 text-slate-900"
        onSubmit={e => {
          e.preventDefault();
          try {
            if (!reaisToCents(amount))
              throw new Error("Informe um valor positivo");
            setError("");
            setReview(true);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        <h2 className="font-bold">Nova despesa</h2>
        <Input
          label="Fornecedor"
          required
          minLength={2}
          maxLength={128}
          value={supplier}
          onChange={e => setSupplier(e.target.value)}
        />
        <Input
          label="Descrição da despesa"
          required
          minLength={3}
          maxLength={1000}
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
        <Input
          label="Valor da despesa (R$)"
          required
          inputMode="decimal"
          value={amount}
          onChange={e => setAmount(e.target.value)}
        />
        <Input
          label="Vencimento da despesa"
          required
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
        />
        <MethodSelect value={method} onChange={setMethod} />
        {error && !review && <p role="alert">{error}</p>}
        <button className={buttonClass}>Revisar despesa</button>
      </form>
      {review && (
        <Confirm
          title="Revisar despesa"
          busy={create.isPending}
          error={error}
          onConfirm={submit}
          onClose={() => setReview(false)}
        >
          <p>
            {supplier} — {description}
          </p>
          <p>
            {brl(reaisToCents(amount))}; vencimento {date}; {methods[method]}
          </p>
        </Confirm>
      )}
    </>
  );
}
function CashPanel({
  canManage,
  refresh,
}: {
  canManage: boolean;
  refresh: () => Promise<void>;
}) {
  const list = trpc.cash.list.useQuery({ verticalCode: "PSYCHOLOGY_CLINIC" }),
    open = trpc.cash.open.useMutation(),
    close = trpc.cash.close.useMutation(),
    move = trpc.cash.move.useMutation();
  const [action, setAction] = useState<"open" | "close" | "in" | "out" | null>(
      null
    ),
    [amount, setAmount] = useState(""),
    [notes, setNotes] = useState(""),
    [error, setError] = useState(""),
    [requestId, setRequest] = useState(() => crypto.randomUUID()),
    [review, setReview] = useState(false);
  const current = list.data?.find(s => s.status === "OPEN");
  async function confirm() {
    try {
      const n = reaisToCents(amount);
      if (!review) {
        if (
          (action === "in" || action === "out") &&
          (!n || notes.trim().length < 8)
        )
          throw new Error("Informe valor positivo e motivo com 8 caracteres");
        setError("");
        setReview(true);
        return;
      }
      if (action === "open")
        await open.mutateAsync({
          requestId,
          verticalCode: "PSYCHOLOGY_CLINIC",
          openingBalance: n,
        });
      else if (current && action === "close")
        await close.mutateAsync({
          requestId,
          sessionId: current.id,
          revision: current.revision,
          closingBalance: n,
          notes,
        });
      else if (current)
        await move.mutateAsync({
          requestId,
          sessionId: current.id,
          revision: current.revision,
          amount: n,
          direction: action === "in" ? "IN" : "OUT",
          reason: notes,
        });
      await Promise.all([refresh(), list.refetch()]);
      setAction(null);
      toast.success("Caixa atualizado.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function start(a: NonNullable<typeof action>) {
    setAction(a);
    setAmount("");
    setNotes("");
    setError("");
    setReview(false);
    setRequest(crypto.randomUUID());
  }
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-bold">Caixa da clínica — psicologia</h2>
      {list.error && <p role="alert">{list.error.message}</p>}
      {current ? (
        <div className="border bg-white text-slate-900 rounded-2xl p-5 space-y-3">
          <p>
            {current.sessionNumber} —{" "}
            {current.ledgerVersion === 1
              ? "Livro de movimentos ativo"
              : "Legado não conferido; movimentação bloqueada"}
          </p>
          <p>
            Abertura {brl(current.openingBalance)} + entradas{" "}
            {brl(current.cashInflow)} − saídas {brl(current.cashOutflow)}
          </p>
          <p className="font-bold text-xl">
            Esperado: {brl(current.expectedBalance)}
          </p>
          {canManage && current.ledgerVersion === 1 && (
            <div className="flex gap-2 flex-wrap">
              <button className={buttonClass} onClick={() => start("in")}>
                Suprimento
              </button>
              <button className={buttonClass} onClick={() => start("out")}>
                Sangria
              </button>
              <button className={buttonClass} onClick={() => start("close")}>
                Conferir e fechar caixa
              </button>
            </div>
          )}
        </div>
      ) : canManage ? (
        <button className={buttonClass} onClick={() => start("open")}>
          Abrir caixa
        </button>
      ) : (
        <p>Nenhum caixa aberto.</p>
      )}
      <div className="space-y-2">
        {list.data?.map(s => (
          <article
            key={s.id}
            className="border rounded-xl p-4 bg-white text-slate-900"
          >
            <p>
              {s.sessionNumber} — {s.status === "OPEN" ? "Aberto" : "Fechado"}
            </p>
            <p>
              Esperado {brl(s.expectedBalance)}
              {s.status === "CLOSED" &&
                `; contado ${brl(s.closingBalance || 0)}; diferença ${brl(s.difference || 0)}`}
            </p>
            {s.closingNotes && <p>{s.closingNotes}</p>}
          </article>
        ))}
      </div>
      {action && (
        <Confirm
          title={
            action === "open"
              ? "Abertura de caixa"
              : action === "close"
                ? "Fechamento de caixa"
                : action === "in"
                  ? "Suprimento de caixa"
                  : "Sangria de caixa"
          }
          busy={open.isPending || close.isPending || move.isPending}
          error={error}
          onConfirm={confirm}
          onClose={() => setAction(null)}
        >
          {review ? (
            <>
              <p>Valor conferido: {brl(reaisToCents(amount))}</p>
              <p>{notes}</p>
              {action === "close" && current && (
                <p>
                  Diferença:{" "}
                  {brl(reaisToCents(amount) - current.expectedBalance)}
                </p>
              )}
              <button className="underline" onClick={() => setReview(false)}>
                Corrigir
              </button>
            </>
          ) : (
            <>
              <Input
                label={
                  action === "close"
                    ? "Valor físico contado (R$)"
                    : "Valor (R$)"
                }
                inputMode="decimal"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
              <Input
                label="Motivo / observação"
                maxLength={1000}
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </>
          )}
        </Confirm>
      )}
    </section>
  );
}
export default function FinancialWorkspace({ view }: { view: View }) {
  const auth = useAuth(),
    utils = trpc.useUtils();
  const context = trpc.transactions.context.useQuery(undefined, {
    enabled: auth.isAuthenticated,
    retry: false,
  });
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(0);
  const charges = trpc.transactions.list.useQuery(
    {
      limit: 100,
      offset: page * 100,
      search,
      openOnly: view === "receivables",
    },
    {
      enabled: !!context.data && ["transactions", "receivables"].includes(view),
      retry: false,
    }
  );
  const payables = trpc.accountsPayable.list.useQuery(
      {},
      { enabled: !!context.data && view === "payables", retry: false }
    ),
    metrics = trpc.dashboard.metrics.useQuery(
      {},
      { enabled: !!context.data && view === "report", retry: false }
    );
  const movements = trpc.transactions.movements.useQuery(undefined, {
    enabled: !!context.data && view === "report",
    retry: false,
  });
  const [detail, setDetail] = useState(""),
    [action, setAction] = useState<{
      target: {
        code: string;
        revision: number;
        paymentMethod: string | null;
        remaining: number;
      };
      kind: "receipt" | "reversal" | "payable";
    } | null>(null);
  const details = trpc.transactions.getByCode.useQuery(
    { code: detail },
    { enabled: !!detail, retry: false }
  );
  const refresh = async () => {
    await Promise.all([
      utils.transactions.invalidate(),
      utils.accountsPayable.invalidate(),
      utils.cash.invalidate(),
      utils.dashboard.invalidate(),
      utils.audit.invalidate(),
    ]);
  };
  const rows =
    charges.data?.filter(
      r =>
        (view !== "receivables" ||
          (r.remainingAmount > 0 &&
            ["PENDING", "OVERDUE", "PARTIALLY_REFUNDED"].includes(r.status))) &&
        [r.code, r.title, r.patientName].some(v =>
          v.toLocaleLowerCase().includes(search.toLocaleLowerCase())
        )
    ) || [];
  return (
    <FinancialLayout
      showFiscalBanner={false}
      contextLabel="Financeiro interno"
      operatorName={auth.user?.name || undefined}
    >
      <div className="space-y-6">
        <h1 className="font-bold text-2xl">{titles[view]}</h1>
        <nav className="flex gap-3 flex-wrap text-sm">
          {[
            ["/finance", "Resumo"],
            ["/checkout", "Nova cobrança"],
            ["/transactions", "Cobranças"],
            ["/receivables", "A receber"],
            ["/payables", "A pagar"],
            ["/cash", "Caixa"],
            ["/audit", "Auditoria"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="underline">
              {label}
            </Link>
          ))}
        </nav>
        <p className="border rounded-xl p-4 bg-amber-50 text-amber-950 text-sm">
          Pagamentos e emissão fiscal: provedores a definir. Baixas e reversões
          são registros manuais internos, com referência e autoria. Não há PIX,
          boleto, cartão, transferência ou estorno bancário executados por esta
          tela.
        </p>
        <SessionNotice
          loading={auth.loading}
          authenticated={auth.isAuthenticated}
        />
        {context.error && (
          <p role="alert" className="text-red-700">
            {context.error.message}
          </p>
        )}
        {context.data && (
          <>
            <p className="text-sm text-slate-500">
              Clínica: {context.data.clinicName}. Fuso: {context.data.timezone}.{" "}
              {context.data.canManage
                ? "Acesso de gestão financeira."
                : "Acesso somente de consulta."}
            </p>
            {view === "create" &&
              (context.data.canManage ? (
                <ChargeForm refresh={refresh} />
              ) : (
                <p>Seu acesso permite somente consulta.</p>
              ))}
            {["transactions", "receivables"].includes(view) && (
              <>
                <Input
                  label="Buscar cobrança"
                  value={search}
                  onChange={e => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                />
                <div className="flex items-center gap-3 text-sm">
                  <button
                    className="border rounded-xl p-2"
                    disabled={page === 0 || charges.isFetching}
                    onClick={() => setPage(p => p - 1)}
                  >
                    Página anterior
                  </button>
                  <span>Página {page + 1} • até 100 cobranças</span>
                  <button
                    className="border rounded-xl p-2"
                    disabled={
                      (charges.data?.length || 0) < 100 ||
                      charges.isFetching ||
                      page >= 1000
                    }
                    onClick={() => setPage(p => p + 1)}
                  >
                    Próxima página
                  </button>
                </div>
                {charges.error && <p role="alert">{charges.error.message}</p>}
                {charges.isLoading && <p>Carregando cobranças…</p>}
                {!charges.isLoading && !rows.length && (
                  <p>Nenhuma cobrança encontrada.</p>
                )}
                {rows.map(r => (
                  <article
                    key={r.id}
                    className="bg-white text-slate-900 rounded-2xl border p-5 space-y-2"
                  >
                    <h2 className="font-bold">
                      {r.title} — {r.patientName}
                    </h2>
                    <p className="text-sm break-all">
                      {r.code} • {statusLabels[r.status] || r.status} •{" "}
                      {methods[r.paymentMethod]}
                    </p>
                    <p>
                      Total {brl(r.totalAmount)}; recebido bruto{" "}
                      {brl(r.paidAmount)}; revertido {brl(r.refundedAmount)};
                      líquido {brl(r.netReceived)}; a receber{" "}
                      {brl(r.remainingAmount)}.
                    </p>
                    {r.legacyUnverified && (
                      <p className="text-amber-800">
                        Legado não conferido: excluído dos relatórios
                        consolidados e bloqueado para movimentações.
                      </p>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      <button
                        className="border rounded-xl p-2 text-sm"
                        onClick={() => setDetail(r.code)}
                      >
                        Parcelas e histórico
                      </button>
                      {context.data.canManage &&
                        !r.legacyUnverified &&
                        r.remainingAmount > 0 &&
                        ["PENDING", "OVERDUE", "PARTIALLY_REFUNDED"].includes(
                          r.status
                        ) && (
                          <button
                            className={buttonClass}
                            onClick={() =>
                              setAction({
                                kind: "receipt",
                                target: { ...r, remaining: r.remainingAmount },
                              })
                            }
                          >
                            Registrar recebimento manual
                          </button>
                        )}
                      {context.data.canManage &&
                        !r.legacyUnverified &&
                        r.netReceived > 0 &&
                        [
                          "PAID",
                          "PENDING",
                          "OVERDUE",
                          "PARTIALLY_REFUNDED",
                        ].includes(r.status) && (
                          <button
                            className="border border-red-300 text-red-700 rounded-xl p-2 text-sm"
                            onClick={() =>
                              setAction({
                                kind: "reversal",
                                target: { ...r, remaining: r.netReceived },
                              })
                            }
                          >
                            Registrar reversão interna
                          </button>
                        )}
                    </div>
                  </article>
                ))}
              </>
            )}
            {view === "payables" && (
              <>
                {context.data.canManage && <PayableForm refresh={refresh} />}
                {payables.error && <p role="alert">{payables.error.message}</p>}
                {payables.data?.map(r => (
                  <article
                    key={r.id}
                    className="border rounded-2xl bg-white text-slate-900 p-5 space-y-2"
                  >
                    <h2 className="font-bold">
                      {r.supplierName} — {r.description}
                    </h2>
                    <p>
                      {r.code} •{" "}
                      {r.status === "PAID"
                        ? "Paga"
                        : statusLabels[r.status] || r.status}
                    </p>
                    <p>
                      Total {brl(r.amount)}; saldo {brl(r.remainingAmount)}
                    </p>
                    {r.legacyUnverified ? (
                      <p>Legado não conferido; movimentação bloqueada.</p>
                    ) : (
                      context.data.canManage &&
                      r.remainingAmount > 0 &&
                      ["PENDING", "OVERDUE", "PARTIALLY_REFUNDED"].includes(
                        r.status
                      ) && (
                        <button
                          className={buttonClass}
                          onClick={() =>
                            setAction({
                              kind: "payable",
                              target: { ...r, remaining: r.remainingAmount },
                            })
                          }
                        >
                          Registrar pagamento manual
                        </button>
                      )
                    )}
                  </article>
                ))}
              </>
            )}
            {view === "cash" && (
              <CashPanel canManage={context.data.canManage} refresh={refresh} />
            )}
            {view === "report" && (
              <>
                {metrics.error && <p role="alert">{metrics.error.message}</p>}
                {metrics.data && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-3">
                      {[
                        ["Recebido líquido", metrics.data.totalReceived],
                        ["Saldo a receber", metrics.data.totalReceivable],
                        ["Parcelas vencidas", metrics.data.totalOverdue],
                        ["Despesas pendentes", metrics.data.totalPayable],
                        ["Despesas pagas", metrics.data.paidPayable],
                        ["Caixa aberto", metrics.data.cashBalance],
                        ["Reversões internas", metrics.data.totalRefunded],
                        ["Resultado interno", metrics.data.netBalance],
                      ].map(([label, n]) => (
                        <div
                          key={label}
                          className="border rounded-2xl p-5 bg-white text-slate-900"
                        >
                          <p>{label}</p>
                          <strong className="text-xl">{brl(Number(n))}</strong>
                        </div>
                      ))}
                    </div>
                    <p>
                      {metrics.data.legacyCount} registro(s) legado(s) sem
                      conferência excluídos dos totais. Resumo de todo o
                      período; suprimentos e sangrias afetam caixa, sem criar
                      receita ou despesa.
                    </p>
                  </>
                )}
                <h2 className="font-bold">Livro de movimentos</h2>
                {movements.data?.map(m => (
                  <article
                    key={m.id}
                    className="border rounded-xl p-4 bg-white text-slate-900"
                  >
                    <p>
                      #{m.id} — {movementLabels[m.kind] || m.kind} —{" "}
                      {brl(m.amount)}
                    </p>
                    <p>
                      {m.reference}; conta #{m.actorUserId};{" "}
                      {new Date(m.createdAt).toLocaleString("pt-BR", {
                        timeZone: context.data.timezone,
                      })}
                    </p>
                    {m.reason && <p>{m.reason}</p>}
                  </article>
                ))}
              </>
            )}
          </>
        )}
        {detail && (
          <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4">
            <section
              role="dialog"
              aria-modal="true"
              aria-label="Parcelas e histórico"
              className="rounded-2xl bg-white text-slate-900 p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto space-y-3"
            >
              <h2 className="font-bold">Parcelas e histórico — {detail}</h2>
              {details.error && <p role="alert">{details.error.message}</p>}
              {details.data?.parts.map(p => (
                <p key={p.id}>
                  Parcela {p.number}: {brl(p.amount)}; recebido{" "}
                  {brl(p.paidAmount)}; revertido {brl(p.refundedAmount)}; vence{" "}
                  {p.dueDate.toISOString().slice(0, 10)}
                </p>
              ))}
              {details.data?.movements.map(m => (
                <p key={m.id}>
                  {movementLabels[m.kind] || m.kind}: {brl(m.amount)};{" "}
                  {m.reference}; conta #{m.actorUserId}
                </p>
              ))}
              <p>
                Registro interno, sem valor de documento fiscal ou confirmação
                bancária.
              </p>
              <button className={buttonClass} onClick={() => setDetail("")}>
                Fechar histórico
              </button>
            </section>
          </div>
        )}
        {action && (
          <MoneyAction
            {...action}
            refresh={refresh}
            onClose={() => setAction(null)}
          />
        )}
      </div>
    </FinancialLayout>
  );
}
