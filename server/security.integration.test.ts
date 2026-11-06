import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import mysql, {
  type Connection,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as databaseModule from "./db";
import { mindosAccessAudits } from "../drizzle/schema";
// @ts-expect-error Guard compartilhado com o seed JavaScript.
import { assertDemoSeedAllowed } from "./seed-safety.mjs";

describe("isolamento real entre clínicas, papéis e pacientes", () => {
  let db: Connection;
  const tenants: number[] = [];
  const users: number[] = [];
  const patients: number[] = [];
  const records: number[] = [];
  const cashIds: number[] = [];
  const suffix = randomUUID().slice(0, 8);
  const codeA = `SEC-A-${suffix}`;
  const codeB = `SEC-B-${suffix}`;
  let ownerA: ReturnType<typeof appRouter.createCaller>;
  let ownerB: ReturnType<typeof appRouter.createCaller>;
  let readOnly: ReturnType<typeof appRouter.createCaller>;
  let clinician: ReturnType<typeof appRouter.createCaller>;
  let patient: ReturnType<typeof appRouter.createCaller>;
  let revoked: ReturnType<typeof appRouter.createCaller>;
  let administrativeReader: typeof ownerA, reception: typeof ownerA;
  const sessions: number[] = [];
  const memberIds: number[] = [];

  async function insert(sql: string, params: unknown[]) {
    const [result] = await db.execute<ResultSetHeader>(sql, params);
    return result.insertId;
  }
  async function user(
    tenantId: number,
    role: string,
    permissions: string[],
    active = true
  ) {
    const id = await insert(
      "INSERT INTO users (openId, name, role) VALUES (?, ?, ?)",
      [`security-${randomUUID()}`, "Autor autenticado", "user"]
    );
    users.push(id);
    memberIds.push(
      await insert(
        "INSERT INTO mindos_memberships (tenantId, userId, role, permissionsJson, active) VALUES (?, ?, ?, ?, ?)",
        [tenantId, id, role, JSON.stringify(permissions), active]
      )
    );
    const now = new Date();
    const ctx: TrpcContext = {
      user: {
        id,
        openId: `fixture-${id}`,
        name: "Autor autenticado",
        email: null,
        loginMethod: "test",
        role: "user",
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now,
      },
      req: { headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    return appRouter.createCaller(ctx);
  }

  beforeAll(async () => {
    assertDemoSeedAllowed({ ...process.env, ALLOW_DEMO_SEED: "true" });
    db = await mysql.createConnection(process.env.DATABASE_URL!);
    for (const name of ["A", "B"]) {
      const tenant = await insert(
        "INSERT INTO mindos_tenants (slug, name, siteConfigJson) VALUES (?, ?, ?)",
        [`security-${name}-${suffix}`, `Clínica de teste ${name}`, "{}"]
      );
      tenants.push(tenant);
      patients.push(
        await insert(
          "INSERT INTO mindos_patients (tenantId, fullName) VALUES (?, ?)",
          [tenant, `Paciente fictício ${name}`]
        )
      );
    }
    ownerA = await user(tenants[0], "OWNER", []);
    ownerB = await user(tenants[1], "OWNER", []);
    readOnly = await user(tenants[0], "FINANCIAL", ["VIEW_FINANCIAL"]);
    clinician = await user(tenants[0], "PSYCHOLOGIST", [
      "VIEW_CLINICAL_RECORD",
      "EDIT_CLINICAL_RECORD",
    ]);
    await insert(
      "INSERT INTO mindos_patient_clinicians(tenantId,patientId,userId,assignedByUserId) VALUES(?,?,?,?)",
      [tenants[0], patients[0], users[3], users[0]]
    );
    patient = await user(tenants[0], "PATIENT", []);
    await db.execute(
      "UPDATE mindos_patients SET portalUserId = ? WHERE id = ?",
      [users[4], patients[0]]
    );
    revoked = await user(tenants[0], "OWNER", [], false);
    administrativeReader = await user(tenants[0], "SALES", [
      "VIEW_ADMINISTRATIVE",
    ]);
    reception = await user(tenants[0], "RECEPTIONIST", [
      "VIEW_ADMINISTRATIVE",
      "MANAGE_APPOINTMENTS",
    ]);
    patients.push(
      await insert(
        "INSERT INTO mindos_patients(tenantId,fullName) VALUES(?,?)",
        [tenants[0], "Segundo paciente fictício A"]
      )
    );
    for (const [tenantId, patientId] of [
      [tenants[0], patients[0]],
      [tenants[1], patients[1]],
      [tenants[0], patients[2]],
    ])
      sessions.push(
        await insert(
          "INSERT INTO mindos_appointments(tenantId,patientId,professionalName,unitName,serviceType,startsAt,endsAt) VALUES(?,?, 'Profissional fictício','Unidade fictícia','Sessão fictícia',?,?)",
          [tenantId, patientId, new Date(), new Date(Date.now() + 3600000)]
        )
      );
    for (const [i, code] of [codeA, codeB].entries()) {
      await insert(
        "INSERT INTO transactions (tenantId, code, verticalCode, patientName, patientDocument, professionalName, title, category, subtotal, totalAmount, status, paidAmount, dueDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          tenants[i],
          code,
          "PSYCHOLOGY_CLINIC",
          "Paciente fictício",
          "demo",
          "Profissional fictício",
          "Sessão fictícia",
          "TEST",
          10000 + i,
          10000 + i,
          "PAID",
          10000 + i,
          new Date(),
        ]
      );
      cashIds.push(
        await insert(
          "INSERT INTO cash_sessions (tenantId, verticalCode, sessionNumber, operatorName) VALUES (?, ?, ?, ?)",
          [tenants[i], "PSYCHOLOGY_CLINIC", `SEC-${i}-${suffix}`, "Fixture"]
        )
      );
      await insert(
        "INSERT INTO accounts_payable (tenantId, code, verticalCode, supplierName, description, category, amount, dueDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          tenants[i],
          code,
          "PSYCHOLOGY_CLINIC",
          "Fornecedor fictício",
          "Teste",
          "TEST",
          100,
          new Date(),
        ]
      );
    }
    for (const type of ["EVOLUTION", "RESTRICTED_NOTE"]) {
      records.push(
        await insert(
          "INSERT INTO mindos_clinical_records (tenantId, patientId, authorUserId, recordType, content) VALUES (?, ?, ?, ?, ?)",
          [
            tenants[0],
            patients[0],
            users[3],
            type,
            "Conteúdo fictício para teste de autorização.",
          ]
        )
      );
    }
  });

  afterAll(async () => {
    if (!db) return;
    try {
      for (const tenantId of tenants) {
        for (const t of [
          "financial_movements",
          "financial_operations",
          "financial_installments",
        ])
          await db.execute(`DELETE FROM ${t} WHERE tenantId=?`, [tenantId]);
        await db.execute(
          "DELETE FROM transaction_items WHERE transactionId IN (SELECT id FROM transactions WHERE tenantId = ?)",
          [tenantId]
        );
        for (const table of [
          "financial_audit_logs",
          "transactions",
          "accounts_payable",
          "cash_sessions",
          "mindos_access_audits",
          "mindos_clinical_versions",
          "mindos_patient_clinicians",
          "mindos_clinical_records",
          "mindos_reception_events",
          "mindos_portal_documents",
          "mindos_appointments",
          "mindos_memberships",
          "mindos_patients",
        ]) {
          await db.execute("DELETE FROM `" + table + "` WHERE tenantId = ?", [
            tenantId,
          ]);
        }
        await db.execute("DELETE FROM mindos_tenants WHERE id = ?", [tenantId]);
      }
      for (const id of users)
        await db.execute("DELETE FROM users WHERE id = ?", [id]);
    } finally {
      await db.end();
    }
  });

  it("filtra listas, detalhes, métricas, despesas e caixas pela clínica autenticada", async () => {
    expect((await ownerA.transactions.list({})).map(tx => tx.code)).toEqual([
      codeA,
    ]);
    expect((await ownerB.transactions.list({})).map(tx => tx.code)).toEqual([
      codeB,
    ]);
    expect(
      await ownerA.transactions.getByCode({ code: codeB })
    ).toBeUndefined();
    expect((await ownerA.dashboard.metrics({})).totalReceived).toBe(0);
    expect((await ownerA.dashboard.metrics({})).legacyCount).toBe(3);
    expect(
      (await ownerA.accountsPayable.list({})).map(row => row.code)
    ).toEqual([codeA]);
    expect((await ownerA.cash.list({})).map(row => row.id)).toEqual([
      cashIds[0],
    ]);
    expect(
      (await ownerA.cash.current({ verticalCode: "PSYCHOLOGY_CLINIC" }))?.id
    ).toBe(cashIds[0]);
  });

  it("não altera transação nem caixa de outra clínica, inclusive por código ou ID conhecido", async () => {
    await expect(
      ownerA.transactions.refund({
        code: codeB,
        requestId: randomUUID(),
        revision: 1,
        amount: 100,
        reference: "teste entre clínicas",
        reason: "tentativa entre clínicas",
      })
    ).rejects.toThrow();
    await expect(
      ownerA.cash.close({
        sessionId: cashIds[1],
        closingBalance: 0,
        revision: 1,
        requestId: randomUUID(),
      })
    ).rejects.toThrow();
    await expect(
      ownerA.accountsPayable.pay({
        code: codeB,
        revision: 1,
        amount: 100,
        reference: "teste entre clínicas",
        requestId: randomUUID(),
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const [[row]] = await db.query<RowDataPacket[]>(
      "SELECT status FROM accounts_payable WHERE tenantId = ?",
      [tenants[1]]
    );
    expect(row.status).toBe("PENDING");
  });

  it("separa leitura de alteração financeira e recusa associação desativada", async () => {
    expect(await readOnly.transactions.list({})).toHaveLength(1);
    await expect(
      readOnly.transactions.confirm({ code: codeA })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(revoked.transactions.list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(clinician.transactions.list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("não retorna nem finaliza nota restrita com permissão clínica comum", async () => {
    expect(
      (await clinician.mindos.clinicalRecords({ patientId: patients[0] })).map(
        row => row.recordType
      )
    ).toEqual(["EVOLUTION"]);
    await expect(
      clinician.mindos.finalizeClinicalRecord({
        recordId: records[1],
        revision: 1,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      await ownerA.mindos.clinicalRecords({ patientId: patients[0] })
    ).toHaveLength(2);
    const [audits] = await db.query<RowDataPacket[]>(
      "SELECT * FROM mindos_access_audits WHERE tenantId = ? AND dataLayer = 'HIGHLY_RESTRICTED_CLINICAL'",
      [tenants[0]]
    );
    expect(audits.some(row => row.action === "VIEW_RESTRICTED_NOTE")).toBe(
      true
    );
  });

  it("deriva o paciente do usuário e minimiza os dados retornados pelo portal", async () => {
    const data = await patient.mindos.portalData();
    expect(data.patient.id).toBe(patients[0]);
    expect(data.patient).not.toHaveProperty("portalUserId");
    await expect(ownerA.mindos.portalData()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const [[other]] = await db.query<RowDataPacket[]>(
      "SELECT fullName FROM mindos_patients WHERE id = ?",
      [patients[1]]
    );
    expect(data.patient.fullName).not.toBe(other.fullName);
  });

  it("recusa evento administrativo para paciente de outra clínica", async () => {
    await expect(
      ownerA.mindos.receptionEvent({
        patientId: patients[1],
        eventType: "CHECK_IN",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("salva autoria autenticada e ignora o nome de operador enviado no payload", async () => {
    await db.execute(
      "UPDATE mindos_patients SET administrativeStatus='ACTIVE' WHERE id=?",
      [patients[0]]
    );
    const tx = await ownerA.transactions.create({
      requestId: randomUUID(),
      patientId: patients[0],
      verticalCode: "PSYCHOLOGY_CLINIC",
      patientName: "Fictício",
      patientDocument: "demo",
      professionalName: "Fictício",
      title: "Teste",
      category: "TEST",
      paymentMethod: "PIX",
      subtotal: 100,
      totalAmount: 100,
      discount: 0,
      addition: 0,
      installments: 1,
      dueDate: new Date(),
      operatorName: "Identidade falsa",
      items: [{ name: "Teste", quantity: 1, unitPrice: 100, subtotal: 100 }],
    });
    expect(tx?.operatorName).toBe("Autor autenticado");
    expect(tx?.tenantId).toBe(tenants[0]);
    const audit = await ownerA.audit.list({});
    expect(
      audit.some(
        row =>
          row.actorUserId === users[0] && row.operator === "Autor autenticado"
      )
    ).toBe(true);
    expect(
      (await ownerB.audit.list({})).some(row => row.tenantId === tenants[0])
    ).toBe(false);
  });

  it("separa consulta administrativa de gravação e recusa paciente ou sessão incompatíveis", async () => {
    const event = {
      patientId: patients[0],
      appointmentId: sessions[0],
      eventType: "CALL_LOGGED" as const,
    };
    await expect(
      administrativeReader.mindos.receptionEvent(event)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(revoked.mindos.receptionEvent(event)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    for (const appointmentId of [sessions[1], sessions[2]])
      await expect(
        reception.mindos.receptionEvent({ ...event, appointmentId })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const id = await reception.mindos.receptionEvent(event);
    const [[saved]] = await db.query<RowDataPacket[]>(
      "SELECT * FROM mindos_reception_events WHERE id=?",
      [id]
    );
    expect(saved.createdByUserId).toBe(users[7]);
    expect(saved.tenantId).toBe(tenants[0]);
    expect(saved.appointmentId).toBe(sessions[0]);
    const [audits] = await db.query<RowDataPacket[]>(
      "SELECT actorUserId FROM mindos_access_audits WHERE tenantId=? AND action='CALL_LOGGED'",
      [tenants[0]]
    );
    expect(audits.map(a => a.actorUserId)).toContain(users[7]);
  });

  it("recusa campos de autoria e clínica enviados junto do evento", async () => {
    await expect(
      ownerA.mindos.receptionEvent({
        patientId: patients[0],
        eventType: "CALL_LOGGED",
        tenantId: tenants[1],
        createdByUserId: users[1],
        actorUserId: users[1],
      } as Parameters<typeof ownerA.mindos.receptionEvent>[0])
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("desfaz o evento inteiro quando a auditoria falha", async () => {
    const real = (await databaseModule.getDb())!;
    const [[before]] = await db.query<RowDataPacket[]>(
      "SELECT COUNT(*) n FROM mindos_reception_events WHERE tenantId=?",
      [tenants[0]]
    );
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
                        if (table === mindosAccessAudits)
                          throw new Error("Falha fictícia de auditoria");
                        return t.insert(table as any);
                      };
                    const v = Reflect.get(t, k);
                    return typeof v === "function" ? v.bind(t) : v;
                  },
                })
              )
            );
        const v = Reflect.get(target, prop);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    const spy = vi.spyOn(databaseModule, "getDb").mockResolvedValue(proxy);
    try {
      await expect(
        reception.mindos.receptionEvent({
          patientId: patients[0],
          appointmentId: sessions[0],
          eventType: "CALL_LOGGED",
        })
      ).rejects.toThrow("Falha fictícia de auditoria");
      const [[after]] = await db.query<RowDataPacket[]>(
        "SELECT COUNT(*) n FROM mindos_reception_events WHERE tenantId=?",
        [tenants[0]]
      );
      expect(after.n).toBe(before.n);
    } finally {
      spy.mockRestore();
    }
  });

  it("revalida o vínculo dentro da transação após a autorização inicial", async () => {
    const original = databaseModule.assertMindosPermission;
    const spy = vi
      .spyOn(databaseModule, "assertMindosPermission")
      .mockImplementation(async (...args) => {
        const result = await original(...args);
        if (args[0] === users[7])
          await db.execute(
            "UPDATE mindos_memberships SET active=0 WHERE id=?",
            [memberIds[7]]
          );
        return result;
      });
    try {
      await expect(
        reception.mindos.receptionEvent({
          patientId: patients[0],
          eventType: "CALL_LOGGED",
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      spy.mockRestore();
      await db.execute("UPDATE mindos_memberships SET active=1 WHERE id=?", [
        memberIds[7],
      ]);
    }
  });

  it("oculta a identidade da conta do portal também nos endpoints antigos", async () => {
    const dashboard = await ownerA.mindos.dashboard();
    expect(dashboard.patients.length).toBeGreaterThan(0);
    for (const p of dashboard.patients)
      expect(p).not.toHaveProperty("portalUserId");
    const appointments = await ownerA.mindos.appointments();
    expect(appointments.length).toBeGreaterThan(0);
    for (const a of appointments)
      expect(a.patient).not.toHaveProperty("portalUserId");
  });

  it("valida sessão e paciente conjuntamente no prontuário e no financeiro", async () => {
    for (const appointmentId of [sessions[1], sessions[2]]) {
      await expect(
        ownerA.care.createRecord({
          patientId: patients[0],
          appointmentId,
          recordType: "EVOLUTION",
          content: "Referência fictícia incompatível",
        })
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(
        ownerA.transactions.create({
          requestId: randomUUID(),
          patientId: patients[0],
          appointmentId,
          verticalCode: "PSYCHOLOGY_CLINIC",
          title: "Teste de referência",
          category: "TEST",
          paymentMethod: "TRANSFER",
          installments: 1,
          dueDate: new Date(),
          items: [{ name: "Sessão fictícia", quantity: 1, unitPrice: 100 }],
        })
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    const foreign = await ownerB.care.createRecord({
      patientId: patients[1],
      recordType: "EVOLUTION",
      content: "Registro fictício da clínica B",
    });
    await expect(
      ownerA.care.updateRecord({
        recordId: foreign,
        revision: 1,
        finalize: true,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      ownerA.care.createRecord({
        patientId: patients[0],
        parentRecordId: foreign,
        recordType: "EVOLUTION",
        content: "Adendo fictício incompatível",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      ownerA.care.assign({
        patientId: patients[0],
        userId: users[1],
        active: true,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("recusa referências externas também em tarefas, interações e liberação financeira", async () => {
    await expect(
      ownerA.crm.addTask({
        requestKey: randomUUID(),
        patientId: patients[1],
        title: "Tarefa fictícia",
        ownerUserId: users[0],
        dueAt: new Date(),
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      ownerA.crm.addInteraction({
        requestKey: randomUUID(),
        patientId: patients[1],
        channel: "INTERNAL",
        outcome: "NOTE",
        summary: "Interação fictícia",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      ownerA.care.financialAccess({
        patientId: patients[1],
        code: codeA,
        visible: true,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
