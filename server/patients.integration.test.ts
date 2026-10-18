import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import mysql, {
  type Connection,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { patientInput } from "../shared/patients";
// @ts-expect-error Guard compartilhado com o seed JavaScript.
import { assertDemoSeedAllowed } from "./seed-safety.mjs";

const demo = (name: string) =>
  patientInput.parse({
    fullName: name,
    email: "ficticio@example.com",
    phone: "(11) 99999-1234",
    birthDate: "1990-05-20",
    administrativeStatus: "ACTIVE",
  });
describe("pacientes com MySQL e duas clínicas", () => {
  let db: Connection;
  const tenants: number[] = [],
    users: number[] = [];
  type Caller = ReturnType<typeof appRouter.createCaller>;
  let owner: Caller,
    other: Caller,
    reception: Caller,
    viewer: Caller,
    portal: Caller;
  let ownerId: number, receptionId: number;
  async function insert(sql: string, values: unknown[]) {
    const [r] = await db.execute<ResultSetHeader>(sql, values);
    return r.insertId;
  }
  async function account(tenant: number, role: string, permissions: string[]) {
    const now = new Date();
    const id = await insert("INSERT INTO users (openId, name) VALUES (?, ?)", [
      `patients-${randomUUID()}`,
      "Conta fictícia",
    ]);
    users.push(id);
    await insert(
      "INSERT INTO mindos_memberships (tenantId, userId, role, permissionsJson) VALUES (?, ?, ?, ?)",
      [tenant, id, role, JSON.stringify(permissions)]
    );
    const ctx: TrpcContext = {
      user: {
        id,
        openId: `patients-${id}`,
        name: "Conta fictícia",
        email: null,
        role: "user",
        loginMethod: "test",
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now,
      },
      req: { headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    return { id, caller: appRouter.createCaller(ctx) };
  }
  beforeAll(async () => {
    assertDemoSeedAllowed({ ...process.env, ALLOW_DEMO_SEED: "true" });
    db = await mysql.createConnection(process.env.DATABASE_URL!);
    for (const label of ["A", "B"])
      tenants.push(
        await insert(
          "INSERT INTO mindos_tenants (slug, name, siteConfigJson) VALUES (?, ?, '{}')",
          [`patients-${randomUUID()}`, `Pacientes fictícios ${label}`]
        )
      );
    const a = await account(tenants[0], "OWNER", ["ALL"]);
    owner = a.caller;
    ownerId = a.id;
    other = (await account(tenants[1], "OWNER", ["ALL"])).caller;
    const r = await account(tenants[0], "RECEPTIONIST", [
      "VIEW_PATIENT_BASIC",
      "MANAGE_PATIENTS",
      "MANAGE_APPOINTMENTS",
    ]);
    reception = r.caller;
    receptionId = r.id;
    viewer = (await account(tenants[0], "VIEWER", ["VIEW_PATIENT_BASIC"]))
      .caller;
    portal = (await account(tenants[0], "PATIENT", [])).caller;
  });
  afterAll(async () => {
    if (!db) return;
    try {
      for (const tenant of tenants)
        for (const table of [
          "mindos_appointments",
          "mindos_clinical_records",
          "mindos_access_audits",
          "mindos_memberships",
          "mindos_patients",
        ])
          await db.execute(`DELETE FROM ${table} WHERE tenantId = ?`, [tenant]);
      for (const id of users)
        await db.execute("DELETE FROM users WHERE id = ?", [id]);
      for (const id of tenants)
        await db.execute("DELETE FROM mindos_tenants WHERE id = ?", [id]);
    } finally {
      await db.end();
    }
  });
  it("cria, consulta, busca, edita, inativa e reativa com auditoria real", async () => {
    const created = await reception.patients.create(
      demo("Pessoa fictícia completa")
    );
    expect(created.phone).toBe("11999991234");
    expect(created.birthDate).toBe("1990-05-20");
    expect(created).not.toHaveProperty("portalUserId");
    const found = await reception.patients.list({
      search: "pessoa ficticia completa",
    });
    expect(found.items.map(p => p.id)).toContain(created.id);
    expect(
      (await reception.patients.list({ search: "(11) 99999" })).total
    ).toBeGreaterThan(0);
    const saved = await reception.patients.update({
      patientId: created.id,
      revision: created.revision,
      data: {
        ...demo(created.fullName),
        preferredName: "Nome de preferência",
        administrativeStatus: "INACTIVE",
      },
    });
    expect(saved.revision).toBe(2);
    expect(
      (await reception.patients.list({ status: "INACTIVE" })).items.some(
        p => p.id === created.id
      )
    ).toBe(true);
    await expect(
      reception.mindos.createAppointment({
        patientId: created.id,
        professionalName: "Profissional fictício",
        unitName: "Unidade fictícia",
        serviceType: "Serviço fictício",
        mode: "ONLINE",
        startsAt: new Date("2027-01-01T15:00:00Z"),
        endsAt: new Date("2027-01-01T16:00:00Z"),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const active = await reception.patients.update({
      patientId: created.id,
      revision: 2,
      data: demo(created.fullName),
    });
    expect(active.administrativeStatus).toBe("ACTIVE");
    const [audits] = await db.execute<RowDataPacket[]>(
      "SELECT actorUserId, action FROM mindos_access_audits WHERE tenantId = ? AND subjectType = 'PATIENT' AND subjectId = ?",
      [tenants[0], created.id]
    );
    expect(audits).toHaveLength(3);
    expect(audits.every(row => row.actorUserId === receptionId)).toBe(true);
    expect(
      (await reception.patients.history({ patientId: created.id })).map(
        a => a.action
      )
    ).toContain("CHANGE_PATIENT_STATUS");
  });
  it("isola listagem, edição, detalhes, histórico e prontuário de outra clínica", async () => {
    const foreign = await other.patients.create(
      demo("Pessoa exclusiva clínica B")
    );
    expect(
      (await owner.patients.list({ search: foreign.fullName })).total
    ).toBe(0);
    for (const call of [
      () => owner.patients.get({ patientId: foreign.id }),
      () => owner.patients.history({ patientId: foreign.id }),
      () => owner.mindos.patient360({ patientId: foreign.id }),
      () => owner.mindos.clinicalRecords({ patientId: foreign.id }),
      () =>
        owner.patients.update({
          patientId: foreign.id,
          revision: 1,
          data: demo("Tentativa cruzada"),
        }),
    ])
      await expect(call()).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await other.patients.get({ patientId: foreign.id })).fullName).toBe(
      foreign.fullName
    );
  });
  it("recusa escrita de consulta básica, acesso do portal e prontuário da recepção", async () => {
    await expect(
      viewer.patients.create(demo("Tentativa sem permissão"))
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(portal.patients.list({})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect((await viewer.patients.list({})).canManage).toBe(false);
    await expect(
      reception.mindos.clinicalRecords({ patientId: 1 })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("duas criações simultâneas não duplicam a identidade", async () => {
    const input = demo("Nome fictício concorrente");
    const attempts = await Promise.allSettled([
      owner.patients.create(input),
      owner.patients.create({
        ...input,
        fullName: "NÓME  FICTÍCIO CONCORRENTE",
      }),
    ]);
    expect(attempts.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter(r => r.status === "rejected")).toHaveLength(1);
    const failed = attempts.find(
      r => r.status === "rejected"
    ) as PromiseRejectedResult;
    expect(failed.reason.code).toBe("CONFLICT");
    expect(
      (await owner.patients.list({ search: "nome ficticio concorrente" })).total
    ).toBe(1);
    await expect(other.patients.create(input)).resolves.toHaveProperty(
      "tenantId",
      tenants[1]
    );
  });
  it("não sobrescreve edição concorrente ou cria duplicidade por edição", async () => {
    const original = await owner.patients.create(
      demo("Pessoa edição concorrente")
    );
    const a = demo(original.fullName);
    const attempts = await Promise.allSettled([
      owner.patients.update({
        patientId: original.id,
        revision: 1,
        data: { ...a, preferredName: "Uma edição" },
      }),
      owner.patients.update({
        patientId: original.id,
        revision: 1,
        data: { ...a, preferredName: "Outra edição" },
      }),
    ]);
    expect(attempts.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const another = await owner.patients.create(demo("Pessoa distinta edição"));
    await expect(
      owner.patients.update({ patientId: another.id, revision: 1, data: a })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("preserva homônimos de outra data e contatos familiares compartilhados", async () => {
    await owner.patients.create(demo("Pessoa homônima fictícia"));
    await expect(
      owner.patients.create({
        ...demo("Pessoa homônima fictícia"),
        birthDate: "1991-05-20",
      })
    ).resolves.toHaveProperty("id");
    await expect(
      owner.patients.create(demo("Familiar de pessoa homônima"))
    ).resolves.toHaveProperty("id");
  });
  it("pagina, filtra e trata curingas como texto literal", async () => {
    const first = await owner.patients.list({ pageSize: 2 });
    const second = await owner.patients.list({ pageSize: 2, page: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.total).toBeGreaterThan(2);
    expect(
      second.items.some(row => first.items.some(p => p.id === row.id))
    ).toBe(false);
    expect((await owner.patients.list({ search: "%" })).total).toBe(0);
    expect(
      (await owner.patients.list({ search: "não existente xyz" })).items
    ).toHaveLength(0);
  });
  it("seleciona a pessoa correta no 360° e bloqueia alterações após revogação", async () => {
    const patient = await owner.patients.create(demo("Pessoa seleção real"));
    const selected = await owner.mindos.patient360({ patientId: patient.id });
    expect(selected.patient.id).toBe(patient.id);
    expect(selected.patient).not.toHaveProperty("portalUserId");
    expect(
      (await viewer.mindos.patient360({ patientId: patient.id })).appointments
    ).toEqual([]);
    await db.execute(
      "UPDATE mindos_memberships SET permissionsJson = ? WHERE tenantId = ? AND userId = ?",
      ['["VIEW_PATIENT_BASIC"]', tenants[0], receptionId]
    );
    await expect(
      reception.patients.update({
        patientId: patient.id,
        revision: 1,
        data: demo("Tentativa revogada"),
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
