import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, desc, asc, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, hasMindosPermission, type FinancialActor } from "./db";
import {
  transactions,
  transactionItems,
  accountsPayable,
  cashSessions,
  financialAuditLogs,
  financialOperations,
  financialMovements,
  financialInstallments,
  mindosTenants,
  mindosMemberships,
  mindosPatients,
  mindosAppointments,
  clinicalVerticals,
  users,
} from "../drizzle/schema";
import {
  chargeInput,
  calculateCharge,
  installmentDate,
  receiptInput,
  reversalInput,
  payableInput,
  openCashInput,
  closeCashInput,
  cashMoveInput,
  MAX_MONEY,
} from "../shared/finance";
import { clinicParts } from "../shared/scheduling";
import type { Tx } from "./scheduling";
const fail = (
  code:
    | "BAD_REQUEST"
    | "NOT_FOUND"
    | "CONFLICT"
    | "FORBIDDEN"
    | "PRECONDITION_FAILED",
  message: string
): never => {
  throw new TRPCError({ code, message });
};
const missing = () =>
  fail("NOT_FOUND", "Registro não encontrado nesta clínica");
async function database() {
  const db = await getDb();
  if (!db) return fail("PRECONDITION_FAILED", "Banco indisponível");
  return db;
}
function managed(row: { ledgerVersion: number }) {
  if (row.ledgerVersion !== 1)
    fail(
      "PRECONDITION_FAILED",
      "Legado não conferido: migração financeira revisada necessária antes de movimentar"
    );
}
function revision(row: { revision: number }, expected: number) {
  if (row.revision !== expected)
    fail(
      "CONFLICT",
      "Registro alterado. Atualize e confira os valores antes de tentar novamente"
    );
}
function checked(n: number) {
  if (!Number.isSafeInteger(n) || n < 0 || n > MAX_MONEY)
    fail("BAD_REQUEST", "Saldo ou valor fora do limite permitido");
  return n;
}
const code = (prefix: string) =>
  `${prefix}-${randomUUID().replaceAll("-", "").slice(0, 24)}`;
