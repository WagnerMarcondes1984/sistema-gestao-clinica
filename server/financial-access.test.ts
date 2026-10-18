import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const caller = appRouter.createCaller({
  user: null,
  req: { headers: {} },
  res: {},
} as TrpcContext);
describe("financeiro exige sessão em todas as operações", () => {
  const operations = [
    () => caller.transactions.context(),
    () => caller.transactions.movements(),
    () =>
      caller.cash.open({
        requestId: "123e4567-e89b-42d3-a456-426614174000",
        verticalCode: "PSYCHOLOGY_CLINIC",
        openingBalance: 0,
      }),
    () =>
      caller.cash.move({
        requestId: "123e4567-e89b-42d3-a456-426614174000",
        sessionId: 1,
        revision: 1,
        amount: 1,
        direction: "OUT",
        reason: "Tentativa sem sessão",
      }),
    () =>
      caller.accountsPayable.create({
        requestId: "123e4567-e89b-42d3-a456-426614174000",
        verticalCode: "PSYCHOLOGY_CLINIC",
        supplierName: "Teste",
        description: "Teste sem sessão",
        category: "TEST",
        amount: 100,
        dueDate: new Date(),
        paymentMethod: "TRANSFER",
      }),
    () => caller.dashboard.metrics({}),
    () => caller.transactions.list({}),
    () => caller.transactions.getByCode({ code: "other-clinic" }),
    () =>
      caller.transactions.create({
        verticalCode: "PSYCHOLOGY_CLINIC",
        patientName: "Demo",
        patientDocument: "demo",
        professionalName: "Demo",
        title: "Demo",
        category: "Demo",
        paymentMethod: "PIX",
        subtotal: 100,
        totalAmount: 100,
        discount: 0,
        addition: 0,
        installments: 1,
        dueDate: new Date(),
        items: [],
      }),
    () => caller.transactions.confirm({ code: "other-clinic" }),
    () => caller.transactions.refund({ code: "other-clinic", reason: "demo" }),
    () =>
      caller.transactions.simulateWebhook({
        code: "other-clinic",
        event: "PIX_RECEIVED",
      }),
    () => caller.accountsPayable.list({}),
    () => caller.accountsPayable.pay({ code: "other-clinic" }),
    () => caller.cash.current({ verticalCode: "PSYCHOLOGY_CLINIC" }),
    () => caller.cash.list({}),
    () => caller.cash.close({ sessionId: 1, closingBalance: 0 }),
    () => caller.audit.list({}),
  ];
  it.each(operations.map((call, index) => ({ call, index })))(
    "bloqueia operação $index sem autenticação",
    async ({ call }) => {
      await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
  );
});
