import { createHmac, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import {
  mindosPatients,
  mindosMemberships,
  mindosPatientClinicians,
  mindosTenants,
  mindosAccessAudits,
  type User,
} from "../drizzle/schema";
import { getDb, ensureMindosTenantForUser, hasMindosPermission } from "./db";
import type { Tx, Clinic } from "./scheduling";
export const missing = (): never => {
  throw new TRPCError({
    code: "NOT_FOUND",
    message: "Registro não encontrado nesta clínica",
  });
};
export const denied = (
  message = "Acesso não autorizado a este paciente"
): never => {
  throw new TRPCError({ code: "FORBIDDEN", message });
};
export async function database() {
  const db = await getDb();
  if (!db)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Banco indisponível",
    });
  return db;
}
export function integrityKey() {
  const key = process.env.CLINICAL_INTEGRITY_SECRET;
  if (!key || key.length < 32)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Configure o segredo de integridade clínica no servidor",
    });
  return key;
}
export function seal(namespace: string, payload: unknown) {
  return createHmac("sha256", integrityKey())
    .update(namespace + ":" + JSON.stringify(payload))
    .digest("hex");
}
export function sameHash(a: string, b: string) {
  return (
    /^[a-f0-9]{64}$/.test(a) &&
    /^[a-f0-9]{64}$/.test(b) &&
    timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"))
  );
}
export async function careAudit(
  tx: Tx,
  tenantId: number,
  userId: number,
  subjectType: string,
  subjectId: number,
  action: string,
  dataLayer:
    | "ADMINISTRATIVE"
    | "CLINICAL"
    | "HIGHLY_RESTRICTED_CLINICAL"
    | "FINANCIAL" = "ADMINISTRATIVE"
) {
  await tx
    .insert(mindosAccessAudits)
    .values({
      tenantId,
      actorUserId: userId,
      subjectType,
      subjectId,
      action,
      dataLayer,
      reason: "Operação autenticada de cuidado e portal",
    });
}
export async function patientInClinic(
  tx: Tx,
  tenantId: number,
  patientId: number
) {
  const [patient] = await tx
    .select()
    .from(mindosPatients)
    .where(
      and(
        eq(mindosPatients.tenantId, tenantId),
        eq(mindosPatients.id, patientId)
      )
    )
    .for("update");
  if (!patient) return missing();
  return patient;
}
export async function clinicalPatient(
  tx: Tx,
  clinic: Clinic,
  user: User,
  patientId: number,
  permission: string
) {
  const patient = await patientInClinic(tx, clinic.id, patientId);
  const [member] = await tx
    .select()
    .from(mindosMemberships)
    .where(
      and(
        eq(mindosMemberships.tenantId, clinic.id),
        eq(mindosMemberships.userId, user.id),
        eq(mindosMemberships.active, true)
      )
    );
  if (!member || !hasMindosPermission(member, permission)) return denied();
  if (!["OWNER", "CLINIC_ADMIN", "SUPER_ADMIN"].includes(member.role)) {
    if (member.role !== "PSYCHOLOGIST") return denied();
    const [assignment] = await tx
      .select()
      .from(mindosPatientClinicians)
      .where(
        and(
          eq(mindosPatientClinicians.tenantId, clinic.id),
          eq(mindosPatientClinicians.patientId, patientId),
          eq(mindosPatientClinicians.userId, user.id),
          eq(mindosPatientClinicians.active, true)
        )
      );
    if (!assignment)
      return denied("Profissional sem vínculo clínico ativo com este paciente");
  }
  return { patient, member };
}
export async function withPortal<T>(
  user: User,
  action: (
    tx: Tx,
    clinic: Clinic,
    patient: typeof mindosPatients.$inferSelect
  ) => Promise<T>
) {
  const { tenant } = await ensureMindosTenantForUser(user.id, user.role);
  const db = await database();
  return db.transaction(async tx => {
    const [clinic] = await tx
      .select()
      .from(mindosTenants)
      .where(eq(mindosTenants.id, tenant.id))
      .for("update");
    const [member] = await tx
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
      clinic?.status !== "ACTIVE" ||
      !member?.active ||
      member.role !== "PATIENT"
    )
      return denied("Portal exclusivo do paciente vinculado");
    const [patient] = await tx
      .select()
      .from(mindosPatients)
      .where(
        and(
          eq(mindosPatients.tenantId, clinic.id),
          eq(mindosPatients.portalUserId, user.id)
        )
      )
      .for("update");
    if (!patient) return denied("Conta sem paciente vinculado");
    return action(tx, clinic, patient);
  });
}
