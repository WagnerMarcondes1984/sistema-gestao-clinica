import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import mysql, {
  type Connection,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  appointmentInput,
  clinicParts,
  addCivilDays,
} from "../shared/scheduling";
// @ts-expect-error Guard do seed JavaScript.
import { assertDemoSeedAllowed } from "./seed-safety.mjs";

describe("operação clínica, concorrência, recorrência e triagem", () => {
  let db: Connection;
  const tenants: number[] = [],
    userIds: number[] = [];
  const oldSlug = process.env.PUBLIC_TENANT_SLUG;
  type Caller = ReturnType<typeof appRouter.createCaller>;
  let owner: Caller, other: Caller, reception: Caller, viewer: Caller;
  let ownerId: number, viewerId: number;
  let professional: number,
    secondProfessional: number,
    unit: number,
    service: number,
    foreignProfessional: number,
    foreignUnit: number,
    foreignService: number,
    patient: number,
    secondPatient: number,
    foreignPatient: number;
  const today = clinicParts(new Date(), "America/Sao_Paulo").date;
  const day = (n: number) => addCivilDays(today, n);
  const slug = `operation-${randomUUID()}`;
  async function insert(sql: string, values: unknown[]) {
    const [r] = await db.execute<ResultSetHeader>(sql, values);
    return r.insertId;
  }
  async function account(tenant: number, role: string, permissions: string[]) {
    const id = await insert("INSERT INTO users(openId,name) VALUES(?,?)", [
      `operation-${randomUUID()}`,
      "Conta fictícia",
    ]);
    userIds.push(id);
    await insert(
      "INSERT INTO mindos_memberships(tenantId,userId,role,permissionsJson) VALUES(?,?,?,?)",
      [tenant, id, role, JSON.stringify(permissions)]
    );
    const now = new Date();
    const ctx: TrpcContext = {
      user: {
        id,
        openId: `fixture-${id}`,
        name: "Conta fictícia",
        email: null,
        role: "user",
        loginMethod: "test",
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now,
      },
      req: {
        headers: {},
        socket: { remoteAddress: "fixture-local-ip" },
      } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    return { id, caller: appRouter.createCaller(ctx) };
  }
  const input = (
    offset: number,
    time = "09:00",
    extra: Partial<ReturnType<typeof appointmentInput.parse>> = {}
  ) =>
    appointmentInput.parse({
      patientId: patient,
      professionalId: professional,
      unitId: unit,
      serviceId: service,
      mode: "ONLINE",
      date: day(offset),
      time,
      ...extra,
    });
  async function session(id: number) {
    return (await owner.scheduling.list({})).items.find(a => a.id === id)!;
  }
  beforeAll(async () => {
    assertDemoSeedAllowed({ ...process.env, ALLOW_DEMO_SEED: "true" });
    db = await mysql.createConnection(process.env.DATABASE_URL!);
    tenants.push(
      await insert(
        "INSERT INTO mindos_tenants(slug,name,siteConfigJson) VALUES(?,?,'{}')",
        [slug, "Clínica fictícia operacional A"]
      )
    );
    tenants.push(
      await insert(
        "INSERT INTO mindos_tenants(slug,name,siteConfigJson) VALUES(?,?,'{}')",
        [`${slug}-b`, "Clínica fictícia operacional B"]
      )
    );
    const a = await account(tenants[0], "OWNER", ["ALL"]);
    owner = a.caller;
    ownerId = a.id;
    other = (await account(tenants[1], "OWNER", ["ALL"])).caller;
    reception = (
      await account(tenants[0], "RECEPTIONIST", [
        "VIEW_PATIENT_BASIC",
        "VIEW_ADMINISTRATIVE",
        "MANAGE_APPOINTMENTS",
      ])
    ).caller;
    const v = await account(tenants[0], "VIEWER", ["VIEW_PATIENT_BASIC"]);
    viewer = v.caller;
    viewerId = v.id;
    patient = (
      await owner.patients.create({ fullName: "Paciente fictício operação A" })
    ).id;
    secondPatient = (
      await owner.patients.create({
        fullName: "Segundo paciente fictício operação A",
      })
    ).id;
    foreignPatient = (
      await other.patients.create({ fullName: "Paciente fictício operação B" })
    ).id;
    professional = (
      await owner.scheduling.saveConfig({
        kind: "professional",
        name: "Profissional fictício A",
        active: true,
      })
    ).id;
    secondProfessional = (
      await owner.scheduling.saveConfig({
        kind: "professional",
        name: "Outro profissional fictício A",
        active: true,
      })
    ).id;
    unit = (
      await owner.scheduling.saveConfig({
        kind: "unit",
        name: "Unidade fictícia A",
        active: true,
      })
    ).id;
    service = (
      await owner.scheduling.saveConfig({
        kind: "service",
        name: "Serviço fictício A",
        durationMinutes: 30,
        mode: "BOTH",
        publicEnabled: true,
        active: true,
      })
    ).id;
    foreignProfessional = (
      await other.scheduling.saveConfig({
        kind: "professional",
        name: "Profissional fictício B",
        active: true,
      })
    ).id;
    foreignUnit = (
      await other.scheduling.saveConfig({
        kind: "unit",
        name: "Unidade fictícia B",
        active: true,
      })
    ).id;
    foreignService = (
      await other.scheduling.saveConfig({
        kind: "service",
        name: "Serviço fictício B",
        durationMinutes: 30,
        mode: "BOTH",
        publicEnabled: true,
        active: true,
      })
    ).id;
    for (const p of [professional, secondProfessional])
      for (let weekday = 0; weekday < 7; weekday++)
        await owner.scheduling.saveConfig({
          kind: "availability",
          professionalId: p,
          unitId: unit,
          weekday,
          startMinute: 0,
          endMinute: 1440,
          active: true,
        });
    for (let weekday = 0; weekday < 7; weekday++)
      await other.scheduling.saveConfig({
        kind: "availability",
        professionalId: foreignProfessional,
        unitId: foreignUnit,
        weekday,
        startMinute: 0,
        endMinute: 1440,
        active: true,
      });
    process.env.PUBLIC_TENANT_SLUG = slug;
  });
  afterAll(async () => {
    if (oldSlug === undefined) delete process.env.PUBLIC_TENANT_SLUG;
    else process.env.PUBLIC_TENANT_SLUG = oldSlug;
    if (!db) return;
    try {
      for (const tenant of tenants)
        for (const table of [
          "mindos_booking_limits",
          "mindos_booking_requests",
          "mindos_reception_events",
          "mindos_access_audits",
          "mindos_appointments",
          "mindos_availability",
          "mindos_professionals",
          "mindos_units",
          "mindos_services",
          "mindos_patients",
          "mindos_memberships",
        ])
          await db.execute(`DELETE FROM ${table} WHERE tenantId=?`, [tenant]);
      for (const id of userIds)
        await db.execute("DELETE FROM users WHERE id=?", [id]);
      for (const id of tenants)
        await db.execute("DELETE FROM mindos_tenants WHERE id=?", [id]);
    } finally {
      await db.end();
    }
  });
  it("protege configuração, referências e revisão de cadastros", async () => {
    expect((await reception.scheduling.context()).canConfigure).toBe(false);
    await expect(
      reception.scheduling.saveConfig({
        kind: "unit",
        name: "Negada",
        active: true,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      owner.scheduling.saveConfig({
        kind: "unit",
        id: foreignUnit,
        revision: 1,
        name: "Cruzada",
        active: true,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      owner.scheduling.saveConfig({
        kind: "professional",
        name: "Vínculo inválido",
        userId: viewerId,
        active: true,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      owner.scheduling.saveConfig({
        kind: "availability",
        professionalId: foreignProfessional,
        unitId: unit,
        weekday: 1,
        startMinute: 100,
        endMinute: 200,
        active: true,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      owner.scheduling.saveConfig({
        kind: "availability",
        professionalId: professional,
        unitId: unit,
        weekday: 1,
        startMinute: 100,
        endMinute: 200,
        active: true,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const temp = await owner.scheduling.saveConfig({
      kind: "unit",
      name: "Unidade para revisão",
      active: true,
    });
    await owner.scheduling.saveConfig({
      kind: "unit",
      id: temp.id,
      revision: 1,
      name: "Unidade revisada",
      active: false,
    });
    await expect(
      owner.scheduling.saveConfig({
        kind: "unit",
        id: temp.id,
        revision: 1,
        name: "Edição antiga",
        active: true,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("duas reservas simultâneas do profissional geram uma única sessão", async () => {
    const attempts = await Promise.allSettled([
      owner.scheduling.create(input(1)),
      reception.scheduling.create(
        input(1, "09:00", { patientId: secondPatient })
      ),
    ]);
    expect(attempts.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (attempts.find(r => r.status === "rejected") as PromiseRejectedResult)
        .reason.code
    ).toBe("CONFLICT");
    expect((await owner.scheduling.list({ date: day(1) })).items).toHaveLength(
      1
    );
  });
  it("bloqueia paciente simultâneo, referências cruzadas e recurso inativo", async () => {
    const selected = (await owner.scheduling.list({ date: day(1) })).items[0];
    await expect(
      owner.scheduling.create(
        input(1, "09:00", {
          patientId: selected.patientId,
          professionalId: secondProfessional,
        })
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
    for (const extra of [
      { patientId: foreignPatient },
      { professionalId: foreignProfessional },
      { unitId: foreignUnit },
      { serviceId: foreignService },
    ])
      await expect(
        owner.scheduling.create(input(2, "09:00", extra))
      ).rejects.toThrow();
    const closed = await owner.scheduling.saveConfig({
      kind: "service",
      name: "Serviço inativo",
      durationMinutes: 30,
      mode: "ONLINE",
      publicEnabled: false,
      active: false,
    });
    await expect(
      owner.scheduling.create(input(2, "09:00", { serviceId: closed.id }))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(viewer.scheduling.list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      other.scheduling.transition({
        appointmentId: selected.id,
        revision: 1,
        status: "CANCELLED",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("valida disponibilidade, duração no servidor e fim de janela", async () => {
    const limited = await owner.scheduling.saveConfig({
      kind: "professional",
      name: "Profissional janela curta",
      active: true,
    });
    await owner.scheduling.saveConfig({
      kind: "availability",
      professionalId: limited.id,
      unitId: unit,
      weekday: new Date(`${day(3)}T12:00:00Z`).getUTCDay(),
      startMinute: 540,
      endMinute: 600,
      active: true,
    });
    await expect(
      owner.scheduling.create(input(3, "08:30", { professionalId: limited.id }))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      owner.scheduling.create(input(3, "09:45", { professionalId: limited.id }))
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const made = await owner.scheduling.create(
      input(3, "09:00", { professionalId: limited.id })
    );
    const a = await session(made.ids[0]);
    expect(a.endsAt.getTime() - a.startsAt.getTime()).toBe(30 * 60000);
  });
  it("conflito em ocorrência futura desfaz toda a criação de série", async () => {
    await owner.scheduling.create(input(17, "10:00"));
    const before = (await owner.scheduling.list({})).items.length;
    await expect(
      owner.scheduling.create(input(10, "10:00", { count: 3 }))
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await owner.scheduling.list({})).items).toHaveLength(before);
  });
  it("edita uma ocorrência e depois a série futura mantendo o histórico", async () => {
    const series = await owner.scheduling.create(
      input(30, "11:00", { count: 3 })
    );
    const anchor = await session(series.ids[0]);
    const moved = await owner.scheduling.reschedule({
      appointmentId: anchor.id,
      revision: 1,
      scope: "ONE",
      data: input(30, "12:00"),
    });
    expect((await session(anchor.id)).status).toBe("RESCHEDULED");
    expect((await session(moved.ids[0])).recurrenceId).toBe(
      series.recurrenceId
    );
    const all = await owner.scheduling.reschedule({
      appointmentId: series.ids[1],
      revision: 1,
      scope: "SERIES",
      data: input(37, "13:00"),
    });
    expect(all.ids).toHaveLength(2);
    expect((await session(moved.ids[0])).status).toBe("SCHEDULED");
    expect((await session(all.ids[0])).local.time).toBe("13:00");
    await expect(
      owner.scheduling.reschedule({
        appointmentId: anchor.id,
        revision: 1,
        scope: "ONE",
        data: input(30, "14:00"),
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("reagendamento em série falha atomicamente se outra ocorrência conflita", async () => {
    const series = await owner.scheduling.create(
      input(65, "14:00", { count: 2 })
    );
    await owner.scheduling.create(
      input(72, "15:00", { patientId: secondPatient })
    );
    const before = (await owner.scheduling.list({})).items.length;
    await expect(
      owner.scheduling.reschedule({
        appointmentId: series.ids[0],
        revision: 1,
        scope: "SERIES",
        data: input(65, "15:00"),
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await owner.scheduling.list({})).items).toHaveLength(before);
    expect((await session(series.ids[0])).status).toBe("SCHEDULED");
  });
  it("check-in atualiza só a sessão correta e fila somente do dia", async () => {
    const a = await owner.scheduling.create(input(0, "00:00"));
    const b = await owner.scheduling.create(input(0, "01:00"));
    await reception.scheduling.transition({
      appointmentId: a.ids[0],
      revision: 1,
      status: "WAITING",
    });
    let queue = await reception.scheduling.reception();
    expect(queue.items.every(s => s.local.date === today)).toBe(true);
    expect(queue.metrics.arrivals).toBe(1);
    expect(queue.metrics.waiting).toBe(1);
    expect((await session(b.ids[0])).status).toBe("SCHEDULED");
    await expect(
      reception.scheduling.transition({
        appointmentId: a.ids[0],
        revision: 1,
        status: "WAITING",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await reception.scheduling.transition({
      appointmentId: a.ids[0],
      revision: 2,
      status: "IN_PROGRESS",
    });
    await reception.scheduling.transition({
      appointmentId: a.ids[0],
      revision: 3,
      status: "COMPLETED",
    });
    queue = await reception.scheduling.reception();
    expect(queue.metrics.waiting).toBe(0);
    expect(queue.metrics.completed).toBe(1);
    const future = await owner.scheduling.create(input(2, "16:00"));
    await expect(
      reception.scheduling.transition({
        appointmentId: future.ids[0],
        revision: 1,
        status: "WAITING",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      reception.scheduling.transition({
        appointmentId: future.ids[0],
        revision: 1,
        status: "NO_SHOW",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await reception.scheduling.transition({
      appointmentId: future.ids[0],
      revision: 1,
      status: "CANCELLED",
    });
    await expect(
      reception.scheduling.transition({
        appointmentId: future.ids[0],
        revision: 2,
        status: "CONFIRMED",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("consulta pública lista somente serviços liberados e limita envios simultâneos", async () => {
    const pub = await owner.publicMindos.scheduling();
    expect(pub.services.map(s => s.id)).toContain(service);
    expect(pub.services.every(s => s.id !== foreignService)).toBe(true);
    const request = {
      name: "Solicitante fictício",
      contactChannel: "EMAIL" as const,
      contactValue: "public-operation@example.com",
      serviceId: service,
      date: day(5),
      time: "10:00",
      consent: true as const,
    };
    const attempts = await Promise.allSettled([
      owner.publicMindos.requestBooking(request),
      owner.publicMindos.requestBooking(request),
    ]);
    expect(attempts.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (attempts.find(r => r.status === "rejected") as PromiseRejectedResult)
        .reason.code
    ).toBe("TOO_MANY_REQUESTS");
    const [limits] = await db.execute<RowDataPacket[]>(
      "SELECT keyHash FROM mindos_booking_limits WHERE tenantId=?",
      [tenants[0]]
    );
    expect(limits).toHaveLength(3);
    expect(limits.every(row => /^[a-f0-9]{64}$/.test(row.keyHash))).toBe(true);
    await expect(
      owner.publicMindos.requestBooking({
        ...request,
        contactValue: "other@example.com",
        serviceId: foreignService,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      owner.publicMindos.requestBooking({ ...request, website: "spam" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("triagem contata, confirma e vincula sem duplicar a sessão ou paciente", async () => {
    const request = (await owner.scheduling.requests())[0];
    const countBefore = (await owner.patients.list({})).total;
    await expect(
      owner.scheduling.processRequest({
        requestId: request.id,
        revision: 1,
        status: "CONFIRMED",
        appointment: input(5, "10:00"),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await owner.scheduling.processRequest({
      requestId: request.id,
      revision: 1,
      status: "CONTACTED",
    });
    const confirmed = await owner.scheduling.processRequest({
      requestId: request.id,
      revision: 2,
      status: "CONFIRMED",
      appointment: input(5, "10:00"),
    });
    expect(confirmed.patientId).toBe(patient);
    expect((await session(confirmed.appointmentId!)).status).toBe("CONFIRMED");
    expect((await owner.patients.list({})).total).toBe(countBefore);
    await expect(
      owner.scheduling.processRequest({
        requestId: request.id,
        revision: 2,
        status: "CONFIRMED",
        appointment: input(5, "11:00"),
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      other.scheduling.processRequest({
        requestId: request.id,
        revision: 3,
        status: "DECLINED",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("recusa solicitações e impede confirmação de recusadas", async () => {
    const result = await owner.publicMindos.requestBooking({
      name: "Solicitante recusado",
      contactChannel: "PHONE",
      contactValue: "11998887777",
      serviceId: service,
      date: day(6),
      time: "10:00",
      consent: true,
    });
    await reception.scheduling.processRequest({
      requestId: result.requestId,
      revision: 1,
      status: "DECLINED",
    });
    await expect(
      reception.scheduling.processRequest({
        requestId: result.requestId,
        revision: 2,
        status: "CONTACTED",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("registra falta após o horário previsto e rejeita retorno de estado terminal", async () => {
    const id = await insert(
      "INSERT INTO mindos_appointments(tenantId,patientId,professionalName,unitName,serviceType,startsAt,endsAt) VALUES(?,?,?,?,?,?,?)",
      [
        tenants[0],
        patient,
        "Profissional histórico fictício",
        "Unidade histórica",
        "Serviço histórico",
        new Date(Date.now() - 86400000),
        new Date(Date.now() - 84600000),
      ]
    );
    await reception.scheduling.transition({
      appointmentId: id,
      revision: 1,
      status: "NO_SHOW",
    });
    expect((await session(id)).status).toBe("NO_SHOW");
    await expect(
      reception.scheduling.transition({
        appointmentId: id,
        revision: 2,
        status: "CONFIRMED",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("limita envios por origem mesmo com contatos diferentes e salva fuso sem reservas", async () => {
    await other.scheduling.saveTimezone({
      timezone: "UTC",
      expected: "America/Sao_Paulo",
    });
    expect((await other.scheduling.context()).clinic.timezone).toBe("UTC");
    process.env.PUBLIC_TENANT_SLUG = `${slug}-b`;
    try {
      for (let i = 0; i < 10; i++)
        await other.publicMindos.requestBooking({
          name: "Contato fictício",
          contactChannel: "EMAIL",
          contactValue: `rate-${i}@example.com`,
          serviceId: foreignService,
          date: day(2),
          time: "12:00",
          consent: true,
        });
      await expect(
        other.publicMindos.requestBooking({
          name: "Contato excedente",
          contactChannel: "EMAIL",
          contactValue: "rate-extra@example.com",
          serviceId: foreignService,
          date: day(2),
          time: "12:00",
          consent: true,
        })
      ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    } finally {
      process.env.PUBLIC_TENANT_SLUG = slug;
    }
  });
  it("bloqueia novas reservas para profissional cuja conta foi desativada", async () => {
    const accountData = await account(tenants[0], "PSYCHOLOGIST", [
      "VIEW_PATIENT_BASIC",
    ]);
    const resource = await owner.scheduling.saveConfig({
      kind: "professional",
      name: "Profissional vinculado revogado",
      userId: accountData.id,
      active: true,
    });
    await owner.scheduling.saveConfig({
      kind: "availability",
      professionalId: resource.id,
      unitId: unit,
      weekday: new Date(`${day(4)}T12:00:00Z`).getUTCDay(),
      startMinute: 0,
      endMinute: 1440,
      active: true,
    });
    await db.execute(
      "UPDATE mindos_memberships SET active=false WHERE tenantId=? AND userId=?",
      [tenants[0], accountData.id]
    );
    await expect(
      owner.scheduling.create(
        input(4, "15:00", { professionalId: resource.id })
      )
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("bloqueia troca de fuso com reservas futuras e APIs antigas de gravação", async () => {
    await expect(
      owner.scheduling.saveTimezone({
        timezone: "UTC",
        expected: "America/Sao_Paulo",
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      owner.mindos.createAppointment({
        patientId: patient,
        professionalName: "Arbitrário",
        unitName: "Arbitrária",
        serviceType: "Arbitrário",
        mode: "ONLINE",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 3600000),
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(
      owner.mindos.receptionEvent({ patientId: patient, eventType: "CHECK_IN" })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(
      owner.mindos.receptionEvent({
        patientId: patient,
        eventType: "MESSAGE_SENT",
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    const [audits] = await db.execute<RowDataPacket[]>(
      "SELECT actorUserId FROM mindos_access_audits WHERE tenantId=? AND subjectType='APPOINTMENT'",
      [tenants[0]]
    );
    expect(audits.length).toBeGreaterThan(10);
    expect(audits.every(row => userIds.includes(row.actorUserId))).toBe(true);
  });
});
