import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import mysql, {
  type Connection,
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";
import {
  uploadPrivateDocument,
  downloadPrivateDocument,
} from "./private-documents";
import {
  clinicParts,
  addCivilDays,
  appointmentInput,
} from "../shared/scheduling";
// @ts-expect-error Guard do seed JavaScript.
import { assertDemoSeedAllowed } from "./seed-safety.mjs";
type Caller = ReturnType<typeof appRouter.createCaller>;
type Account = { id: number; user: User; caller: Caller };
const pdf = Buffer.from(
  "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n"
);
describe("prontuário, documentos privados, consentimentos e portal", () => {
  let db: Connection, root: string;
  const oldRoot = process.env.PRIVATE_DOCUMENT_ROOT;
  const tenants: number[] = [],
    userIds: number[] = [];
  let owner: Account,
    foreign: Account,
    clinician: Account,
    reader: Account,
    unassigned: Account,
    reception: Account,
    portal: Account,
    secondPortal: Account;
  let patient: number,
    secondPatient: number,
    foreignPatient: number,
    professional: number,
    unit: number,
    service: number;
  const today = clinicParts(new Date(), "America/Sao_Paulo").date,
    date = addCivilDays(today, 10);
  const code = `CARE-${randomUUID().slice(0, 8)}`;
  async function insert(sql: string, values: unknown[]) {
    const [r] = await db.execute<ResultSetHeader>(sql, values);
    return r.insertId;
  }
  async function account(
    tenant: number,
    role: string,
    permissions: string[]
  ): Promise<Account> {
    const id = await insert("INSERT INTO users(openId,name) VALUES(?,?)", [
      `care-${randomUUID()}`,
      "Autor fictício",
    ]);
    userIds.push(id);
    await insert(
      "INSERT INTO mindos_memberships(tenantId,userId,role,permissionsJson) VALUES(?,?,?,?)",
      [tenant, id, role, JSON.stringify(permissions)]
    );
    const now = new Date();
    const user: User = {
      id,
      openId: `fixture-${id}`,
      name: "Autor fictício",
      email: null,
      role: "user",
      loginMethod: "test",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    };
    const ctx: TrpcContext = {
      user,
      req: { headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    };
    return { id, user, caller: appRouter.createCaller(ctx) };
  }
  const schedule = (time: string, pid = patient) =>
    appointmentInput.parse({
      patientId: pid,
      professionalId: professional,
      unitId: unit,
      serviceId: service,
      mode: "ONLINE",
      date,
      time,
    });
  beforeAll(async () => {
    assertDemoSeedAllowed({ ...process.env, ALLOW_DEMO_SEED: "true" });
    root = await mkdtemp(join(tmpdir(), "mindos-private-test-"));
    process.env.PRIVATE_DOCUMENT_ROOT = root;
    db = await mysql.createConnection(process.env.DATABASE_URL!);
    for (const label of ["A", "B"])
      tenants.push(
        await insert(
          "INSERT INTO mindos_tenants(slug,name,siteConfigJson) VALUES(?,?,'{}')",
          [`care-${randomUUID()}`, `Clínica fictícia cuidado ${label}`]
        )
      );
    owner = await account(tenants[0], "OWNER", ["ALL"]);
    foreign = await account(tenants[1], "OWNER", ["ALL"]);
    clinician = await account(tenants[0], "PSYCHOLOGIST", [
      "VIEW_PATIENT_BASIC",
      "VIEW_CLINICAL_RECORD",
      "EDIT_CLINICAL_RECORD",
      "VIEW_DOCUMENTS",
      "MANAGE_DOCUMENTS",
    ]);
    reader = await account(tenants[0], "PSYCHOLOGIST", [
      "VIEW_PATIENT_BASIC",
      "VIEW_CLINICAL_RECORD",
      "VIEW_DOCUMENTS",
    ]);
    unassigned = await account(tenants[0], "PSYCHOLOGIST", [
      "VIEW_PATIENT_BASIC",
      "VIEW_CLINICAL_RECORD",
      "EDIT_CLINICAL_RECORD",
      "VIEW_DOCUMENTS",
      "MANAGE_DOCUMENTS",
    ]);
    reception = await account(tenants[0], "RECEPTIONIST", [
      "VIEW_PATIENT_BASIC",
      "VIEW_ADMINISTRATIVE",
      "VIEW_DOCUMENTS",
      "MANAGE_DOCUMENTS",
    ]);
    portal = await account(tenants[0], "PATIENT", []);
    secondPortal = await account(tenants[0], "PATIENT", []);
    patient = (
      await owner.caller.patients.create({
        fullName: "Paciente fictício cuidado A",
        administrativeStatus: "ACTIVE",
      })
    ).id;
    secondPatient = (
      await owner.caller.patients.create({
        fullName: "Paciente fictício cuidado secundário",
        administrativeStatus: "ACTIVE",
      })
    ).id;
    foreignPatient = (
      await foreign.caller.patients.create({
        fullName: "Paciente fictício cuidado B",
      })
    ).id;
    await db.execute("UPDATE mindos_patients SET portalUserId=? WHERE id=?", [
      portal.id,
      patient,
    ]);
    await db.execute("UPDATE mindos_patients SET portalUserId=? WHERE id=?", [
      secondPortal.id,
      secondPatient,
    ]);
    for (const a of [clinician, reader])
      await owner.caller.care.assign({
        patientId: patient,
        userId: a.id,
        active: true,
      });
    professional = (
      await owner.caller.scheduling.saveConfig({
        kind: "professional",
        name: "Profissional fictício cuidado",
        active: true,
      })
    ).id;
    unit = (
      await owner.caller.scheduling.saveConfig({
        kind: "unit",
        name: "Unidade fictícia cuidado",
        active: true,
      })
    ).id;
    service = (
      await owner.caller.scheduling.saveConfig({
        kind: "service",
        name: "Serviço fictício cuidado",
        durationMinutes: 30,
        mode: "BOTH",
        publicEnabled: false,
        active: true,
      })
    ).id;
    for (let weekday = 0; weekday < 7; weekday++)
      await owner.caller.scheduling.saveConfig({
        kind: "availability",
        professionalId: professional,
        unitId: unit,
        weekday,
        startMinute: 0,
        endMinute: 1440,
        active: true,
      });
    for (const [i, tenant] of tenants.entries())
      await insert(
        "INSERT INTO transactions(tenantId,code,verticalCode,patientName,patientDocument,professionalName,title,category,subtotal,totalAmount,dueDate) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        [
          tenant,
          i ? code + "-B" : code,
          "PSYCHOLOGY_CLINIC",
          "Mesmo nome sem vínculo",
          "FICTICIO",
          "Profissional fictício",
          "Lançamento fictício",
          "TEST",
          12345,
          12345,
          new Date(),
        ]
      );
  });
  afterAll(async () => {
    if (oldRoot === undefined) delete process.env.PRIVATE_DOCUMENT_ROOT;
    else process.env.PRIVATE_DOCUMENT_ROOT = oldRoot;
    if (db) {
      try {
        for (const tenant of tenants)
          for (const table of [
            "mindos_consent_decisions",
            "mindos_consent_templates",
            "mindos_reschedule_requests",
            "mindos_clinical_versions",
            "mindos_clinical_records",
            "mindos_patient_clinicians",
            "mindos_portal_documents",
            "mindos_access_audits",
            "mindos_appointments",
            "mindos_availability",
            "mindos_professionals",
            "mindos_units",
            "mindos_services",
            "transactions",
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
    }
    if (root) await rm(root, { recursive: true, force: true });
  });
  it("exige vínculo clínico, permissão e clínica correta", async () => {
    await expect(
      unassigned.caller.care.records({ patientId: patient })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      reception.caller.care.records({ patientId: patient })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      owner.caller.care.records({ patientId: foreignPatient })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      clinician.caller.care.createRecord({
        patientId: secondPatient,
        recordType: "EVOLUTION",
        content: "Fictício",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      reader.caller.care.createRecord({
        patientId: patient,
        recordType: "EVOLUTION",
        content: "Fictício",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await owner.caller.care.assign({
      patientId: patient,
      userId: clinician.id,
      active: false,
    });
    await expect(
      clinician.caller.care.records({ patientId: patient })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await owner.caller.care.assign({
      patientId: patient,
      userId: clinician.id,
      active: true,
    });
  });
  it("preserva edições, finaliza sem sobrescrita e cria adendo com autoria própria", async () => {
    const id = await clinician.caller.care.createRecord({
      patientId: patient,
      recordType: "EVOLUTION",
      content: "Primeiro texto fictício",
    });
    await clinician.caller.care.updateRecord({
      recordId: id,
      revision: 1,
      content: "Texto fictício revisado",
      finalize: false,
    });
    let row = (
      await clinician.caller.care.records({ patientId: patient })
    ).find(r => r.id === id)!;
    expect(row.integrityStatus).toBe("VERIFIED");
    expect(row.authorUserId).toBe(clinician.id);
    let history = await clinician.caller.care.recordHistory({ recordId: id });
    expect(history).toHaveLength(2);
    expect(history[0].snapshotJson).toContain("Primeiro texto fictício");
    await clinician.caller.care.updateRecord({
      recordId: id,
      revision: 2,
      finalize: true,
    });
    await expect(
      clinician.caller.care.updateRecord({
        recordId: id,
        revision: 3,
        content: "Sobrescrita",
        finalize: false,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const ad = await owner.caller.care.createRecord({
      patientId: patient,
      recordType: "EVOLUTION",
      parentRecordId: id,
      content: "Adendo fictício da supervisão",
    });
    await owner.caller.care.updateRecord({
      recordId: ad,
      revision: 1,
      finalize: true,
    });
    row = (await owner.caller.care.records({ patientId: patient })).find(
      r => r.id === ad
    )!;
    expect(row.status).toBe("ADDENDUM");
    expect(row.parentRecordId).toBe(id);
    expect(row.authorUserId).toBe(owner.id);
    expect(
      await clinician.caller.care.recordHistory({ recordId: id })
    ).toHaveLength(3);
  });
  it("bloqueia edição de outro autor e resolve edição concorrente sem perda silenciosa", async () => {
    const id = await clinician.caller.care.createRecord({
      patientId: patient,
      recordType: "ANAMNESIS",
      content: "Rascunho fictício",
    });
    await expect(
      owner.caller.care.updateRecord({
        recordId: id,
        revision: 1,
        finalize: true,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const changes = await Promise.allSettled([
      clinician.caller.care.updateRecord({
        recordId: id,
        revision: 1,
        content: "Edição A",
        finalize: false,
      }),
      clinician.caller.care.updateRecord({
        recordId: id,
        revision: 1,
        content: "Edição B",
        finalize: false,
      }),
    ]);
    expect(changes.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (changes.find(r => r.status === "rejected") as PromiseRejectedResult)
        .reason.code
    ).toBe("CONFLICT");
  });
  it("não libera nota restrita com a permissão clínica comum", async () => {
    const id = await owner.caller.care.createRecord({
      patientId: patient,
      recordType: "RESTRICTED_NOTE",
      content: "Nota fictícia restrita",
    });
    expect(
      (await clinician.caller.care.records({ patientId: patient })).some(
        r => r.id === id
      )
    ).toBe(false);
    await expect(
      clinician.caller.care.recordHistory({ recordId: id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      clinician.caller.care.createRecord({
        patientId: patient,
        recordType: "RESTRICTED_NOTE",
        content: "Indevido",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("detecta adulteração de conteúdo, histórico e marcador de integridade", async () => {
    const id = await owner.caller.care.createRecord({
      patientId: secondPatient,
      recordType: "EVOLUTION",
      content: "Conteúdo fictício íntegro",
    });
    await db.execute(
      "UPDATE mindos_clinical_records SET content='adulterado' WHERE id=?",
      [id]
    );
    await expect(
      owner.caller.care.records({ patientId: secondPatient })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await db.execute(
      "UPDATE mindos_clinical_records SET content=? WHERE id=?",
      ["Conteúdo fictício íntegro", id]
    );
    await db.execute(
      "UPDATE mindos_clinical_records SET integrityVersion=0 WHERE id=?",
      [id]
    );
    await expect(
      owner.caller.care.records({ patientId: secondPatient })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await db.execute(
      "UPDATE mindos_clinical_records SET integrityVersion=1 WHERE id=?",
      [id]
    );
    const [versions] = await db.execute<RowDataPacket[]>(
      "SELECT * FROM mindos_clinical_versions WHERE recordId=?",
      [id]
    );
    await db.execute(
      "UPDATE mindos_clinical_versions SET snapshotJson='{}' WHERE id=?",
      [versions[0].id]
    );
    await expect(
      owner.caller.care.recordHistory({ recordId: id })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await db.execute(
      "UPDATE mindos_clinical_versions SET snapshotJson=? WHERE id=?",
      [versions[0].snapshotJson, versions[0].id]
    );
  });
  it("preserva texto Unicode extenso sem truncar conteúdo e histórico", async () => {
    const content = "漢".repeat(24000);
    const id = await owner.caller.care.createRecord({
      patientId: secondPatient,
      recordType: "GOAL",
      content,
    });
    const row = (
      await owner.caller.care.records({ patientId: secondPatient })
    ).find(r => r.id === id)!;
    expect(row.content).toBe(content);
    expect(row.integrityStatus).toBe("VERIFIED");
    const term = await owner.caller.care.saveConsent({
      code: "unicode-ficticio",
      title: "Termo fictício Unicode",
      body: content,
    });
    expect(
      (await owner.caller.care.consentTemplates()).find(t => t.id === term.id)
        ?.body
    ).toBe(content);
  });
  it("mantém legado identificado e adota rascunho sem fabricar histórico anterior", async () => {
    const id = await insert(
      "INSERT INTO mindos_clinical_records(tenantId,patientId,authorUserId,recordType,content) VALUES(?,?,?,'EVOLUTION',?)",
      [tenants[0], secondPatient, owner.id, "Legado fictício"]
    );
    expect(
      (await owner.caller.care.records({ patientId: secondPatient })).find(
        r => r.id === id
      )?.integrityStatus
    ).toBe("LEGACY_UNVERIFIED");
    await owner.caller.care.updateRecord({
      recordId: id,
      revision: 1,
      content: "Legado adotado",
      finalize: false,
    });
    const history = await owner.caller.care.recordHistory({ recordId: id });
    expect(history[0].action).toBe("LEGACY_BASELINE");
    expect(history).toHaveLength(2);
  });
  it("armazena arquivo criptografado, exige liberação e aplica isolamento no download", async () => {
    const doc = await uploadPrivateDocument(reception.user, {
      patientId: patient,
      title: "Documento fictício",
      fileName: "../ficticio.pdf",
      mimeType: "application/pdf",
      scope: "ADMINISTRATIVE",
      data: pdf,
    });
    expect((await portal.caller.care.portal()).documents).toHaveLength(0);
    const [[row]] = await db.execute<RowDataPacket[]>(
      "SELECT * FROM mindos_portal_documents WHERE id=?",
      [doc.id]
    );
    const bytes = await readFile(join(root, row.fileKey));
    expect(bytes.includes(pdf)).toBe(false);
    expect((await stat(join(root, row.fileKey))).mode & 0o777).toBe(0o600);
    await owner.caller.care.documentAccess({
      documentId: doc.id,
      revision: 1,
      action: "RELEASE",
    });
    expect(
      (await downloadPrivateDocument(portal.user, doc.id)).data.equals(pdf)
    ).toBe(true);
    await expect(
      downloadPrivateDocument(secondPortal.user, doc.id)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      downloadPrivateDocument(foreign.user, doc.id)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await owner.caller.care.documentAccess({
      documentId: doc.id,
      revision: 2,
      action: "REVOKE",
    });
    await expect(
      downloadPrivateDocument(portal.user, doc.id)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      downloadPrivateDocument(owner.user, doc.id)
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("separa documentos clínicos e detecta arquivo adulterado", async () => {
    await expect(
      uploadPrivateDocument(reception.user, {
        patientId: patient,
        title: "Clínico fictício",
        fileName: "teste.pdf",
        mimeType: "application/pdf",
        scope: "CLINICAL",
        data: pdf,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const d = await uploadPrivateDocument(clinician.user, {
      patientId: patient,
      title: "Clínico fictício",
      fileName: "teste.pdf",
      mimeType: "application/pdf",
      scope: "CLINICAL",
      data: pdf,
    });
    expect(
      (await reception.caller.care.documents({ patientId: patient })).some(
        row => row.id === d.id
      )
    ).toBe(false);
    await expect(
      downloadPrivateDocument(unassigned.user, d.id)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const [[row]] = await db.execute<RowDataPacket[]>(
      "SELECT * FROM mindos_portal_documents WHERE id=?",
      [d.id]
    );
    const file = join(root, row.fileKey),
      original = await readFile(file),
      changed = Buffer.from(original);
    changed[changed.length - 1] ^= 1;
    await writeFile(file, changed);
    await expect(
      downloadPrivateDocument(clinician.user, d.id)
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await writeFile(file, original);
  });
  it("rejeita arquivo inválido, tamanho excessivo e referência de outra clínica", async () => {
    const input = {
      patientId: patient,
      title: "Teste fictício",
      fileName: "teste.pdf",
      mimeType: "application/pdf",
      scope: "ADMINISTRATIVE" as const,
      data: Buffer.from("<html>inválido</html>"),
    };
    await expect(
      uploadPrivateDocument(owner.user, input)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      uploadPrivateDocument(owner.user, {
        ...input,
        data: Buffer.alloc(8 * 1024 * 1024 + 1),
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      uploadPrivateDocument(owner.user, {
        ...input,
        data: pdf,
        patientId: foreignPatient,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("publica termo imutável, registra decisão idempotente e conserva versão anterior", async () => {
    const saved = await owner.caller.care.saveConsent({
      code: "atendimento",
      title: "Termo fictício",
      body: "Texto fictício versão um",
    });
    let term = (await owner.caller.care.consentTemplates()).find(
      t => t.id === saved.id
    )!;
    await owner.caller.care.publishConsent({
      id: term.id,
      revision: term.revision,
    });
    await expect(
      owner.caller.care.saveConsent({
        id: term.id,
        revision: 2,
        code: term.code,
        title: "Alterado",
        body: "Indevido",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    let shown = (await portal.caller.care.portal()).consents[0];
    await expect(
      portal.caller.care.decideConsent({
        templateId: shown.id,
        bodyHash: shown.bodyHash,
        decision: "ACCEPTED",
        acknowledged: false,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const results = await Promise.all([
      portal.caller.care.decideConsent({
        templateId: shown.id,
        bodyHash: shown.bodyHash,
        decision: "ACCEPTED",
        acknowledged: true,
      }),
      portal.caller.care.decideConsent({
        templateId: shown.id,
        bodyHash: shown.bodyHash,
        decision: "ACCEPTED",
        acknowledged: true,
      }),
    ]);
    expect(results[0].id).toBe(results[1].id);
    const next = await owner.caller.care.saveConsent({
      code: "atendimento",
      title: "Termo fictício",
      body: "Texto fictício versão dois",
    });
    term = (await owner.caller.care.consentTemplates()).find(
      t => t.id === next.id
    )!;
    await owner.caller.care.publishConsent({
      id: term.id,
      revision: term.revision,
    });
    const data = await portal.caller.care.portal();
    expect(data.consents[0].version).toBe(2);
    expect(data.consentHistory).toHaveLength(1);
    expect(data.consentHistory[0].snapshotJson).toContain(
      "Texto fictício versão um"
    );
    await portal.caller.care.decideConsent({
      templateId: shown.id,
      bodyHash: shown.bodyHash,
      decision: "WITHDRAWN",
      acknowledged: true,
    });
    expect(
      (await portal.caller.care.portal()).consentHistory.map(d => d.decision)
    ).toEqual(["ACCEPTED", "WITHDRAWN"]);
  });
  it("preserva não aceite, verifica evidências e impede decisão sobre termo de outra clínica", async () => {
    const t = (await portal.caller.care.portal()).consents[0];
    await portal.caller.care.decideConsent({
      templateId: t.id,
      bodyHash: t.bodyHash,
      decision: "DECLINED",
      acknowledged: true,
    });
    const data = await portal.caller.care.portal();
    const decision = data.consentHistory.at(-1)!;
    const [[row]] = await db.execute<RowDataPacket[]>(
      "SELECT snapshotJson FROM mindos_consent_decisions WHERE id=?",
      [decision.id]
    );
    await db.execute(
      "UPDATE mindos_consent_decisions SET snapshotJson='{}' WHERE id=?",
      [decision.id]
    );
    await expect(portal.caller.care.portal()).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await db.execute(
      "UPDATE mindos_consent_decisions SET snapshotJson=? WHERE id=?",
      [row.snapshotJson, decision.id]
    );
    await expect(
      foreign.caller.care.publishConsent({ id: t.id, revision: 2 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      owner.caller.care.decideConsent({
        templateId: t.id,
        bodyHash: t.bodyHash,
        decision: "ACCEPTED",
        acknowledged: true,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(
      (await secondPortal.caller.care.portal()).consentHistory
    ).toHaveLength(0);
  });
  it("financeiro do portal depende de vínculo explícito e liberação, sem inferir por nome", async () => {
    expect((await portal.caller.care.portal()).financial).toHaveLength(0);
    await owner.caller.care.financialAccess({
      patientId: patient,
      code,
      visible: true,
    });
    let finances = (await portal.caller.care.portal()).financial;
    expect(finances).toHaveLength(1);
    expect(finances[0].totalAmount).toBe(12345);
    expect(finances[0]).not.toHaveProperty("patientDocument");
    expect((await secondPortal.caller.care.portal()).financial).toHaveLength(0);
    await expect(
      owner.caller.care.financialAccess({
        patientId: secondPatient,
        code,
        visible: true,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      owner.caller.care.financialAccess({
        patientId: patient,
        code: code + "-B",
        visible: true,
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await owner.caller.care.financialAccess({
      patientId: patient,
      code,
      visible: false,
    });
    expect((await portal.caller.care.portal()).financial).toHaveLength(0);
  });
  it("solicita reagendamento próprio, evita duplicação e aprova reserva atomicamente", async () => {
    const made = await owner.caller.scheduling.create(schedule("09:00"));
    const id = made.ids[0];
    await expect(
      secondPortal.caller.care.requestReschedule({
        appointmentId: id,
        date,
        time: "14:00",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const attempts = await Promise.allSettled([
      portal.caller.care.requestReschedule({
        appointmentId: id,
        date,
        time: "14:00",
      }),
      portal.caller.care.requestReschedule({
        appointmentId: id,
        date,
        time: "14:00",
      }),
    ]);
    expect(attempts.filter(r => r.status === "fulfilled")).toHaveLength(1);
    const request = (await owner.caller.care.rescheduleInbox())[0];
    const block = await owner.caller.scheduling.create(
      schedule("14:00", secondPatient)
    );
    await expect(
      owner.caller.care.resolveReschedule({
        id: request.id,
        revision: 1,
        approve: true,
        appointment: schedule("14:00"),
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await owner.caller.care.rescheduleInbox())[0].status).toBe(
      "PENDING"
    );
    expect(
      (await owner.caller.scheduling.list({})).items.find(s => s.id === id)
        ?.status
    ).toBe("SCHEDULED");
    await owner.caller.scheduling.transition({
      appointmentId: block.ids[0],
      revision: 1,
      status: "CANCELLED",
    });
    const result = await owner.caller.care.resolveReschedule({
      id: request.id,
      revision: 1,
      approve: true,
      appointment: schedule("14:00"),
    });
    expect(result.replacementAppointmentId).toBeTruthy();
    expect(
      (await portal.caller.care.portal()).rescheduleRequests[0].status
    ).toBe("APPROVED");
    expect(
      (await owner.caller.scheduling.list({})).items.find(s => s.id === id)
        ?.status
    ).toBe("RESCHEDULED");
  });
  it("paciente cancela pedido pendente e equipe pode recusar sem alterar sessão", async () => {
    const made = await owner.caller.scheduling.create(schedule("16:00"));
    const first = await portal.caller.care.requestReschedule({
      appointmentId: made.ids[0],
      date,
      time: "17:00",
    });
    await portal.caller.care.cancelReschedule({ id: first.id });
    const second = await portal.caller.care.requestReschedule({
      appointmentId: made.ids[0],
      date,
      time: "17:00",
    });
    await owner.caller.care.resolveReschedule({
      id: second.id,
      revision: 1,
      approve: false,
    });
    expect(
      (await owner.caller.scheduling.list({})).items.find(
        s => s.id === made.ids[0]
      )?.status
    ).toBe("SCHEDULED");
    await expect(
      portal.caller.care.cancelReschedule({ id: second.id })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("revogação da conta bloqueia imediatamente portal e operações", async () => {
    await db.execute(
      "UPDATE mindos_memberships SET active=false WHERE tenantId=? AND userId=?",
      [tenants[0], portal.id]
    );
    await expect(portal.caller.care.portal()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
