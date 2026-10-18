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
