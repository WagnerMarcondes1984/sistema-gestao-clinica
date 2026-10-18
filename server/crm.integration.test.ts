import { randomUUID } from "node:crypto";
import { describe, beforeAll, afterAll, it, expect } from "vitest";
import mysql, {
  type Connection,
  type RowDataPacket,
  type ResultSetHeader,
} from "mysql2/promise";
import { clinicParts } from "../shared/scheduling";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
// @ts-expect-error Guard local do seed.
import { assertDemoSeedAllowed } from "./seed-safety.mjs";
const key = () => randomUUID();
describe("CRM administrativo, preferências e lembretes com MySQL", () => {
  let db: Connection,
    t: number,
    t2: number,
    p: number,
    p2: number,
    ownerId: number,
    readId: number,
    portalId: number,
    salesId: number,
    requestId: number,
    appointmentId: number;
  let owner: ReturnType<typeof appRouter.createCaller>,
    foreign: typeof owner,
    reader: typeof owner,
    sales: typeof owner,
    portal: typeof owner;
  const tenants: number[] = [],
    users: number[] = [];
  async function insert(sql: string, args: unknown[]) {
    const [r] = await db.execute<ResultSetHeader>(sql, args);
    return r.insertId;
  }
  async function account(tenant: number, role: string, permissions: string[]) {
    const id = await insert("INSERT INTO users(openId,name) VALUES(?,?)", [
      `crm-test-${key()}`,
      "Autor administrativo fictício",
    ]);
    users.push(id);
    await insert(
      "INSERT INTO mindos_memberships(tenantId,userId,role,permissionsJson) VALUES(?,?,?,?)",
      [tenant, id, role, JSON.stringify(permissions)]
    );
    const now = new Date();
    return {
      id,
      caller: appRouter.createCaller({
        user: {
          id,
          openId: `fixture-${id}`,
          name: "Autor do contexto",
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
  const lead = (extra: Record<string, unknown> = {}) => ({
    requestKey: key(),
    fullName: `Lead fictício ${key().slice(0, 8)}`,
    email: `crm-${key().slice(0, 8)}@example.com`,
    phone: "",
    source: "MANUAL" as const,
    ownerUserId: ownerId,
    nextContactAt: new Date(Date.now() + 86400000),
    preferredChannel: "EMAIL" as const,
    contactAllowed: false,
    ...extra,
  });
  async function getLead(id: number) {
    return (await owner.crm.overview()).leads.find(l => l.id === id)!;
  }
  beforeAll(async () => {
    assertDemoSeedAllowed({ ...process.env, ALLOW_DEMO_SEED: "true" });
    db = await mysql.createConnection(process.env.DATABASE_URL!);
    for (const suffix of ["A", "B"])
      tenants.push(
        await insert(
          "INSERT INTO mindos_tenants(slug,name,siteConfigJson) VALUES(?,?,?)",
          [`crm-${suffix}-${key()}`, "Clínica CRM fictícia", "{}"]
        )
      );
    [t, t2] = tenants;
    const a = await account(t, "OWNER", []);
    owner = a.caller;
    ownerId = a.id;
    foreign = (await account(t2, "OWNER", [])).caller;
    const b = await account(t, "VIEWER", ["VIEW_CRM"]);
    reader = b.caller;
    readId = b.id;
    const s = await account(t, "SALES", ["VIEW_CRM", "MANAGE_CRM"]);
    sales = s.caller;
    salesId = s.id;
    const pa = await account(t, "PATIENT", []);
    portal = pa.caller;
    portalId = pa.id;
    p = await insert(
      "INSERT INTO mindos_patients(tenantId,fullName,email,preferredChannel,administrativeStatus,portalUserId) VALUES(?,?,?,'EMAIL','ACTIVE',?)",
      [t, "Paciente CRM fictício", "patient-crm@example.com", portalId]
    );
    p2 = await insert(
      "INSERT INTO mindos_patients(tenantId,fullName,administrativeStatus) VALUES(?,?,'ACTIVE')",
      [t2, "Outro paciente fictício"]
    );
    requestId = await insert(
      "INSERT INTO mindos_booking_requests(tenantId,name,contactChannel,contactValue,serviceType,preferredDate,preferredTime) VALUES(?,?,'EMAIL',?,'Solicitação de teste',NOW(),'10:00')",
      [t, "Solicitante CRM fictício", "request-crm@example.com"]
    );
    appointmentId = await insert(
      "INSERT INTO mindos_appointments(tenantId,patientId,professionalName,unitName,serviceType,startsAt,endsAt) VALUES(?,?,'Fictício','Fictícia','Fictício',?,?)",
      [
        t,
        p,
        new Date(Date.now() + 2 * 86400000),
        new Date(Date.now() + 2 * 86400000 + 3600000),
      ]
    );
  });
  afterAll(async () => {
    if (!db) return;
    try {
      for (const id of tenants) {
        for (const table of [
          "mindos_crm_reminders",
          "mindos_contact_preferences",
          "mindos_crm_interactions",
          "mindos_crm_tasks",
          "mindos_crm_leads",
          "mindos_access_audits",
          "mindos_booking_requests",
          "mindos_appointments",
          "mindos_availability",
          "mindos_professionals",
          "mindos_units",
          "mindos_services",
          "mindos_patients",
          "mindos_memberships",
        ])
          await db.execute(`DELETE FROM ${table} WHERE tenantId=?`, [id]);
        await db.execute("DELETE FROM mindos_tenants WHERE id=?", [id]);
      }
      for (const id of users)
        await db.execute("DELETE FROM users WHERE id=?", [id]);
    } finally {
      await db.end();
    }
  });
  it("cria lead e histórico com autoria autenticada sem expor hashes ou dados clínicos", async () => {
    const r = await owner.crm.create(lead());
    const row = await getLead(r.id);
    expect(row.ownerUserId).toBe(ownerId);
    expect(row).not.toHaveProperty("creationHash");
    const history = await owner.crm.history({ leadId: r.id });
    expect(history[0].actorUserId).toBe(ownerId);
    expect(JSON.stringify(await owner.crm.overview())).not.toContain(
      "clinicalRecords"
    );
  });
  it("reenvio simultâneo é idempotente; mesma chave com dados diferentes é recusada", async () => {
    const input = lead();
    const [a, b] = await Promise.all([
      owner.crm.create(input),
      owner.crm.create(input),
    ]);
    expect(a.id).toBe(b.id);
    await expect(
      owner.crm.create({ ...input, fullName: "Outro nome" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("contato + nome impede duplicação sem unir familiares com o mesmo e-mail", async () => {
    const input = lead({
      fullName: "Família fictícia A",
      email: "family-crm@example.com",
    });
    await owner.crm.create(input);
    await expect(
      owner.crm.create({ ...input, requestKey: key() })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      owner.crm.create({
        ...input,
        requestKey: key(),
        fullName: "Família fictícia B",
      })
    ).resolves.toHaveProperty("id");
  });
  it("autoriza leitura separada da gestão e isola lead, tarefa e responsável por clínica", async () => {
    const r = await owner.crm.create(lead());
    expect((await reader.crm.overview()).leads.length).toBeGreaterThan(0);
    await expect(reader.crm.create(lead())).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(foreign.crm.history({ leadId: r.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      owner.crm.create(lead({ ownerUserId: users[1] }))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(portal.crm.overview()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("protege revisão e transições; perda e reabertura preservam o motivo no histórico", async () => {
    const { id } = await owner.crm.create(lead());
    let row = await getLead(id);
    const base = {
      leadId: id,
      revision: row.revision,
      ownerUserId: ownerId,
      nextContactAt: null,
      contactAllowed: false,
      reason: "",
    };
    await owner.crm.update({ ...base, stage: "CONTACTED" });
    await expect(
      owner.crm.update({ ...base, stage: "QUALIFIED" })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    row = await getLead(id);
    await expect(
      owner.crm.update({ ...base, revision: row.revision, stage: "LOST" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await owner.crm.update({
      ...base,
      revision: row.revision,
      stage: "LOST",
      reason: "Sem interesse informado",
    });
    row = await getLead(id);
    await owner.crm.update({
      ...base,
      revision: row.revision,
      stage: "NEW",
      reason: "Pessoa pediu novo contato",
    });
    expect(
      (await owner.crm.history({ leadId: id })).some(h =>
        h.summary.includes("Sem interesse")
      )
    ).toBe(true);
  });
  it("importa solicitações uma única vez sem criar paciente nem assumir autorização de marketing", async () => {
    const [a, b] = await Promise.all([
      owner.crm.importRequest({
        requestId,
        ownerUserId: ownerId,
        identityConfirmed: true,
      }),
      owner.crm.importRequest({
        requestId,
        ownerUserId: ownerId,
        identityConfirmed: true,
      }),
    ]);
    expect(a.id).toBe(b.id);
    const row = await getLead(a.id);
    expect(row.source).toBe("PUBLIC_BOOKING");
    expect(row.contactAllowed).toBe(false);
    expect(row.patientId).toBeNull();
    await expect(
      foreign.crm.importRequest({
        requestId,
        ownerUserId: null,
        identityConfirmed: true,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("reaproveita lead manual na importação por nome e contato sem criar outra pessoa", async () => {
    const data = lead({
      fullName: "Solicitante compartilhado",
      email: "shared-crm@example.com",
    });
    const { id } = await owner.crm.create(data);
    const request = await insert(
      "INSERT INTO mindos_booking_requests(tenantId,name,contactChannel,contactValue,serviceType,preferredDate,preferredTime) VALUES(?,?,'EMAIL',?,'Teste',NOW(),'12:00')",
      [t, data.fullName, data.email]
    );
    await expect(
      owner.crm.importRequest({
        requestId: request,
        ownerUserId: null,
        identityConfirmed: true,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      (
        await owner.crm.importRequest({
          requestId: request,
          ownerUserId: null,
          targetLeadId: id,
          identityConfirmed: true,
        })
      ).id
    ).toBe(id);
  });
  it("converte somente com permissão de pacientes, identidade confirmada e referência da própria clínica", async () => {
    const { id } = await owner.crm.create(lead());
    const l = await getLead(id);
    await expect(
      sales.crm.convert({
        leadId: id,
        revision: l.revision,
        identityConfirmed: true,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      owner.crm.convert({
        leadId: id,
        revision: l.revision,
        patientId: p2,
        identityConfirmed: true,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      owner.crm.convert({
        leadId: id,
        revision: l.revision,
        identityConfirmed: false,
      } as any)
    ).rejects.toThrow();
  });
  it("conversão concorrente cria somente um paciente e preserva histórico no novo cadastro", async () => {
    const { id } = await owner.crm.create(lead());
    const l = await getLead(id);
    await owner.crm.addInteraction({
      requestKey: key(),
      leadId: id,
      channel: "PHONE",
      outcome: "REACHED",
      summary: "Conferência administrativa fictícia",
    });
    const input = {
      leadId: id,
      revision: l.revision,
      identityConfirmed: true as const,
    };
    const [a, b] = await Promise.all([
      owner.crm.convert(input),
      owner.crm.convert(input),
    ]);
    expect(a.patientId).toBe(b.patientId);
    expect((await getLead(id)).stage).toBe("CONVERTED");
    expect(
      (await owner.crm.history({ patientId: a.patientId })).some(
        h => h.summary === "Conferência administrativa fictícia"
      )
    ).toBe(true);
  });
  it("não cria duplicata quando já há paciente com nome/contato; vínculo explícito reaproveita cadastro", async () => {
    const data = lead({
      fullName: "Paciente CRM fictício",
      email: "patient-crm@example.com",
    });
    const { id } = await owner.crm.create(data);
    const l = await getLead(id);
    await expect(
      owner.crm.convert({
        leadId: id,
        revision: l.revision,
        identityConfirmed: true,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      (
        await owner.crm.convert({
          leadId: id,
          revision: l.revision,
          patientId: p,
          identityConfirmed: true,
        })
      ).patientId
    ).toBe(p);
  });
  it("tarefas possuem responsáveis, vencimento, edição concorrente e histórico de conclusão", async () => {
    const { id } = await owner.crm.create(lead());
    const input = {
      requestKey: key(),
      leadId: id,
      title: "Retornar contato fictício",
      kind: "FOLLOW_UP" as const,
      ownerUserId: ownerId,
      dueAt: new Date(Date.now() - 3600000),
    };
    const [a, b] = await Promise.all([
      owner.crm.addTask(input),
      owner.crm.addTask(input),
    ]);
    expect(a.id).toBe(b.id);
    let task = (await owner.crm.overview()).tasks.find(t => t.id === a.id)!;
    expect(task.overdue).toBe(true);
    await owner.crm.updateTask({
      taskId: task.id,
      revision: task.revision,
      title: "Retorno reagendado",
      ownerUserId: salesId,
      dueAt: new Date(Date.now() + 86400000),
    });
    await expect(
      owner.crm.resolveTask({
        taskId: task.id,
        revision: task.revision,
        status: "DONE",
        resolution: "Contato concluído",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    task = (await owner.crm.overview()).tasks.find(t => t.id === a.id)!;
    await owner.crm.resolveTask({
      taskId: task.id,
      revision: task.revision,
      status: "DONE",
      resolution: "Retorno realizado manualmente",
    });
    expect(
      (await owner.crm.history({ leadId: id })).some(h =>
        h.summary.includes("Retorno realizado")
      )
    ).toBe(true);
  });
  it("conversão cancela acompanhamento comercial sem declarar que foi realizado", async () => {
    const { id } = await owner.crm.create(lead());
    const task = await owner.crm.addTask({
      requestKey: key(),
      leadId: id,
      title: "Contato pendente",
      kind: "FOLLOW_UP",
      ownerUserId: ownerId,
      dueAt: new Date(),
    });
    await owner.crm.convert({
      leadId: id,
      revision: 1,
      identityConfirmed: true,
    });
    const saved = (await owner.crm.overview()).tasks.find(
      t => t.id === task.id
    )!;
    expect(saved.status).toBe("CANCELLED");
    expect(saved.resolution).toContain("Conversão");
    expect(saved.revision).toBe(2);
  });
  it("interações são append-only, idempotentes e não permitem fabricar status de entrega", async () => {
    const input = {
      requestKey: key(),
      patientId: p,
      channel: "EMAIL" as const,
      outcome: "ATTEMPTED" as const,
      summary: "Tentativa externa registrada manualmente",
    };
    const [a, b] = await Promise.all([
      owner.crm.addInteraction(input),
      owner.crm.addInteraction(input),
    ]);
    expect(a.id).toBe(b.id);
    await expect(
      owner.crm.addInteraction({ ...input, outcome: "DELIVERED" } as any)
    ).rejects.toThrow();
    await expect(
      foreign.crm.addInteraction({ ...input, requestKey: key() })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("prefere bloquear sem autorização; portal só altera preferências do próprio paciente", async () => {
    expect(await portal.crm.myPreferences()).toEqual({
      revision: 0,
      emailAllowed: false,
      whatsappAllowed: false,
    });
    await expect(
      foreign.crm.preferences({ patientId: p })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      portal.crm.saveMyPreferences({
        revision: 0,
        emailAllowed: true,
        whatsappAllowed: false,
        patientId: p2,
      } as any)
    ).rejects.toThrow();
    await portal.crm.saveMyPreferences({
      revision: 0,
      emailAllowed: true,
      whatsappAllowed: false,
    });
    await expect(
      portal.crm.saveMyPreferences({
        revision: 0,
        emailAllowed: false,
        whatsappAllowed: false,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("prepara lembretes neutros uma única vez e nunca declara envio sem provedor", async () => {
    await Promise.all([
      owner.crm.prepareReminders(),
      owner.crm.prepareReminders(),
    ]);
    const rows = (await owner.crm.reminders()).items.filter(
      r => r.appointmentId === appointmentId
    );
    expect(rows).toHaveLength(2);
    expect(rows.every(r => r.status === "WAITING_PROVIDER")).toBe(true);
    expect(
      rows.every(
        r =>
          !r.templateText.includes("psic") &&
          !r.templateText.includes("Paciente")
      )
    ).toBe(true);
    expect((await owner.crm.reminders()).providerConfigured).toBe(false);
  });
  it("retirada de autorização bloqueia imediatamente e nova preparação respeita a preferência atual", async () => {
    let pref = await portal.crm.myPreferences();
    await portal.crm.saveMyPreferences({ ...pref, emailAllowed: false });
    expect(
      (await owner.crm.reminders()).items
        .filter(r => r.appointmentId === appointmentId)
        .every(r => r.status === "SUPPRESSED")
    ).toBe(true);
    pref = await portal.crm.myPreferences();
    await portal.crm.saveMyPreferences({ ...pref, emailAllowed: true });
    await owner.crm.prepareReminders();
    expect(
      (await owner.crm.reminders()).items
        .filter(r => r.appointmentId === appointmentId)
        .every(r => r.status === "WAITING_PROVIDER")
    ).toBe(true);
  });
  it("mudança de agenda cancela versões antigas sem duplicar a nova e cancelamento impede lembrete", async () => {
    await db.execute(
      "UPDATE mindos_appointments SET revision=revision+1,startsAt=DATE_ADD(startsAt,INTERVAL 1 HOUR),endsAt=DATE_ADD(endsAt,INTERVAL 1 HOUR) WHERE id=?",
      [appointmentId]
    );
    await owner.crm.prepareReminders();
    let rows = (await owner.crm.reminders()).items.filter(
      r => r.appointmentId === appointmentId
    );
    expect(rows.filter(r => r.status === "CANCELLED")).toHaveLength(2);
    expect(rows.filter(r => r.status === "WAITING_PROVIDER")).toHaveLength(2);
    await db.execute(
      "UPDATE mindos_appointments SET status='CANCELLED',revision=revision+1 WHERE id=?",
      [appointmentId]
    );
    await owner.crm.prepareReminders();
    rows = (await owner.crm.reminders()).items.filter(
      r => r.appointmentId === appointmentId
    );
    expect(rows.every(r => r.status === "CANCELLED")).toBe(true);
  });
  it("tarefas de retorno geram lembretes sem vazar o título; conclusão cancela a preparação", async () => {
    const { id } = await owner.crm.addTask({
      requestKey: key(),
      patientId: p,
      title: "Texto reservado fictício não deve sair",
      kind: "RETURN",
      ownerUserId: ownerId,
      dueAt: new Date(),
    });
    await owner.crm.prepareReminders();
    let reminders = (await owner.crm.reminders()).items.filter(
      r => r.taskId === id
    );
    expect(reminders).toHaveLength(1);
    expect(reminders[0].templateText).not.toContain("reservado");
    await owner.crm.resolveTask({
      taskId: id,
      revision: 1,
      status: "DONE",
      resolution: "Retorno conferido",
    });
    reminders = (await owner.crm.reminders()).items.filter(
      r => r.taskId === id
    );
    expect(reminders[0].status).toBe("CANCELLED");
  });
  it("confirmação da triagem reaproveita o paciente e converte o lead na mesma transação", async () => {
    const pro = await insert(
      "INSERT INTO mindos_professionals(tenantId,name,nameKey) VALUES(?,'Profissional CRM fictício','crm-prof-test')",
      [t]
    );
    const unit = await insert(
      "INSERT INTO mindos_units(tenantId,name,nameKey) VALUES(?,'Unidade CRM fictícia','crm-unit-test')",
      [t]
    );
    const service = await insert(
      "INSERT INTO mindos_services(tenantId,name,nameKey,durationMinutes) VALUES(?,'Serviço CRM fictício','crm-service-test',50)",
      [t]
    );
    const date = clinicParts(
      new Date(Date.now() + 4 * 86400000),
      "America/Sao_Paulo"
    ).date;
    await insert(
      "INSERT INTO mindos_availability(tenantId,professionalId,unitId,weekday,startMinute,endMinute) VALUES(?,?,?,?,0,1439)",
      [t, pro, unit, new Date(date + "T12:00:00Z").getUTCDay()]
    );
    let request = (await owner.scheduling.requests()).find(
      r => r.id === requestId
    )!;
    await owner.scheduling.processRequest({
      requestId,
      revision: request.revision,
      status: "CONTACTED",
    });
    request = (await owner.scheduling.requests()).find(
      r => r.id === requestId
    )!;
    const appointment = {
      patientId: p,
      professionalId: pro,
      unitId: unit,
      serviceId: service,
      mode: "IN_PERSON" as const,
      date,
      time: "14:00",
      count: 1,
      intervalWeeks: 1,
    };
    await owner.scheduling.processRequest({
      requestId,
      revision: request.revision,
      status: "CONFIRMED",
      appointment,
    });
    const lead = await getLead(request.crmLeadId!);
    expect(lead.stage).toBe("CONVERTED");
    expect(lead.patientId).toBe(p);
    expect(
      (await owner.crm.history({ patientId: p })).some(h =>
        h.summary.includes("confirmação da triagem")
      )
    ).toBe(true);
    const otherPatient = await insert(
      "INSERT INTO mindos_patients(tenantId,fullName,administrativeStatus) VALUES(?,'Outra identidade fictícia','ACTIVE')",
      [t]
    );
    const source = await insert(
      "INSERT INTO mindos_booking_requests(tenantId,name,contactChannel,contactValue,serviceType,preferredDate,preferredTime) VALUES(?,'Lead com identidade conferida','EMAIL','identity-crm@example.com','Teste',NOW(),'15:00')",
      [t]
    );
    const imported = await owner.crm.importRequest({
      requestId: source,
      ownerUserId: null,
      identityConfirmed: true,
    });
    await owner.crm.convert({
      leadId: imported.id,
      revision: 1,
      patientId: p,
      identityConfirmed: true,
    });
    let r = (await owner.scheduling.requests()).find(r => r.id === source)!;
    await owner.scheduling.processRequest({
      requestId: source,
      revision: r.revision,
      status: "CONTACTED",
    });
    r = (await owner.scheduling.requests()).find(r => r.id === source)!;
    const before = (await owner.scheduling.list({})).items.length;
    await expect(
      owner.scheduling.processRequest({
        requestId: source,
        revision: r.revision,
        status: "CONFIRMED",
        appointment: { ...appointment, patientId: otherPatient, time: "15:00" },
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await owner.scheduling.list({})).items.length).toBe(before);
    expect(
      (await owner.scheduling.requests()).find(r => r.id === source)?.status
    ).toBe("CONTACTED");
  });
  it("métricas derivam de conversões e sessões reais, sem assumir efeito de lembretes", async () => {
    for (const status of ["COMPLETED", "COMPLETED", "NO_SHOW"])
      await insert(
        "INSERT INTO mindos_appointments(tenantId,patientId,professionalName,unitName,serviceType,status,startsAt,endsAt) VALUES(?,?,'Fictício','Fictícia','Fictício',?,?,?)",
        [
          t,
          p,
          status,
          new Date(Date.now() - 86400000),
          new Date(Date.now() - 86400000 + 3600000),
        ]
      );
    const result = await owner.crm.metrics();
    expect(result.converted).toBeGreaterThan(0);
    expect(result.completedAppointments).toBe(2);
    expect(result.eligibleAppointments).toBe(3);
    expect(result.attendanceRate).toBeCloseTo(2 / 3);
    expect(result.returnedPatients).toBe(1);
    expect((await foreign.crm.metrics()).totalLeads).toBe(0);
  });
  it("revogação bloqueia inclusive replay e responsável desativado não recebe nova tarefa", async () => {
    const input = lead();
    const { id } = await owner.crm.create(input);
    await db.execute(
      "UPDATE mindos_memberships SET active=false WHERE userId=?",
      [ownerId]
    );
    try {
      await expect(owner.crm.create(input)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    } finally {
      await db.execute(
        "UPDATE mindos_memberships SET active=true WHERE userId=?",
        [ownerId]
      );
    }
    await db.execute(
      "UPDATE mindos_memberships SET active=false WHERE userId=?",
      [salesId]
    );
    await expect(
      owner.crm.addTask({
        requestKey: key(),
        leadId: id,
        title: "Retorno para conta inativa",
        kind: "FOLLOW_UP",
        ownerUserId: salesId,
        dueAt: new Date(),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
