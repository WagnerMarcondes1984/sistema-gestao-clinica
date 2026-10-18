import { TRPCError } from "@trpc/server";
import { and, count, desc, eq, or, sql } from "drizzle-orm";
import {
  mindosAccessAudits,
  mindosMemberships,
  mindosPatients,
  mindosTenants,
  type MindosPatient,
  type User,
} from "../drizzle/schema";
import { assertMindosPermission, getDb, hasMindosPermission } from "./db";
import {
  normalizePatientName,
  normalizePatientPhone,
  patientInput,
  patientListInput,
  type PatientInput,
} from "../shared/patients";
import { z } from "zod";

const missing = () =>
  new TRPCError({
    code: "NOT_FOUND",
    message: "Paciente não encontrado nesta clínica",
  });
async function database() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Banco de dados indisponível",
    });
  return db;
}
export function patientView(patient: MindosPatient) {
  const { portalUserId, birthDate, ...basic } = patient;
  return {
    ...basic,
    birthDate: birthDate ? birthDate.toISOString().slice(0, 10) : "",
    hasPortalAccess: portalUserId !== null,
  };
}
export async function listPatients(
  user: User,
  input: z.infer<typeof patientListInput>
) {
  const { tenant, membership } = await assertMindosPermission(
    user.id,
    user.role,
    "VIEW_PATIENT_BASIC"
  );
  const db = await database();
  const term = input.search;
  // Escape LIKE metacharacters so names containing %, _ or ! stay literal.
  const pattern = `%${term.replace(/[!%_]/g, "!$&")}%`;
  const filter = and(
    eq(mindosPatients.tenantId, tenant.id),
    input.status === "ALL"
      ? undefined
      : eq(mindosPatients.administrativeStatus, input.status),
    term
      ? or(
          sql`convert(${mindosPatients.fullName} using utf8mb4) collate utf8mb4_0900_ai_ci like ${pattern} escape '!'`,
          sql`convert(${mindosPatients.preferredName} using utf8mb4) collate utf8mb4_0900_ai_ci like ${pattern} escape '!'`,
          sql`convert(${mindosPatients.email} using utf8mb4) collate utf8mb4_0900_ai_ci like ${pattern} escape '!'`,
          sql`convert(${mindosPatients.phone} using utf8mb4) collate utf8mb4_0900_ai_ci like ${pattern} escape '!'`,
          /^[+()\d\s.\-]+$/.test(term) &&
            normalizePatientPhone(term).length >= 3
            ? sql`locate(${normalizePatientPhone(term)}, regexp_replace(${mindosPatients.phone}, '[^0-9]', '')) > 0`
            : undefined
        )
      : undefined
  );
  const [rows, totals] = await Promise.all([
    db
      .select()
      .from(mindosPatients)
      .where(filter)
      .orderBy(mindosPatients.fullName, mindosPatients.id)
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
    db.select({ total: count() }).from(mindosPatients).where(filter),
  ]);
  return {
    items: rows.map(patientView),
    total: totals[0].total,
    page: input.page,
    pageSize: input.pageSize,
    tenantName: tenant.name,
    timezone: tenant.timezone,
    canManage: hasMindosPermission(membership, "MANAGE_PATIENTS"),
    canSchedule: hasMindosPermission(membership, "MANAGE_APPOINTMENTS"),
    canViewClinical: hasMindosPermission(membership, "VIEW_CLINICAL_RECORD"),
  };
}
export async function getPatient(user: User, patientId: number) {
  const { tenant } = await assertMindosPermission(
    user.id,
    user.role,
    "VIEW_PATIENT_BASIC"
  );
  const db = await database();
  const [patient] = await db
    .select()
    .from(mindosPatients)
    .where(
      and(
        eq(mindosPatients.tenantId, tenant.id),
        eq(mindosPatients.id, patientId)
      )
    )
    .limit(1);
  if (!patient) throw missing();
  return patientView(patient);
}
export function isDuplicatePatient(
  existing: Pick<MindosPatient, "fullName" | "birthDate" | "email" | "phone">,
  input: PatientInput
) {
  if (
    normalizePatientName(existing.fullName) !==
    normalizePatientName(input.fullName)
  )
    return false;
  const birth = existing.birthDate?.toISOString().slice(0, 10) || "";
  if (birth && input.birthDate) return birth === input.birthDate;
  return Boolean(
    (input.email && existing.email?.toLowerCase().trim() === input.email) ||
      (input.phone &&
        normalizePatientPhone(existing.phone || "") ===
          normalizePatientPhone(input.phone)) ||
      (!birth &&
        !input.birthDate &&
        !input.email &&
        !input.phone &&
        !existing.email &&
        !existing.phone)
  );
}

