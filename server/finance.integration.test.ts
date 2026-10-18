import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import mysql, {
  type Connection,
  type RowDataPacket,
  type ResultSetHeader,
} from "mysql2/promise";
import { appRouter } from "./routers";
import * as databaseModule from "./db";
import { financialAuditLogs } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
// @ts-expect-error Guard local compartilhado com o seed.
import { assertDemoSeedAllowed } from "./seed-safety.mjs";
const key = () => randomUUID();
describe("livro financeiro com MySQL real", () => {
  let db: Connection,
    tenant: number,
    otherTenant: number,
    patient: number,
    otherPatient: number,
    userId: number,
    readerId: number;
  let owner: ReturnType<typeof appRouter.createCaller>,
    other: typeof owner,
    reader: typeof owner;
  const tenants: number[] = [],
    users: number[] = [];
  async function insert(sql: string, args: unknown[]) {
    const [r] = await db.execute<ResultSetHeader>(sql, args);
    return r.insertId;
  }
  async function account(t: number, role: string, permissions: string[]) {
    const id = await insert("INSERT INTO users(openId,name) VALUES(?,?)", [
      `finance-test-${key()}`,
      "Autora financeira fictícia",
    ]);
    users.push(id);
    await insert(
      "INSERT INTO mindos_memberships(tenantId,userId,role,permissionsJson) VALUES(?,?,?,?)",
      [t, id, role, JSON.stringify(permissions)]
    );
    const now = new Date();
    return {
      id,
      caller: appRouter.createCaller({
        user: {
          id,
          openId: `fixture-${id}`,
          name: "Nome enviado pelo navegador",
          role: "user",
          email: null,
          loginMethod: "test",
          createdAt: now,
          updatedAt: now,
          lastSignedIn: now,
        },
        req: { headers: {} },
        res: {},
      } as TrpcContext),
    };
  }
  const charge = (overrides: Record<string, unknown> = {}) => ({
    requestId: key(),
    patientId: patient,
    verticalCode: "PSYCHOLOGY_CLINIC",
    title: "Cobrança fictícia",
    category: "TEST",
    paymentMethod: "TRANSFER" as const,
    discount: 0,
    addition: 0,
    installments: 3,
    dueDate: new Date("2026-01-31T12:00:00Z"),
    items: [{ name: "Sessão", quantity: 1, unitPrice: 10000 }],
    ...overrides,
  });
  const receipt = (r: { code: string; revision: number }, amount: number) => ({
    requestId: key(),
    code: r.code,
    revision: r.revision,
    amount,
    reference: "Comprovante fictício 123",
  });
  async function create(overrides: Record<string, unknown> = {}) {
    return (await owner.transactions.create(charge(overrides)))!;
  }
  async function counts() {
    const result: Record<string, number> = {};
    for (const t of [
      "transactions",
      "financial_operations",
      "financial_movements",
      "financial_installments",
      "financial_audit_logs",
    ]) {
      const [[r]] = await db.query<RowDataPacket[]>(
        `SELECT COUNT(*) n FROM ${t} WHERE tenantId=?`,
        [tenant]
      );
      result[t] = Number(r.n);
    }
    return result;
  }
  beforeAll(async () => {
    assertDemoSeedAllowed({ ...process.env, ALLOW_DEMO_SEED: "true" });
    db = await mysql.createConnection(process.env.DATABASE_URL!);
    for (const n of ["A", "B"])
      tenants.push(
        await insert(
          "INSERT INTO mindos_tenants(slug,name,siteConfigJson) VALUES(?,?,?)",
          [`finance-${n}-${key()}`, `Clínica financeira fictícia ${n}`, "{}"]
        )
      );
    [tenant, otherTenant] = tenants;
    patient = await insert(
      "INSERT INTO mindos_patients(tenantId,fullName,administrativeStatus) VALUES(?,?,'ACTIVE')",
      [tenant, "Paciente financeiro fictício"]
    );
    otherPatient = await insert(
      "INSERT INTO mindos_patients(tenantId,fullName,administrativeStatus) VALUES(?,?,'ACTIVE')",
      [otherTenant, "Outro paciente fictício"]
    );
    const a = await account(tenant, "OWNER", []);
    owner = a.caller;
    userId = a.id;
    other = (await account(otherTenant, "OWNER", [])).caller;
    const b = await account(tenant, "FINANCIAL", ["VIEW_FINANCIAL"]);
    reader = b.caller;
    readerId = b.id;
  });
  afterAll(async () => {
    if (!db) return;
    try {
      for (const id of tenants) {
        await db.execute(
          "DELETE FROM transaction_items WHERE transactionId IN (SELECT id FROM transactions WHERE tenantId=?)",
          [id]
        );
        for (const t of [
          "financial_movements",
          "financial_operations",
          "financial_installments",
          "financial_audit_logs",
          "transactions",
          "accounts_payable",
          "cash_sessions",
          "mindos_patients",
          "mindos_memberships",
        ])
          await db.execute(`DELETE FROM ${t} WHERE tenantId=?`, [id]);
        await db.execute("DELETE FROM mindos_tenants WHERE id=?", [id]);
      }
      for (const id of users)
        await db.execute("DELETE FROM users WHERE id=?", [id]);
    } finally {
      await db.end();
    }
  });
  it("cria pendente com parcelas exatas, autoria do banco e sem dados bancários ou fiscais inventados", async () => {
    const r = await create({ operatorName: "Falso", patientName: "Falso" });
    expect(r.parts.map(p => p.amount)).toEqual([3334, 3333, 3333]);
    expect(r.parts.map(p => p.dueDate.toISOString().slice(0, 10))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
    expect(r.patientName).toBe("Paciente financeiro fictício");
    expect(r.operatorName).toBe("Autora financeira fictícia");
    expect(r.status).toBe("PENDING");
    expect(r.paidAmount).toBe(0);
    expect([
      r.invoiceNumber,
      r.invoiceKey,
      r.pixQrCode,
      r.digitableLine,
      r.nsu,
      r.authorizationCode,
    ]).toEqual([null, null, null, null, null, null]);
    expect(r.invoiceStatus).toBe("NOT_ISSUED");
  });
  it("repete criação com a mesma chave inclusive em paralelo sem duplicar itens ou parcelas", async () => {
    const input = charge();
    const before = await counts();
    const [a, b] = await Promise.all([
      owner.transactions.create(input),
      owner.transactions.create(input),
    ]);
    expect(a?.code).toBe(b?.code);
    const after = await counts();
    expect(after.transactions - before.transactions).toBe(1);
    expect(after.financial_installments - before.financial_installments).toBe(
      3
    );
    expect(after.financial_operations - before.financial_operations).toBe(1);
  });
  it("recusa reutilização da chave com outro valor", async () => {
    const input = charge();
    await owner.transactions.create(input);
    await expect(
      owner.transactions.create({ ...input, title: "Outro conteúdo" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it.each([
    { totalAmount: 1 },
    { subtotal: 1 },
    { discount: 10001 },
    { items: [{ name: "Sessão", quantity: 1, unitPrice: 1.5 }] },
    { status: "PAID" },
    { tenantId: 1 },
    {
      installments: 24,
      items: [{ name: "Sessão", quantity: 1, unitPrice: 1 }],
    },
  ])(
    "rejeita valores ou campos indevidos sem persistência %j",
    async change => {
      const before = await counts();
      await expect(owner.transactions.create(charge(change))).rejects.toThrow();
      expect(await counts()).toEqual(before);
    }
  );
  it("nega paciente de outra clínica e paciente inativo", async () => {
    await expect(
      owner.transactions.create(charge({ patientId: otherPatient }))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db.execute(
      "UPDATE mindos_patients SET administrativeStatus='INACTIVE' WHERE id=?",
      [patient]
    );
    try {
      await expect(owner.transactions.create(charge())).rejects.toMatchObject({
        code: "CONFLICT",
      });
    } finally {
      await db.execute(
        "UPDATE mindos_patients SET administrativeStatus='ACTIVE' WHERE id=?",
        [patient]
      );
    }
  });
  it("mantém uma única baixa e auditoria sob reenvio simultâneo", async () => {
    const r = await create();
    const input = receipt(r, 10000),
      before = await counts();
    await Promise.all([
      owner.transactions.confirm(input),
      owner.transactions.confirm(input),
    ]);
    const after = await counts();
    expect(after.financial_movements - before.financial_movements).toBe(1);
    expect(after.financial_audit_logs - before.financial_audit_logs).toBe(1);
    const saved = (await owner.transactions.getByCode({ code: r.code }))!;
    expect(saved.paidAmount).toBe(10000);
    expect(saved.parts.every(p => p.paidAmount === p.amount)).toBe(true);
    expect(saved.invoiceStatus).toBe("NOT_ISSUED");
  });
  it("duas baixas concorrentes com chaves diferentes não ultrapassam o saldo", async () => {
    const r = await create();
    const results = await Promise.allSettled([
      owner.transactions.confirm(receipt(r, 10000)),
      owner.transactions.confirm(receipt(r, 10000)),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await owner.transactions.getByCode({ code: r.code }))?.paidAmount
    ).toBe(10000);
  });
  it("aceita baixas parciais distribuídas nas parcelas e recusa valores além do saldo", async () => {
    const r = await create();
    const first = (await owner.transactions.confirm(receipt(r, 4000)))!;
    expect(first.parts.map(p => p.paidAmount)).toEqual([3334, 666, 0]);
    await expect(
      owner.transactions.confirm(receipt(first, 6001))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const second = (await owner.transactions.confirm(receipt(first, 6000)))!;
    expect(second.status).toBe("PAID");
  });
  it("reverte recebimento parcial sem exigir baixa fictícia do saldo restante", async () => {
    const r = await create();
    const paid = (await owner.transactions.confirm(receipt(r, 1000)))!;
    await expect(
      owner.transactions.refund({
        ...receipt(paid, 1001),
        reason: "Motivo fictício",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const reversed = (await owner.transactions.refund({
      ...receipt(paid, 1000),
      reason: "Devolução parcial conferida",
    }))!;
    expect(reversed.paidAmount).toBe(1000);
    expect(reversed.refundedAmount).toBe(1000);
    const final = (await owner.transactions.confirm(receipt(reversed, 9000)))!;
    expect(final.paidAmount).toBe(10000);
    expect(final.refundedAmount).toBe(1000);
    expect(final.status).toBe("PARTIALLY_REFUNDED");
  });

  it("reversão parcial e total preserva recebimentos, parcelas, referência e não cancela nota fiscal", async () => {
    const r = await create();
    const paid = (await owner.transactions.confirm(receipt(r, 10000)))!;
    const input = {
      ...receipt(paid, 2500),
      reason: "Devolução externa já conferida",
    };
    await Promise.all([
      owner.transactions.refund(input),
      owner.transactions.refund(input),
    ]);
    const partial = (await owner.transactions.getByCode({ code: r.code }))!;
    expect(partial.status).toBe("PARTIALLY_REFUNDED");
    expect(partial.paidAmount).toBe(10000);
    expect(partial.refundedAmount).toBe(2500);
    expect(partial.parts.reduce((s, p) => s + p.refundedAmount, 0)).toBe(2500);
    const full = (await owner.transactions.refund({
      ...receipt(partial, 7500),
      reason: "Devolução do saldo conferida",
    }))!;
    expect(full.status).toBe("REFUNDED");
    expect(full.invoiceStatus).toBe("NOT_ISSUED");
    await expect(
      owner.transactions.confirm(receipt(full, 1))
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("obriga caixa aberto para dinheiro e calcula troco sem confiar no navegador", async () => {
    const r = await create({ paymentMethod: "CASH" });
    const before = await counts();
    await expect(
      owner.transactions.confirm({ ...receipt(r, 10000), cashReceived: 12000 })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(await counts()).toEqual(before);
    await owner.cash.open({
      requestId: key(),
      verticalCode: "PSYCHOLOGY_CLINIC",
      openingBalance: 2000,
    });
    await expect(
      owner.transactions.confirm({ ...receipt(r, 10000), cashReceived: 9000 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const paid = (await owner.transactions.confirm({
      ...receipt(r, 10000),
      cashReceived: 12000,
    }))!;
    expect(paid.cashChange).toBe(2000);
    expect(
      (await owner.cash.current({ verticalCode: "PSYCHOLOGY_CLINIC" }))
        ?.expectedBalance
    ).toBe(12000);
  });
  it("reversão de dinheiro reduz o caixa uma única vez", async () => {
    const rows = await owner.transactions.list({});
    const r = rows.find(
      r => r.paymentMethod === "CASH" && r.paidAmount === 10000
    )!;
    const before = (await owner.cash.current({
      verticalCode: "PSYCHOLOGY_CLINIC",
    }))!;
    const input = {
      ...receipt(r, 500),
      reason: "Devolução em espécie conferida",
    };
    await Promise.all([
      owner.transactions.refund(input),
      owner.transactions.refund(input),
    ]);
    expect(
      (await owner.cash.current({ verticalCode: "PSYCHOLOGY_CLINIC" }))
        ?.expectedBalance
    ).toBe(before.expectedBalance - 500);
  });
  it("protege abertura simultânea e não permite saldo físico negativo", async () => {
    await expect(
      owner.cash.open({
        requestId: key(),
        verticalCode: "PSYCHOLOGY_CLINIC",
        openingBalance: 0,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const current = (await owner.cash.current({
      verticalCode: "PSYCHOLOGY_CLINIC",
    }))!;
    await expect(
      owner.cash.move({
        requestId: key(),
        sessionId: current.id,
        revision: current.revision,
        amount: 12001,
        direction: "OUT",
        reason: "Sangria fictícia de teste",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("registra suprimento e sangria uma vez sem criar receita/despesa", async () => {
    const current = (await owner.cash.current({
      verticalCode: "PSYCHOLOGY_CLINIC",
    }))!;
    const before = await owner.dashboard.metrics({});
    const input = {
      requestId: key(),
      sessionId: current.id,
      revision: current.revision,
      amount: 1000,
      direction: "IN" as const,
      reason: "Suprimento fictício conferido",
    };
    await Promise.all([owner.cash.move(input), owner.cash.move(input)]);
    const after = await owner.dashboard.metrics({});
    expect(after.totalReceived).toBe(before.totalReceived);
    expect(after.totalPayable).toBe(before.totalPayable);
    expect(after.cashBalance - before.cashBalance).toBe(1000);
  });
  it("paga despesas parcialmente com idempotência e saída real do caixa", async () => {
    const bill = await owner.accountsPayable.create({
      requestId: key(),
      verticalCode: "PSYCHOLOGY_CLINIC",
      supplierName: "Fornecedor fictício",
      description: "Despesa de teste",
      category: "TEST",
      amount: 3000,
      dueDate: new Date(),
      paymentMethod: "CASH",
    });
    const before = (await owner.cash.current({
      verticalCode: "PSYCHOLOGY_CLINIC",
    }))!;
    const input = {
      requestId: key(),
      code: bill.code,
      revision: 1,
      amount: 1000,
      reference: "Recibo fornecedor fictício",
    };
    await Promise.all([
      owner.accountsPayable.pay(input),
      owner.accountsPayable.pay(input),
    ]);
    const r = (await owner.accountsPayable.list({})).find(
      p => p.code === bill.code
    )!;
    expect(r.settledAmount).toBe(1000);
    expect(r.remainingAmount).toBe(2000);
    expect(
      (await owner.cash.current({ verticalCode: "PSYCHOLOGY_CLINIC" }))
        ?.expectedBalance
    ).toBe(before.expectedBalance - 1000);
    await owner.accountsPayable.pay({
      ...input,
      requestId: key(),
      revision: r.revision,
      amount: 2000,
    });
  });
  it("nega alterações a leitor, outra clínica, associação revogada e replay após revogação", async () => {
    const r = await create();
    await expect(
      reader.transactions.confirm(receipt(r, 10000))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      other.transactions.confirm(receipt(r, 10000))
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      other.cash.close({
        requestId: key(),
        sessionId: (await owner.cash.current({
          verticalCode: "PSYCHOLOGY_CLINIC",
        }))!.id,
        revision: 1,
        closingBalance: 0,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const input = receipt(r, 10000);
    await owner.transactions.confirm(input);
    await db.execute(
      "UPDATE mindos_memberships SET active=false WHERE userId=?",
      [userId]
    );
    try {
      await expect(owner.transactions.confirm(input)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    } finally {
      await db.execute(
        "UPDATE mindos_memberships SET active=true WHERE userId=?",
        [userId]
      );
    }
    expect(await other.transactions.list({})).toHaveLength(0);
  });
  it("bloqueia simulação em qualquer ambiente e mutações de legado", async () => {
    await expect(
      owner.transactions.simulateWebhook({ code: "teste" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const value = `LEG-${key().slice(0, 8)}`;
    await insert(
      "INSERT INTO transactions(tenantId,code,verticalCode,patientName,patientDocument,professionalName,title,category,subtotal,totalAmount,dueDate) VALUES(?,?,'PSYCHOLOGY_CLINIC','Fictício','demo','Fictício','Legado','TEST',100,100,NOW())",
      [tenant, value]
    );
    await expect(
      owner.transactions.confirm({
        requestId: key(),
        code: value,
        revision: 1,
        amount: 100,
        reference: "Confirmação fictícia",
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect((await owner.dashboard.metrics({})).legacyCount).toBe(1);
  });
  it("detecta adulteração de saldo/parcelas em vez de continuar movimentando", async () => {
    const r = await create();
    await db.execute(
      "UPDATE financial_installments SET amount=amount+1 WHERE transactionId=? AND number=1",
      [r.id]
    );
    try {
      await expect(
        owner.transactions.confirm(receipt(r, 100))
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    } finally {
      await db.execute(
        "UPDATE financial_installments SET amount=amount-1 WHERE transactionId=? AND number=1",
        [r.id]
      );
    }
    const current = (await owner.cash.current({
      verticalCode: "PSYCHOLOGY_CLINIC",
    }))!;
    await db.execute(
      "UPDATE cash_sessions SET expectedBalance=expectedBalance+1 WHERE id=?",
      [current.id]
    );
    try {
      await expect(
        owner.cash.close({
          requestId: key(),
          sessionId: current.id,
          revision: current.revision,
          closingBalance: current.expectedBalance,
        })
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      await expect(owner.dashboard.metrics({})).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
      });
    } finally {
      await db.execute(
        "UPDATE cash_sessions SET expectedBalance=expectedBalance-1 WHERE id=?",
        [current.id]
      );
    }
  });
  it("fecha caixa com revisão e justificativa para diferença, preservando o histórico", async () => {
    const current = (await owner.cash.current({
      verticalCode: "PSYCHOLOGY_CLINIC",
    }))!;
    const input = {
      requestId: key(),
      sessionId: current.id,
      revision: current.revision,
      closingBalance: current.expectedBalance - 100,
    };
    await expect(owner.cash.close(input)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await owner.cash.close({
      ...input,
      notes: "Diferença fictícia identificada",
    });
    const closed = (await owner.cash.list({})).find(s => s.id === current.id)!;
    expect(closed.status).toBe("CLOSED");
    expect(closed.difference).toBe(-100);
    expect(closed.activeKey).toBeNull();
    await expect(
      owner.cash.move({
        requestId: key(),
        sessionId: closed.id,
        revision: closed.revision,
        amount: 1,
        direction: "IN",
        reason: "Movimento após fechamento",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const results = await Promise.allSettled([
      owner.cash.open({
        requestId: key(),
        verticalCode: "PSYCHOLOGY_CLINIC",
        openingBalance: 0,
      }),
      owner.cash.open({
        requestId: key(),
        verticalCode: "PSYCHOLOGY_CLINIC",
        openingBalance: 0,
      }),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  });
  it("relatórios conferem com o livro, sem misturar gaveta, receita, despesa e reversão", async () => {
    const report = await owner.dashboard.metrics({});
    const book = await owner.transactions.movements();
    expect(report.totalReceived).toBe(
      book.filter(m => m.kind === "RECEIPT").reduce((s, m) => s + m.amount, 0) -
        book
          .filter(m => m.kind === "REVERSAL")
          .reduce((s, m) => s + m.amount, 0)
    );
    expect(report.paidPayable).toBe(
      book
        .filter(m => m.kind === "PAYABLE_PAYMENT")
        .reduce((s, m) => s + m.amount, 0)
    );
    expect(report.netBalance).toBe(report.totalReceived - report.paidPayable);
    expect((await reader.dashboard.metrics({})).totalReceived).toBe(
      report.totalReceived
    );
  });
  it("reverte toda a transação se falhar a auditoria, sem cobrança ou parcelas órfãs", async () => {
    const real = (await databaseModule.getDb())!;
    const before = await counts();
    const proxy = new Proxy(real, {
      get(target, prop) {
        if (prop === "transaction")
          return async (work: any) =>
            target.transaction(async tx =>
              work(
                new Proxy(tx, {
                  get(t, k) {
                    if (k === "insert")
                      return (table: unknown) => {
                        if (table === financialAuditLogs)
                          throw new Error("Falha fictícia de auditoria");
                        return t.insert(table as any);
                      };
                    const value = Reflect.get(t, k);
                    return typeof value === "function" ? value.bind(t) : value;
                  },
                })
              )
            );
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const spy = vi.spyOn(databaseModule, "getDb").mockResolvedValue(proxy);
    try {
      await expect(owner.transactions.create(charge())).rejects.toThrow(
        "Não foi possível concluir o registro financeiro"
      );
      expect(await counts()).toEqual(before);
    } finally {
      spy.mockRestore();
    }
  });
  it("pagina, busca literalmente e separa saldo a receber de cobranças liquidadas", async () => {
    const title = `Literal %_ ${key().slice(0, 8)}`;
    const unpaid = await create({ title });
    const paid = await create();
    await owner.transactions.confirm(receipt(paid, 10000));
    const open = await owner.transactions.list({ openOnly: true });
    expect(open.some(r => r.code === unpaid.code)).toBe(true);
    expect(open.some(r => r.code === paid.code)).toBe(false);
    expect(
      (await owner.transactions.list({ search: title })).map(r => r.code)
    ).toEqual([unpaid.code]);
    const rows = await owner.transactions.list({ limit: 2 });
    expect(rows).toHaveLength(2);
    expect(
      (await owner.transactions.list({ limit: 1, offset: 1 }))[0].code
    ).toBe(rows[1].code);
  });
});
