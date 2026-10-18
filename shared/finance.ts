import { z } from "zod";
export const MAX_MONEY = 1_000_000_000;
export const money = z.number().int().min(0).max(MAX_MONEY);
export const positiveMoney = money.refine(
  v => v > 0,
  "Informe um valor maior que zero"
);
const id = z.number().int().positive().max(2147483647);
const financialDate = z.coerce
  .date()
  .refine(
    d => d.getUTCFullYear() >= 2000 && d.getUTCFullYear() <= 2036,
    "Vencimento deve estar entre 2000 e 2036"
  );
const label = z.string().trim().min(2).max(128);
export const paymentMethod = z.enum([
  "PIX",
  "CREDIT_CARD",
  "DEBIT_CARD",
  "BOLETO",
  "CASH",
  "TRANSFER",
]);
export const operation = z.object({ requestId: z.string().uuid() });
export const chargeInput = operation
  .extend({
    patientId: id,
    appointmentId: id.optional(),
    verticalCode: z.string().trim().min(1).max(32),
    title: z.string().trim().min(2).max(255),
    category: z.string().trim().min(2).max(64),
    paymentMethod,
    dueDate: financialDate,
    discount: money.default(0),
    addition: money.default(0),
    installments: z.number().int().min(1).max(24).default(1),
    items: z
      .array(
        z
          .object({
            name: z.string().trim().min(2).max(255),
            quantity: z.number().int().min(1).max(10000),
            unitPrice: positiveMoney,
            subtotal: money.optional(),
            type: z.string().trim().min(1).max(32).optional(),
          })
          .strict()
      )
      .min(1)
      .max(100),
    subtotal: money.optional(),
    totalAmount: positiveMoney.optional(),
    installmentValue: money.optional(),
    cashReceived: money.optional(),
    cashChange: money.optional(),
    status: z.literal("PENDING").optional(),
    notes: z.string().trim().max(2000).optional(),
    // Campos antigos nunca são usados como identidade ou autoria.
    patientName: z.string().max(128).optional(),
    patientDocument: z.string().max(32).optional(),
    professionalName: z.string().max(128).optional(),
    operatorName: z.string().max(128).optional(),
  })
  .strict();
export const receiptInput = operation
  .extend({
    code: z.string().min(1).max(32),
    revision: id,
    amount: positiveMoney,
    reference: z.string().trim().min(5).max(160),
    cashReceived: money.optional(),
  })
  .strict();
export const reversalInput = receiptInput
  .omit({ cashReceived: true })
  .extend({ reason: z.string().trim().min(8).max(1000) })
  .strict();
export const payableInput = operation
  .extend({
    verticalCode: z.string().min(1).max(32),
    supplierName: label,
    description: z.string().trim().min(3).max(1000),
    category: z.string().trim().min(2).max(64),
    amount: positiveMoney,
    dueDate: financialDate,
    paymentMethod,
    beneficiaryDocument: z.string().trim().max(32).optional(),
    notes: z.string().max(1000).optional(),
  })
  .strict();
export const openCashInput = operation
  .extend({ verticalCode: z.string().min(1).max(32), openingBalance: money })
  .strict();
export const closeCashInput = operation
  .extend({
    sessionId: id,
    revision: id,
    closingBalance: money,
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();
export const cashMoveInput = operation
  .extend({
    sessionId: id,
    revision: id,
    amount: positiveMoney,
    direction: z.enum(["IN", "OUT"]),
    reason: z.string().trim().min(8).max(1000),
  })
  .strict();
export function calculateCharge(input: z.infer<typeof chargeInput>) {
  if (
    installmentDate(input.dueDate, input.installments - 1).getUTCFullYear() >
    2037
  )
    throw new Error(
      "Último vencimento deve ser anterior a 2038; confira a quantidade de parcelas"
    );
  const subtotals = input.items.map(i => {
    const n = i.quantity * i.unitPrice;
    if (!Number.isSafeInteger(n) || n > MAX_MONEY)
      throw new Error("Valor do item excede o limite");
    if (i.subtotal !== undefined && i.subtotal !== n)
      throw new Error("Subtotal do item inconsistente");
    return n;
  });
  const subtotal = subtotals.reduce((a, b) => a + b, 0),
    total = subtotal - input.discount + input.addition;
  if (
    subtotal > MAX_MONEY ||
    input.discount > subtotal ||
    !Number.isSafeInteger(total) ||
    total < 1 ||
    total > MAX_MONEY
  )
    throw new Error("Total ou desconto inválido");
  if (
    (input.subtotal !== undefined && input.subtotal !== subtotal) ||
    (input.totalAmount !== undefined && input.totalAmount !== total)
  )
    throw new Error("Totais enviados diferem do cálculo do servidor");
  if (input.installments > total)
    throw new Error("Cada parcela deve ter pelo menos um centavo");
  const amounts = Array.from(
    { length: input.installments },
    (_, i) =>
      Math.floor(total / input.installments) +
      (i < total % input.installments ? 1 : 0)
  );
  if (
    input.installmentValue !== undefined &&
    input.installmentValue !== amounts[0]
  )
    throw new Error("Parcela inconsistente");
  if (input.cashReceived !== undefined || input.cashChange !== undefined)
    throw new Error(
      "Registre o recebimento separadamente após criar a cobrança"
    );
  return { subtotal, total, subtotals, amounts };
}
export function installmentDate(date: Date, index: number) {
  const y = date.getUTCFullYear(),
    m = date.getUTCMonth() + index,
    day = date.getUTCDate();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, last), 12));
}
export function reaisToCents(raw: string) {
  const s = raw.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s))
    throw new Error("Informe reais com até duas casas decimais");
  const [whole, fraction = ""] = s.split("."),
    n = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(n) || n > MAX_MONEY)
    throw new Error("Valor fora do limite");
  return n;
}