async function audit(
  tx: Tx,
  actor: FinancialActor,
  verticalCode: string,
  action: string,
  transactionCode: string | null,
  details: string
) {
  await tx.insert(financialAuditLogs).values({
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    operator: actor.operatorName.slice(0, 64),
    verticalCode,
    action,
    transactionCode,
    details,
  });
}
async function mutate<T>(
  actor: FinancialActor,
  requestId: string,
  action: string,
  payload: unknown,
  work: (tx: Tx, a: FinancialActor, operationId: number) => Promise<T>
): Promise<T> {
  const db = await database();
  return db.transaction(async tx => {
    const [clinic] = await tx
      .select()
      .from(mindosTenants)
      .where(eq(mindosTenants.id, actor.tenantId))
      .for("update");
    const members = await tx
      .select()
      .from(mindosMemberships)
      .where(
        and(
          eq(mindosMemberships.userId, actor.userId),
          eq(mindosMemberships.active, true)
        )
      )
      .for("update");
    if (
      clinic?.status !== "ACTIVE" ||
      members.length !== 1 ||
      members[0].tenantId !== actor.tenantId ||
      !hasMindosPermission(members[0], "MANAGE_FINANCIAL")
    )
      return fail("FORBIDDEN", "Acesso financeiro revogado");
    const [account] = await tx
      .select()
      .from(users)
      .where(eq(users.id, actor.userId));
    if (!account) return fail("FORBIDDEN", "Conta indisponível");
    const a = {
      ...actor,
      operatorName: account.name || `Usuário ${account.id}`,
    };
    const hash = createHash("sha256")
      .update(JSON.stringify({ actor: actor.userId, action, payload }))
      .digest("hex");
    const [old] = await tx
      .select()
      .from(financialOperations)
      .where(
        and(
          eq(financialOperations.tenantId, a.tenantId),
          eq(financialOperations.requestId, requestId)
        )
      );
    if (old) {
      if (old.payloadHash !== hash || old.actorUserId !== actor.userId)
        return fail("CONFLICT", "Chave de operação já usada com outros dados");
      return JSON.parse(old.resultJson) as T;
    }
    const [op] = await tx.insert(financialOperations).values({
      tenantId: a.tenantId,
      requestId,
      payloadHash: hash,
      actorUserId: a.userId,
      action,
      resultJson: "null",
    });
    const result = await work(tx, a, op.insertId);
    await tx
      .update(financialOperations)
      .set({ resultJson: JSON.stringify(result) })
      .where(eq(financialOperations.id, op.insertId));
    return result;
  });
}
async function vertical(tx: Tx, value: string) {
  const [v] = await tx
    .select()
    .from(clinicalVerticals)
    .where(eq(clinicalVerticals.code, value));
  if (!v) return fail("BAD_REQUEST", "Vertical inválida");
}
async function charge(tx: Tx, a: FinancialActor, value: string) {
  const [r] = await tx
    .select()
    .from(transactions)
    .where(
      and(eq(transactions.tenantId, a.tenantId), eq(transactions.code, value))
    )
    .for("update");
  if (!r) return missing();
  return r;
}
async function payable(tx: Tx, a: FinancialActor, value: string) {
  const [r] = await tx
    .select()
    .from(accountsPayable)
    .where(
      and(
        eq(accountsPayable.tenantId, a.tenantId),
        eq(accountsPayable.code, value)
      )
    )
    .for("update");
  if (!r) return missing();
  return r;
}
async function cash(tx: Tx, a: FinancialActor, id: number) {
  const [r] = await tx
    .select()
    .from(cashSessions)
    .where(and(eq(cashSessions.tenantId, a.tenantId), eq(cashSessions.id, id)))
    .for("update");
  if (!r) return missing();
  managed(r);
  if (r.status !== "OPEN") return fail("CONFLICT", "Caixa já fechado");
  return r;
}
async function verifyCashBalance(
  tx: Tx,
  a: FinancialActor,
  s: typeof cashSessions.$inferSelect
) {
  const rows = await tx
    .select()
    .from(financialMovements)
    .where(
      and(
        eq(financialMovements.tenantId, a.tenantId),
        eq(financialMovements.cashSessionId, s.id)
      )
    );
  let inflow = 0,
    outflow = 0;
  for (const m of rows) {
    if (m.kind === "RECEIPT" || m.kind === "CASH_IN") inflow += m.amount;
    else outflow += m.amount;
  }
  const expected = checked(s.openingBalance + inflow - outflow);
  if (
    s.cashInflow !== inflow ||
    s.cashOutflow !== outflow ||
    s.expectedBalance !== expected
  )
    return fail(
      "PRECONDITION_FAILED",
      "Saldo do caixa diverge do livro de movimentos. Conferência necessária"
    );
  return { inflow, outflow, expected };
}
async function changeCash(
  tx: Tx,
  a: FinancialActor,
  verticalCode: string,
  amount: number,
  out: boolean
) {
  const rows = await tx
    .select()
    .from(cashSessions)
    .where(
      and(
        eq(cashSessions.tenantId, a.tenantId),
        eq(cashSessions.verticalCode, verticalCode),
        eq(cashSessions.status, "OPEN")
      )
    )
    .for("update");
  if (rows.length !== 1)
    return fail(
      "PRECONDITION_FAILED",
      "Abra um único caixa conferido nesta vertical antes de movimentar dinheiro"
    );
  const s = rows[0];
  managed(s);
  const b = await verifyCashBalance(tx, a, s);
  const expected = checked(b.expected + (out ? -amount : amount));
  const inflow = b.inflow + (out ? 0 : amount),
    outflow = b.outflow + (out ? amount : 0);
  checked(inflow);
  checked(outflow);
  await tx
    .update(cashSessions)
    .set({
      cashInflow: inflow,
      cashOutflow: outflow,
      expectedBalance: expected,
      revision: s.revision + 1,
    })
    .where(eq(cashSessions.id, s.id));
  return s.id;
}
export async function createCharge(
  actor: FinancialActor,
  raw: z.input<typeof chargeInput>
) {
  const input = chargeInput.parse(raw);
  let totals: ReturnType<typeof calculateCharge>;
  try {
    totals = calculateCharge(input);
  } catch (e) {
    return fail("BAD_REQUEST", (e as Error).message);
  }
  const result = await mutate(
    actor,
    input.requestId,
    "CREATE_CHARGE",
    input,
    async (tx, a) => {
      await vertical(tx, input.verticalCode);
      const [patient] = await tx
        .select()
        .from(mindosPatients)
        .where(
          and(
            eq(mindosPatients.id, input.patientId),
            eq(mindosPatients.tenantId, a.tenantId)
          )
        )
        .for("update");
      if (!patient) return missing();
      if (patient.administrativeStatus !== "ACTIVE")
        return fail("CONFLICT", "Paciente inativo");
      let professionalName = "Não vinculado",
        unitName = "Não vinculada";
      if (input.appointmentId) {
        const [session] = await tx
          .select()
          .from(mindosAppointments)
          .where(
            and(
              eq(mindosAppointments.id, input.appointmentId),
              eq(mindosAppointments.tenantId, a.tenantId),
              eq(mindosAppointments.patientId, patient.id)
            )
          )
          .for("update");
        if (!session) return missing();
        if (["CANCELLED", "RESCHEDULED"].includes(session.status))
          return fail("CONFLICT", "Sessão cancelada ou substituída");
        const existing = await tx
          .select({ id: transactions.id })
          .from(transactions)
          .where(
            and(
              eq(transactions.tenantId, a.tenantId),
              eq(transactions.appointmentId, session.id)
            )
          );
        if (existing.length)
          return fail(
            "CONFLICT",
            "Este atendimento já possui cobrança. Consulte a existente antes de criar outra"
          );
        professionalName = session.professionalName;
        unitName = session.unitName;
      }
      const value = code("COB");
      const [r] = await tx.insert(transactions).values({
        tenantId: a.tenantId,
        patientId: patient.id,
        appointmentId: input.appointmentId,
        ledgerVersion: 1,
        code: value,
        verticalCode: input.verticalCode,
        patientName: patient.fullName.slice(0, 128),
        patientDocument: "Não informado",
        patientEmail: patient.email?.slice(0, 128),
        patientPhone: patient.phone?.slice(0, 32),
        professionalName,
        unitName,
        title: input.title,
        category: input.category,
        paymentMethod: input.paymentMethod,
        status: "PENDING",
        subtotal: totals.subtotal,
        discount: input.discount,
        addition: input.addition,
        totalAmount: totals.total,
        installments: input.installments,
        installmentValue: totals.amounts[0],
        dueDate: installmentDate(input.dueDate, 0),
        notes: input.notes,
        operatorName: a.operatorName.slice(0, 64),
      });
      await tx.insert(transactionItems).values(
        input.items.map((i, n) => ({
          transactionId: r.insertId,
          name: i.name,
          type: i.type || "SERVICE",
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          subtotal: totals.subtotals[n],
        }))
      );
      await tx.insert(financialInstallments).values(
        totals.amounts.map((amount, n) => ({
          tenantId: a.tenantId,
          transactionId: r.insertId,
          number: n + 1,
          amount,
          dueDate: installmentDate(input.dueDate, n),
        }))
      );
      await audit(
        tx,
        a,
        input.verticalCode,
        "CREATE_CHARGE",
        value,
        `Cobrança interna criada: ${totals.total} centavos, ${input.installments} parcela(s). Sem emissão fiscal ou bancária.`
      );
      return { code: value, id: r.insertId };
    }
  );
  return getCharge(actor, result.code);
}
async function installments(
  tx: Tx,
  a: FinancialActor,
  r: typeof transactions.$inferSelect
) {
  const items = await tx
    .select()
    .from(transactionItems)
    .where(eq(transactionItems.transactionId, r.id));
  const principal = items.reduce((n, i) => n + i.quantity * i.unitPrice, 0);
  if (
    !items.length ||
    items.some(
      i =>
        !Number.isInteger(i.quantity) ||
        i.quantity < 1 ||
        i.unitPrice < 1 ||
        i.subtotal !== i.quantity * i.unitPrice
    ) ||
    principal !== r.subtotal ||
    r.discount < 0 ||
    r.discount > r.subtotal ||
    r.addition < 0 ||
    r.totalAmount !== r.subtotal - r.discount + r.addition ||
    r.totalAmount < 1 ||
    r.totalAmount > MAX_MONEY ||
    r.paidAmount < 0 ||
    r.paidAmount > r.totalAmount ||
    r.refundedAmount < 0 ||
    r.refundedAmount > r.paidAmount
  )
    return fail("PRECONDITION_FAILED", "Itens ou totais divergem da cobrança");
  const rows = await tx
    .select()
    .from(financialInstallments)
    .where(
      and(
        eq(financialInstallments.tenantId, a.tenantId),
        eq(financialInstallments.transactionId, r.id)
      )
    )
    .orderBy(asc(financialInstallments.number));
  if (
    rows.length !== r.installments ||
    rows.reduce((s, i) => s + i.amount, 0) !== r.totalAmount ||
    rows.reduce((s, i) => s + i.paidAmount, 0) !== r.paidAmount ||
    rows.reduce((s, i) => s + i.refundedAmount, 0) !== r.refundedAmount ||
    rows.some(
      i =>
        i.amount < 1 ||
        i.paidAmount < 0 ||
        i.paidAmount > i.amount ||
        i.refundedAmount < 0 ||
        i.refundedAmount > i.paidAmount
    )
  )
    return fail(
      "PRECONDITION_FAILED",
      "Parcelas divergem da cobrança. Conferência necessária"
    );
  const moves = await tx
    .select()
    .from(financialMovements)
    .where(
      and(
        eq(financialMovements.tenantId, a.tenantId),
        eq(financialMovements.transactionId, r.id)
      )
    );
  if (
    moves
      .filter(m => m.kind === "RECEIPT")
      .reduce((s, m) => s + m.amount, 0) !== r.paidAmount ||
    moves
      .filter(m => m.kind === "REVERSAL")
      .reduce((s, m) => s + m.amount, 0) !== r.refundedAmount
  )
    return fail("PRECONDITION_FAILED", "Cobrança diverge do livro financeiro");
  return rows;
}
export async function recordReceipt(
  actor: FinancialActor,
  raw: z.input<typeof receiptInput>
) {
  const input = receiptInput.parse(raw);
  const result = await mutate(
    actor,
    input.requestId,
    "MANUAL_RECEIPT",
    input,
    async (tx, a, operationId) => {
      const r = await charge(tx, a, input.code);
      managed(r);
      revision(r, input.revision);
      if (!["PENDING", "OVERDUE", "PARTIALLY_REFUNDED"].includes(r.status))
        return fail("CONFLICT", "Cobrança não aceita recebimento");
      if (input.amount > r.totalAmount - r.paidAmount)
        return fail("BAD_REQUEST", "Valor supera o saldo a receber");
      const rows = await installments(tx, a, r);
      let cashReceived: null | number = null,
        cashChange: null | number = null,
        cashSessionId: null | number = null;
      if (r.paymentMethod === "CASH") {
        if (
          input.cashReceived === undefined ||
          input.cashReceived < input.amount
        )
          return fail("BAD_REQUEST", "Dinheiro recebido insuficiente");
        cashReceived = input.cashReceived;
        cashChange = cashReceived - input.amount;
        cashSessionId = await changeCash(
          tx,
          a,
          r.verticalCode,
          input.amount,
          false
        );
      } else if (input.cashReceived !== undefined)
        return fail("BAD_REQUEST", "Troco é exclusivo de dinheiro");
      let remaining = input.amount;
      for (const i of rows) {
        const paid = Math.min(remaining, i.amount - i.paidAmount);
        if (paid) {
          await tx
            .update(financialInstallments)
            .set({ paidAmount: i.paidAmount + paid })
            .where(eq(financialInstallments.id, i.id));
          remaining -= paid;
        }
      }
      const paidAmount = r.paidAmount + input.amount;
      await tx
        .update(transactions)
        .set({
          paidAmount,
          status:
            r.refundedAmount > 0
              ? "PARTIALLY_REFUNDED"
              : paidAmount === r.totalAmount
                ? "PAID"
                : "PENDING",
          paidAt: paidAmount === r.totalAmount ? new Date() : null,
          cashReceived,
          cashChange,
          revision: r.revision + 1,
        })
        .where(eq(transactions.id, r.id));
      await tx.insert(financialMovements).values({
        tenantId: a.tenantId,
        operationId,
        transactionId: r.id,
        cashSessionId,
        kind: "RECEIPT",
        amount: input.amount,
        method: r.paymentMethod,
        reference: input.reference,
        actorUserId: a.userId,
      });
      await audit(
        tx,
        a,
        r.verticalCode,
        "MANUAL_RECEIPT",
        r.code,
        `Baixa manual de ${input.amount} centavos; referência: ${input.reference}. Sem confirmação automática de banco ou emissão fiscal.`
      );
      return { code: r.code };
    }
  );
  return getCharge(actor, result.code);
}
export async function reverseReceipt(
  actor: FinancialActor,
  raw: z.input<typeof reversalInput>
) {
  const input = reversalInput.parse(raw);
  const result = await mutate(
    actor,
    input.requestId,
    "MANUAL_REVERSAL",
    input,
    async (tx, a, operationId) => {
      const r = await charge(tx, a, input.code);
      managed(r);
      revision(r, input.revision);
      if (r.paidAmount - r.refundedAmount <= 0)
        return fail("CONFLICT", "Não há recebimento líquido para reverter");
      if (input.amount > r.paidAmount - r.refundedAmount)
        return fail("BAD_REQUEST", "Reversão supera o valor recebido líquido");
      const rows = await installments(tx, a, r);
      const cashSessionId =
        r.paymentMethod === "CASH"
          ? await changeCash(tx, a, r.verticalCode, input.amount, true)
          : null;
      let remaining = input.amount;
      for (const i of [...rows].reverse()) {
        const refunded = Math.min(remaining, i.paidAmount - i.refundedAmount);
        if (refunded) {
          await tx
            .update(financialInstallments)
            .set({ refundedAmount: i.refundedAmount + refunded })
            .where(eq(financialInstallments.id, i.id));
          remaining -= refunded;
        }
      }
      const refundedAmount = r.refundedAmount + input.amount;
      await tx
        .update(transactions)
        .set({
          refundedAmount,
          status:
            refundedAmount === r.totalAmount
              ? "REFUNDED"
              : "PARTIALLY_REFUNDED",
          revision: r.revision + 1,
        })
        .where(eq(transactions.id, r.id));
      await tx.insert(financialMovements).values({
        tenantId: a.tenantId,
        operationId,
        transactionId: r.id,
        cashSessionId,
        kind: "REVERSAL",
        amount: input.amount,
        method: r.paymentMethod,
        reference: input.reference,
        reason: input.reason,
        actorUserId: a.userId,
      });
      await audit(
        tx,
        a,
        r.verticalCode,
        "MANUAL_REVERSAL",
        r.code,
        `Reversão interna de ${input.amount} centavos; referência: ${input.reference}; motivo: ${input.reason}. Não executa devolução bancária nem cancelamento fiscal.`
      );
      return { code: r.code };
    }
  );
  return getCharge(actor, result.code);
}
export async function createPayable(
  actor: FinancialActor,
  raw: z.input<typeof payableInput>
) {
  const input = payableInput.parse(raw);
  return mutate(
    actor,
    input.requestId,
    "CREATE_PAYABLE",
    input,
    async (tx, a) => {
      await vertical(tx, input.verticalCode);
      const value = code("PAG");
      const [r] = await tx.insert(accountsPayable).values({
        ...input,
        code: value,
        tenantId: a.tenantId,
        ledgerVersion: 1,
        dueDate: installmentDate(input.dueDate, 0),
      });
      await audit(
        tx,
        a,
        input.verticalCode,
        "CREATE_PAYABLE",
        value,
        `Despesa interna cadastrada: ${input.amount} centavos.`
      );
      return { code: value, id: r.insertId };
    }
  );
}
export async function settlePayable(
  actor: FinancialActor,
  raw: z.input<typeof receiptInput>
) {
  const input = receiptInput.parse(raw);
  return mutate(
    actor,
    input.requestId,
    "MANUAL_PAYABLE_PAYMENT",
    input,
    async (tx, a, operationId) => {
      const r = await payable(tx, a, input.code);
      managed(r);
      revision(r, input.revision);
      if (
        !["PENDING", "OVERDUE", "PARTIALLY_REFUNDED"].includes(r.status) ||
        input.amount > r.amount - r.settledAmount
      )
        return fail("CONFLICT", "Despesa não aceita esse pagamento");
      const moves = await tx
        .select()
        .from(financialMovements)
        .where(
          and(
            eq(financialMovements.tenantId, a.tenantId),
            eq(financialMovements.payableId, r.id)
          )
        );
      if (moves.reduce((s, m) => s + m.amount, 0) !== r.settledAmount)
        return fail(
          "PRECONDITION_FAILED",
          "Despesa diverge do livro financeiro"
        );
      if (input.cashReceived !== undefined)
        return fail("BAD_REQUEST", "Pagamento de despesa não recebe troco");
      const cashSessionId =
        r.paymentMethod === "CASH"
          ? await changeCash(tx, a, r.verticalCode, input.amount, true)
          : null;
      const settledAmount = r.settledAmount + input.amount;
      await tx
        .update(accountsPayable)
        .set({
          settledAmount,
          status: settledAmount === r.amount ? "PAID" : "PENDING",
          paidAt: settledAmount === r.amount ? new Date() : null,
          revision: r.revision + 1,
        })
        .where(eq(accountsPayable.id, r.id));
      await tx.insert(financialMovements).values({
        tenantId: a.tenantId,
        operationId,
        payableId: r.id,
        cashSessionId,
        kind: "PAYABLE_PAYMENT",
        amount: input.amount,
        method: r.paymentMethod || "TRANSFER",
        reference: input.reference,
        actorUserId: a.userId,
      });
      await audit(
        tx,
        a,
        r.verticalCode,
        "MANUAL_PAYABLE_PAYMENT",
        r.code,
        `Pagamento manual de despesa: ${input.amount} centavos; referência: ${input.reference}. Não transfere dinheiro pelo banco.`
      );
      return { code: r.code };
    }
  );
}
export async function openCash(
  actor: FinancialActor,
  raw: z.input<typeof openCashInput>
) {
  const input = openCashInput.parse(raw);
  return mutate(actor, input.requestId, "CASH_OPEN", input, async (tx, a) => {
    await vertical(tx, input.verticalCode);
    const existing = await tx
      .select()
      .from(cashSessions)
      .where(
        and(
          eq(cashSessions.tenantId, a.tenantId),
          eq(cashSessions.verticalCode, input.verticalCode),
          eq(cashSessions.status, "OPEN")
        )
      )
      .for("update");
    if (existing.length)
      return fail(
        "CONFLICT",
        "Já existe caixa aberto nesta vertical; confira o atual"
      );
    const [r] = await tx.insert(cashSessions).values({
      tenantId: a.tenantId,
      verticalCode: input.verticalCode,
      sessionNumber: code("CX"),
      operatorName: a.operatorName.slice(0, 64),
      openingBalance: input.openingBalance,
      expectedBalance: input.openingBalance,
      ledgerVersion: 1,
      activeKey: `${a.tenantId}:${input.verticalCode}`,
    });
    await audit(
      tx,
      a,
      input.verticalCode,
      "CASH_OPEN",
      null,
      `Caixa ${r.insertId}: abertura com ${input.openingBalance} centavos.`
    );
    return { id: r.insertId };
  });
}
export async function moveCash(
  actor: FinancialActor,
  raw: z.input<typeof cashMoveInput>
) {
  const input = cashMoveInput.parse(raw);
  return mutate(
    actor,
    input.requestId,
    "CASH_MOVE",
    input,
    async (tx, a, operationId) => {
      const s = await cash(tx, a, input.sessionId);
      revision(s, input.revision);
      const id = await changeCash(
        tx,
        a,
        s.verticalCode,
        input.amount,
        input.direction === "OUT"
      );
      await tx.insert(financialMovements).values({
        tenantId: a.tenantId,
        operationId,
        cashSessionId: id,
        kind: input.direction === "IN" ? "CASH_IN" : "CASH_OUT",
        amount: input.amount,
        method: "CASH",
        reference: "Movimento de gaveta",
        reason: input.reason,
        actorUserId: a.userId,
      });
      await audit(
        tx,
        a,
        s.verticalCode,
        "CASH_MOVE",
        null,
        `Caixa ${id}: ${input.direction} de ${input.amount} centavos; ${input.reason}`
      );
      return { id };
    }
  );
}
export async function closeCash(
  actor: FinancialActor,
  raw: z.input<typeof closeCashInput>
) {
  const input = closeCashInput.parse(raw);
  return mutate(actor, input.requestId, "CASH_CLOSE", input, async (tx, a) => {
    const s = await cash(tx, a, input.sessionId);
    revision(s, input.revision);
    const b = await verifyCashBalance(tx, a, s);
    const difference = input.closingBalance - b.expected;
    if (difference !== 0 && (!input.notes || input.notes.length < 8))
      return fail(
        "BAD_REQUEST",
        "Explique a diferença de caixa (mínimo de 8 caracteres)"
      );
    await tx
      .update(cashSessions)
      .set({
        status: "CLOSED",
        activeKey: null,
        closingBalance: input.closingBalance,
        difference,
        closingNotes: input.notes,
        closedAt: new Date(),
        revision: s.revision + 1,
      })
      .where(eq(cashSessions.id, s.id));
    await audit(
      tx,
      a,
      s.verticalCode,
      "CASH_CLOSE",
      null,
      `Caixa ${s.id}: esperado ${b.expected}, contado ${input.closingBalance}, diferença ${difference} centavos. ${input.notes || ""}`
    );
    return { id: s.id };
  });
}
function safeCharge(r: typeof transactions.$inferSelect) {
  return {
    ...r,
    invoiceStatus: "NOT_ISSUED" as const,
    invoiceNumber: null,
    invoiceKey: null,
    invoiceIssuedAt: null,
    pixQrCode: null,
    pixCopiaECola: null,
    barcode: null,
    digitableLine: null,
    nsu: null,
    authorizationCode: null,
    legacyUnverified: r.ledgerVersion !== 1,
  };
}
export async function getCharge(actor: FinancialActor, value: string) {
  const db = await database();
  const [r] = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.tenantId, actor.tenantId),
        eq(transactions.code, value)
      )
    );
  if (!r) return undefined;
  const [items, parts, moves] = await Promise.all([
    db
      .select()
      .from(transactionItems)
      .where(eq(transactionItems.transactionId, r.id)),
    db
      .select()
      .from(financialInstallments)
      .where(
        and(
          eq(financialInstallments.tenantId, actor.tenantId),
          eq(financialInstallments.transactionId, r.id)
        )
      )
      .orderBy(asc(financialInstallments.number)),
    db
      .select()
      .from(financialMovements)
      .where(
        and(
          eq(financialMovements.tenantId, actor.tenantId),
          eq(financialMovements.transactionId, r.id)
        )
      )
      .orderBy(asc(financialMovements.id)),
  ]);
  return { ...safeCharge(r), items, parts, movements: moves };
}
export async function listCharges(
  actor: FinancialActor,
  filters: {
    verticalCode?: string;
    status?: string;
    paymentMethod?: string;
    search?: string;
    limit?: number;
    offset?: number;
    openOnly?: boolean;
  },
  connection?: Tx
) {
  const db = connection || (await database());
  const conditions = [eq(transactions.tenantId, actor.tenantId)];
  if (filters.verticalCode && filters.verticalCode !== "ALL")
    conditions.push(eq(transactions.verticalCode, filters.verticalCode));
  if (filters.paymentMethod && filters.paymentMethod !== "ALL")
    conditions.push(
      eq(transactions.paymentMethod, filters.paymentMethod as any)
    );
  // Busca literal: %, _ e barras não ampliam o conjunto pesquisado.
  let rows = await db
    .select()
    .from(transactions)
    .where(and(...conditions))
    .orderBy(desc(transactions.id));
  const [clinic] = await db
    .select()
    .from(mindosTenants)
    .where(eq(mindosTenants.id, actor.tenantId));
  const today = clinicParts(new Date(), clinic.timezone).date;
  const parts = rows.length
    ? await db
        .select()
        .from(financialInstallments)
        .where(
          and(
            eq(financialInstallments.tenantId, actor.tenantId),
            inArray(
              financialInstallments.transactionId,
              rows.map(r => r.id)
            )
          )
        )
    : [];
  const output = rows.map(r => {
    const installments = parts.filter(p => p.transactionId === r.id),
      unpaid = installments.filter(p => p.paidAmount < p.amount);
    const overdue =
      r.ledgerVersion === 1 &&
      unpaid.some(p => p.dueDate.toISOString().slice(0, 10) < today);
    return {
      ...safeCharge(r),
      status: overdue ? ("OVERDUE" as const) : r.status,
      remainingAmount: Math.max(0, r.totalAmount - r.paidAmount),
      netReceived: r.paidAmount - r.refundedAmount,
      overdueAmount: unpaid
        .filter(p => p.dueDate.toISOString().slice(0, 10) < today)
        .reduce((n, p) => n + p.amount - p.paidAmount, 0),
      parts: installments,
    };
  });
  const search = filters.search?.trim().toLocaleLowerCase();
  return output
    .filter(
      r =>
        !filters.openOnly ||
        (r.remainingAmount > 0 &&
          ["PENDING", "OVERDUE", "PARTIALLY_REFUNDED"].includes(r.status))
    )
    .filter(
      r =>
        (!search ||
          [r.code, r.title, r.patientName, r.patientDocument].some(v =>
            v.toLocaleLowerCase().includes(search)
          )) &&
        (!filters.status ||
          filters.status === "ALL" ||
          r.status === filters.status)
    )
    .slice(filters.offset || 0, (filters.offset || 0) + (filters.limit || 100));
}
export async function listPayables(
  actor: FinancialActor,
  verticalCode?: string,
  status?: string,
  connection?: Tx
) {
  const db = connection || (await database());
  const rows = await db
    .select()
    .from(accountsPayable)
    .where(
      and(
        eq(accountsPayable.tenantId, actor.tenantId),
        verticalCode && verticalCode !== "ALL"
          ? eq(accountsPayable.verticalCode, verticalCode)
          : undefined
      )
    )
    .orderBy(desc(accountsPayable.id));
  const [clinic] = await db
    .select()
    .from(mindosTenants)
    .where(eq(mindosTenants.id, actor.tenantId));
  const today = clinicParts(new Date(), clinic.timezone).date;
  return rows
    .map(r => ({
      ...r,
      status:
        r.status === "PENDING" && r.dueDate.toISOString().slice(0, 10) < today
          ? ("OVERDUE" as const)
          : r.status,
      remainingAmount:
        r.ledgerVersion === 1
          ? r.amount - r.settledAmount
          : r.status === "PAID"
            ? 0
            : r.amount,
      legacyUnverified: r.ledgerVersion !== 1,
    }))
    .filter(r => !status || status === "ALL" || r.status === status);
}
export async function financialContext(actor: FinancialActor) {
  const db = await database();
  const [clinic] = await db
    .select()
    .from(mindosTenants)
    .where(eq(mindosTenants.id, actor.tenantId));
  const [member] = await db
    .select()
    .from(mindosMemberships)
    .where(
      and(
        eq(mindosMemberships.tenantId, actor.tenantId),
        eq(mindosMemberships.userId, actor.userId)
      )
    );
  const patients = await db
    .select({
      id: mindosPatients.id,
      fullName: mindosPatients.fullName,
      status: mindosPatients.administrativeStatus,
    })
    .from(mindosPatients)
    .where(eq(mindosPatients.tenantId, actor.tenantId));
  const sessions = await db
    .select({
      id: mindosAppointments.id,
      patientId: mindosAppointments.patientId,
      startsAt: mindosAppointments.startsAt,
      status: mindosAppointments.status,
      professionalName: mindosAppointments.professionalName,
    })
    .from(mindosAppointments)
    .where(eq(mindosAppointments.tenantId, actor.tenantId))
    .orderBy(desc(mindosAppointments.startsAt));
  return {
    clinicName: clinic.name,
    timezone: clinic.timezone,
    canManage: hasMindosPermission(member, "MANAGE_FINANCIAL"),
    patients,
    sessions,
    paymentsConfigured: false,
    fiscalConfigured: false,
  };
}
export async function movements(actor: FinancialActor) {
  const db = await database();
  return db
    .select()
    .from(financialMovements)
    .where(eq(financialMovements.tenantId, actor.tenantId))
    .orderBy(desc(financialMovements.id));
}
export async function report(actor: FinancialActor, verticalCode?: string) {
  const db = await database();
  return db.transaction(async tx => {
    const [all, expenses, cashes] = await Promise.all([
      listCharges(actor, { verticalCode, limit: Number.MAX_SAFE_INTEGER }, tx),
      listPayables(actor, verticalCode, undefined, tx),
      tx
        .select()
        .from(cashSessions)
        .where(
          and(
            eq(cashSessions.tenantId, actor.tenantId),
            verticalCode && verticalCode !== "ALL"
              ? eq(cashSessions.verticalCode, verticalCode)
              : undefined
          )
        ),
    ]);
    const book = await tx
      .select()
      .from(financialMovements)
      .where(eq(financialMovements.tenantId, actor.tenantId));
    for (const r of all.filter(r => r.ledgerVersion === 1)) {
      await installments(tx, actor, r);
      const entries = book.filter(m => m.transactionId === r.id);
      if (
        entries
          .filter(m => m.kind === "RECEIPT")
          .reduce((s, m) => s + m.amount, 0) !== r.paidAmount ||
        entries
          .filter(m => m.kind === "REVERSAL")
          .reduce((s, m) => s + m.amount, 0) !== r.refundedAmount
      )
        return fail(
          "PRECONDITION_FAILED",
          "Relatório bloqueado: cobrança diverge do livro financeiro"
        );
    }
    for (const r of expenses.filter(r => r.ledgerVersion === 1)) {
      if (
        book
          .filter(m => m.payableId === r.id)
          .reduce((s, m) => s + m.amount, 0) !== r.settledAmount
      )
        return fail(
          "PRECONDITION_FAILED",
          "Relatório bloqueado: despesa diverge do livro financeiro"
        );
    }
    for (const s of cashes.filter(s => s.ledgerVersion === 1))
      await verifyCashBalance(tx, actor, s);
    const managedCharges = all.filter(r => r.ledgerVersion === 1),
      managedExpenses = expenses.filter(r => r.ledgerVersion === 1);
    const totalReceived = managedCharges.reduce((s, r) => s + r.netReceived, 0),
      totalRefunded = managedCharges.reduce((s, r) => s + r.refundedAmount, 0),
      totalReceivable = managedCharges
        .filter(r =>
          ["PENDING", "OVERDUE", "PARTIALLY_REFUNDED"].includes(r.status)
        )
        .reduce((s, r) => s + r.remainingAmount, 0),
      totalOverdue = managedCharges
        .filter(r => r.status === "OVERDUE")
        .reduce((s, r) => s + r.overdueAmount, 0),
      totalPayable = managedExpenses
        .filter(r =>
          ["PENDING", "OVERDUE", "PARTIALLY_REFUNDED"].includes(r.status)
        )
        .reduce((s, r) => s + r.remainingAmount, 0),
      paidPayable = managedExpenses.reduce((s, r) => s + r.settledAmount, 0),
      cashBalance = cashes
        .filter(s => s.ledgerVersion === 1 && s.status === "OPEN")
        .reduce((a, s) => a + s.expectedBalance, 0);
    return {
      totalReceived,
      totalReceivable,
      totalOverdue,
      totalPayable,
      paidPayable,
      totalRefunded,
      totalFailed: 0,
      cashBalance,
      netBalance: totalReceived - paidPayable,
      transactionCount: managedCharges.length,
      legacyCount:
        all.length -
        managedCharges.length +
        expenses.length -
        managedExpenses.length +
        cashes.filter(s => s.ledgerVersion !== 1).length,
      methodDistribution: [
        "PIX",
        "CREDIT_CARD",
        "DEBIT_CARD",
        "BOLETO",
        "CASH",
        "TRANSFER",
      ].map(method => ({
        method,
        count: managedCharges.filter(r => r.paymentMethod === method).length,
        total: managedCharges
          .filter(r => r.paymentMethod === method)
          .reduce((s, r) => s + r.netReceived, 0),
      })),
      statusDistribution: [
        "PAID",
        "PENDING",
        "OVERDUE",
        "REFUNDED",
        "PARTIALLY_REFUNDED",
      ].map(status => ({
        status,
        count: managedCharges.filter(r => r.status === status).length,
        total: managedCharges
          .filter(r => r.status === status)
          .reduce((s, r) => s + r.totalAmount, 0),
      })),
      recentTransactions: all.slice(0, 6),
    };
  });
}