export async function savePatient(
  user: User,
  raw: PatientInput,
  edit?: { id: number; revision: number }
) {
  const input = patientInput.parse(raw);
  const { tenant } = await assertMindosPermission(
    user.id,
    user.role,
    "MANAGE_PATIENTS"
  );
  const db = await database();
  return db.transaction(async tx => {
    // Serializes identity checks within this clinic, including simultaneous creates.
    // Legacy rows participate without rewriting or merging any existing identity.
    const [lockedTenant] = await tx
      .select()
      .from(mindosTenants)
      .where(eq(mindosTenants.id, tenant.id))
      .for("update");
    const [membership] = await tx
      .select()
      .from(mindosMemberships)
      .where(
        and(
          eq(mindosMemberships.tenantId, tenant.id),
          eq(mindosMemberships.userId, user.id)
        )
      )
      .for("update");
    if (
      lockedTenant?.status !== "ACTIVE" ||
      !membership?.active ||
      !hasMindosPermission(membership, "MANAGE_PATIENTS")
    )
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Acesso ao cadastro revogado",
      });
    const rows = await tx
      .select()
      .from(mindosPatients)
      .where(eq(mindosPatients.tenantId, tenant.id))
      .for("update");
    const original = edit ? rows.find(p => p.id === edit.id) : undefined;
    if (edit && !original) throw missing();
    if (edit && original?.revision !== edit.revision)
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "Este cadastro foi alterado por outra pessoa. Recarregue e revise antes de salvar.",
      });
    if (rows.some(p => p.id !== edit?.id && isDuplicatePatient(p, input)))
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "Possível paciente duplicado nesta clínica. Busque pelo nome e revise o cadastro existente.",
      });
    const values = {
      ...input,
      preferredName: input.preferredName || null,
      email: input.email || null,
      phone: input.phone ? normalizePatientPhone(input.phone) : null,
      birthDate: input.birthDate
        ? new Date(`${input.birthDate}T12:00:00Z`)
        : null,
    };
    let id: number;
    if (edit) {
      id = edit.id;
      await tx
        .update(mindosPatients)
        .set({ ...values, revision: edit.revision + 1 })
        .where(
          and(eq(mindosPatients.id, id), eq(mindosPatients.tenantId, tenant.id))
        );
    } else {
      const [result] = await tx
        .insert(mindosPatients)
        .values({ ...values, tenantId: tenant.id });
      id = result.insertId;
    }
    await tx.insert(mindosAccessAudits).values({
      tenantId: tenant.id,
      actorUserId: user.id,
      subjectType: "PATIENT",
      subjectId: id,
      dataLayer: "ADMINISTRATIVE",
      action: !edit
        ? "CREATE_PATIENT"
        : original?.administrativeStatus !== input.administrativeStatus
          ? "CHANGE_PATIENT_STATUS"
          : "UPDATE_PATIENT",
      reason: "Cadastro administrativo de paciente",
    });
    const [saved] = await tx
      .select()
      .from(mindosPatients)
      .where(
        and(eq(mindosPatients.id, id), eq(mindosPatients.tenantId, tenant.id))
      );
    return patientView(saved);
  });
}

export async function patientHistory(user: User, patientId: number) {
  const patient = await getPatient(user, patientId);
  const db = await database();
  const rows = await db
    .select({
      id: mindosAccessAudits.id,
      action: mindosAccessAudits.action,
      createdAt: mindosAccessAudits.createdAt,
    })
    .from(mindosAccessAudits)
    .where(
      and(
        eq(mindosAccessAudits.tenantId, patient.tenantId),
        eq(mindosAccessAudits.subjectType, "PATIENT"),
        eq(mindosAccessAudits.subjectId, patientId),
        eq(mindosAccessAudits.dataLayer, "ADMINISTRATIVE")
      )
    )
    .orderBy(desc(mindosAccessAudits.createdAt), desc(mindosAccessAudits.id))
    .limit(20);
  return rows;
}
