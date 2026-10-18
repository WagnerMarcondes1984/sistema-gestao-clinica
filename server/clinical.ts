import { TRPCError } from "@trpc/server";
import { and, eq, desc, ne } from "drizzle-orm";
import {
  mindosClinicalRecords,
  mindosClinicalVersions,
  mindosAppointments,
  mindosMemberships,
  mindosPatientClinicians,
  users,
  type User,
} from "../drizzle/schema";
import { withClinic, type Tx, type Clinic } from "./scheduling";
import { hasMindosPermission } from "./db";
import {
  clinicalPatient,
  patientInClinic,
  missing,
  denied,
  seal,
  sameHash,
  careAudit,
} from "./care-access";

type RecordRow = typeof mindosClinicalRecords.$inferSelect;
const permission = (type: string, write = false) =>
  type === "RESTRICTED_NOTE"
    ? write
      ? "EDIT_RESTRICTED_NOTE"
      : "VIEW_RESTRICTED_NOTE"
    : write
      ? "EDIT_CLINICAL_RECORD"
      : "VIEW_CLINICAL_RECORD";
const recordPayload = (r: RecordRow) => ({
  id: r.id,
  tenantId: r.tenantId,
  patientId: r.patientId,
  appointmentId: r.appointmentId,
  authorUserId: r.authorUserId,
  recordType: r.recordType,
  status: r.status,
  content: r.content,
  version: r.version,
  revision: r.revision,
  parentRecordId: r.parentRecordId,
  integrityVersion: r.integrityVersion,
  finalizedAt: r.finalizedAt?.toISOString() || null,
  createdAt: r.createdAt.toISOString(),
});
async function appendVersion(
  tx: Tx,
  row: RecordRow,
  actor: number,
  action: string,
  previousHash: string | null
) {
  const snapshotJson = JSON.stringify(recordPayload(row));
  const integrityHash = seal("clinical-version", [
    row.tenantId,
    row.id,
    row.revision,
    snapshotJson,
    previousHash,
    actor,
    action,
  ]);
  await tx.insert(mindosClinicalVersions).values({
    tenantId: row.tenantId,
    recordId: row.id,
    revision: row.revision,
    snapshotJson,
    integrityHash,
    previousHash,
    actorUserId: actor,
    action,
  });
  await tx
    .update(mindosClinicalRecords)
    .set({ integrityHash, integrityVersion: 1 })
    .where(eq(mindosClinicalRecords.id, row.id));
  return integrityHash;
}
async function verifyRecord(tx: Tx, row: RecordRow) {
  if (row.integrityVersion === 0) {
    const [known] = await tx
      .select({ id: mindosClinicalVersions.id })
      .from(mindosClinicalVersions)
      .where(
        and(
          eq(mindosClinicalVersions.tenantId, row.tenantId),
          eq(mindosClinicalVersions.recordId, row.id)
        )
      )
      .limit(1);
    if (known)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Versões existentes com marcador de integridade inválido",
      });
    return "LEGACY_UNVERIFIED" as const;
  }
  const versions = await tx
    .select()
    .from(mindosClinicalVersions)
    .where(
      and(
        eq(mindosClinicalVersions.tenantId, row.tenantId),
        eq(mindosClinicalVersions.recordId, row.id)
      )
    )
    .orderBy(mindosClinicalVersions.revision);
  let previous: string | null = null;
  let revision = 0;
  for (const v of versions) {
    if (
      v.revision !== ++revision ||
      v.previousHash !== previous ||
      !sameHash(
        v.integrityHash,
        seal("clinical-version", [
          row.tenantId,
          row.id,
          v.revision,
          v.snapshotJson,
          v.previousHash,
          v.actorUserId,
          v.action,
        ])
      )
    )
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "Falha de integridade no histórico clínico. Registro bloqueado para revisão.",
      });
    previous = v.integrityHash;
  }
  if (
    revision !== row.revision ||
    !previous ||
    !row.integrityHash ||
    !sameHash(previous, row.integrityHash) ||
    versions.at(-1)?.snapshotJson !== JSON.stringify(recordPayload(row))
  )
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "Falha de integridade no registro clínico. Registro bloqueado para revisão.",
    });
  return "VERIFIED" as const;
}
export async function clinicalCapabilities(user: User, patientId: number) {
  return withClinic(user, "VIEW_CLINICAL_RECORD", async (tx, clinic) => {
    const { member } = await clinicalPatient(
      tx,
      clinic,
      user,
      patientId,
      "VIEW_CLINICAL_RECORD"
    );
    return {
      canWrite: hasMindosPermission(member, "EDIT_CLINICAL_RECORD"),
      canWriteRestricted:
        hasMindosPermission(member, "EDIT_CLINICAL_RECORD") &&
        hasMindosPermission(member, "EDIT_RESTRICTED_NOTE"),
    };
  });
}
export async function listClinical(user: User, patientId: number) {
  return withClinic(user, "VIEW_CLINICAL_RECORD", async (tx, clinic) => {
    const { member } = await clinicalPatient(
      tx,
      clinic,
      user,
      patientId,
      "VIEW_CLINICAL_RECORD"
    );
    const rows = await tx
      .select()
      .from(mindosClinicalRecords)
      .where(
        and(
          eq(mindosClinicalRecords.tenantId, clinic.id),
          eq(mindosClinicalRecords.patientId, patientId),
          hasMindosPermission(member, "VIEW_RESTRICTED_NOTE")
            ? undefined
            : ne(mindosClinicalRecords.recordType, "RESTRICTED_NOTE")
        )
      )
      .orderBy(
        desc(mindosClinicalRecords.createdAt),
        desc(mindosClinicalRecords.id)
      );
    const authors = await tx
      .select({ id: users.id, name: users.name })
      .from(users)
      .innerJoin(mindosMemberships, eq(users.id, mindosMemberships.userId))
      .where(eq(mindosMemberships.tenantId, clinic.id));
    const authorNames = new Map(authors.map(a => [a.id, a.name]));
    const result = [];
    for (const row of rows) {
      const integrityStatus = await verifyRecord(tx, row);
      result.push({
        ...row,
        authorName: authorNames.get(row.authorUserId) || "Autor legado",
        integrityStatus,
        canEdit:
          row.status === "DRAFT" &&
          row.authorUserId === user.id &&
          hasMindosPermission(member, permission(row.recordType, true)),
        canAddendum:
          row.status !== "DRAFT" &&
          hasMindosPermission(member, permission(row.recordType, true)),
      });
    }
    await careAudit(
      tx,
      clinic.id,
      user.id,
      "PATIENT",
      patientId,
      "VIEW_CLINICAL_RECORD",
      "CLINICAL"
    );
    if (rows.some(r => r.recordType === "RESTRICTED_NOTE"))
      await careAudit(
        tx,
        clinic.id,
        user.id,
        "PATIENT",
        patientId,
        "VIEW_RESTRICTED_NOTE",
        "HIGHLY_RESTRICTED_CLINICAL"
      );
    return result;
  });
}
export type RecordCreate = {
  patientId: number;
  appointmentId?: number;
  recordType: RecordRow["recordType"];
  content: string;
  parentRecordId?: number;
};
export async function createClinical(user: User, input: RecordCreate) {
  return withClinic(
    user,
    permission(input.recordType, true),
    async (tx, clinic) => {
      await clinicalPatient(
        tx,
        clinic,
        user,
        input.patientId,
        permission(input.recordType, true)
      );
      if (input.content.trim().length < 1 || input.content.length > 30000)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Conteúdo deve ter entre 1 e 30.000 caracteres",
        });
      if (input.appointmentId) {
        const [a] = await tx
          .select()
          .from(mindosAppointments)
          .where(
            and(
              eq(mindosAppointments.tenantId, clinic.id),
              eq(mindosAppointments.id, input.appointmentId),
              eq(mindosAppointments.patientId, input.patientId)
            )
          );
        if (!a)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Sessão não pertence ao paciente nesta clínica",
          });
      }
      if (input.parentRecordId) {
        const [parent] = await tx
          .select()
          .from(mindosClinicalRecords)
          .where(
            and(
              eq(mindosClinicalRecords.tenantId, clinic.id),
              eq(mindosClinicalRecords.id, input.parentRecordId),
              eq(mindosClinicalRecords.patientId, input.patientId)
            )
          )
          .for("update");
        if (!parent) return missing();
        await clinicalPatient(
          tx,
          clinic,
          user,
          input.patientId,
          permission(parent.recordType)
        );
        if (parent.status === "DRAFT" || parent.recordType !== input.recordType)
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Adendo exige registro finalizado do mesmo tipo",
          });
        await verifyRecord(tx, parent);
      }
      const [r] = await tx.insert(mindosClinicalRecords).values({
        tenantId: clinic.id,
        patientId: input.patientId,
        appointmentId: input.appointmentId || null,
        parentRecordId: input.parentRecordId || null,
        authorUserId: user.id,
        recordType: input.recordType,
        content: input.content.trim(),
        status: "DRAFT",
        integrityVersion: 1,
      });
      const [row] = await tx
        .select()
        .from(mindosClinicalRecords)
        .where(eq(mindosClinicalRecords.id, r.insertId));
      await appendVersion(
        tx,
        row,
        user.id,
        input.parentRecordId ? "CREATE_ADDENDUM" : "CREATE",
        null
      );
      await careAudit(
        tx,
        clinic.id,
        user.id,
        "CLINICAL_RECORD",
        row.id,
        "CREATE_CLINICAL_RECORD",
        row.recordType === "RESTRICTED_NOTE"
          ? "HIGHLY_RESTRICTED_CLINICAL"
          : "CLINICAL"
      );
      return row.id;
    }
  );
}
export async function updateClinical(
  user: User,
  input: {
    recordId: number;
    revision: number;
    content?: string;
    finalize: boolean;
  }
) {
  return withClinic(user, "EDIT_CLINICAL_RECORD", async (tx, clinic) => {
    let [row] = await tx
      .select()
      .from(mindosClinicalRecords)
      .where(
        and(
          eq(mindosClinicalRecords.tenantId, clinic.id),
          eq(mindosClinicalRecords.id, input.recordId)
        )
      )
      .for("update");
    if (!row) return missing();
    await clinicalPatient(
      tx,
      clinic,
      user,
      row.patientId,
      permission(row.recordType, true)
    );
    if (row.authorUserId !== user.id)
      return denied("Somente o autor pode editar ou finalizar este rascunho");
    if (row.revision !== input.revision)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Rascunho alterado. Recarregue antes de salvar.",
      });
    if (row.status !== "DRAFT")
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Registro finalizado não pode ser sobrescrito. Crie um adendo.",
      });
    await verifyRecord(tx, row);
    let previous = row.integrityHash;
    if (row.integrityVersion === 0) {
      row = { ...row, integrityVersion: 1 };
      previous = await appendVersion(tx, row, user.id, "LEGACY_BASELINE", null);
    }
    const content =
      input.content === undefined ? row.content : input.content.trim();
    if (!content || content.length > 30000)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Conteúdo inválido",
      });
    const next = {
      ...row,
      content,
      revision: row.revision + 1,
      version: row.version + 1,
      status: input.finalize
        ? ((row.parentRecordId
            ? "ADDENDUM"
            : "FINALIZED") as RecordRow["status"])
        : row.status,
      finalizedAt: input.finalize
        ? new Date(Math.floor(Date.now() / 1000) * 1000)
        : null,
      integrityVersion: 1,
    };
    await tx
      .update(mindosClinicalRecords)
      .set({
        content: next.content,
        revision: next.revision,
        version: next.version,
        status: next.status,
        finalizedAt: next.finalizedAt,
        integrityVersion: 1,
      })
      .where(eq(mindosClinicalRecords.id, row.id));
    await appendVersion(
      tx,
      next,
      user.id,
      input.finalize ? "FINALIZE" : "EDIT",
      previous
    );
    await careAudit(
      tx,
      clinic.id,
      user.id,
      "CLINICAL_RECORD",
      row.id,
      input.finalize ? "FINALIZE_CLINICAL_RECORD" : "EDIT_CLINICAL_RECORD",
      row.recordType === "RESTRICTED_NOTE"
        ? "HIGHLY_RESTRICTED_CLINICAL"
        : "CLINICAL"
    );
    return { id: row.id, revision: next.revision };
  });
}
export async function clinicalHistory(user: User, recordId: number) {
  return withClinic(user, "VIEW_CLINICAL_RECORD", async (tx, clinic) => {
    const [row] = await tx
      .select()
      .from(mindosClinicalRecords)
      .where(
        and(
          eq(mindosClinicalRecords.tenantId, clinic.id),
          eq(mindosClinicalRecords.id, recordId)
        )
      );
    if (!row) return missing();
    await clinicalPatient(
      tx,
      clinic,
      user,
      row.patientId,
      permission(row.recordType)
    );
    await verifyRecord(tx, row);
    await careAudit(
      tx,
      clinic.id,
      user.id,
      "CLINICAL_RECORD",
      row.id,
      "VIEW_CLINICAL_HISTORY",
      row.recordType === "RESTRICTED_NOTE"
        ? "HIGHLY_RESTRICTED_CLINICAL"
        : "CLINICAL"
    );
    return tx
      .select()
      .from(mindosClinicalVersions)
      .where(
        and(
          eq(mindosClinicalVersions.tenantId, clinic.id),
          eq(mindosClinicalVersions.recordId, recordId)
        )
      )
      .orderBy(mindosClinicalVersions.revision);
  });
}
export async function patientAssignments(user: User, patientId: number) {
  return withClinic(user, "MANAGE_TEAM", async (tx, clinic) => {
    await patientInClinic(tx, clinic.id, patientId);
    const candidates = await tx
      .select({
        userId: users.id,
        name: users.name,
        role: mindosMemberships.role,
        active: mindosMemberships.active,
      })
      .from(users)
      .innerJoin(mindosMemberships, eq(users.id, mindosMemberships.userId))
      .where(eq(mindosMemberships.tenantId, clinic.id));
    const links = await tx
      .select()
      .from(mindosPatientClinicians)
      .where(
        and(
          eq(mindosPatientClinicians.tenantId, clinic.id),
          eq(mindosPatientClinicians.patientId, patientId)
        )
      );
    return candidates
      .filter(m => m.role === "PSYCHOLOGIST")
      .map(c => ({
        ...c,
        assigned: links.some(l => l.userId === c.userId && l.active),
      }));
  });
}
export async function assignPatient(
  user: User,
  input: { patientId: number; userId: number; active: boolean }
) {
  return withClinic(user, "MANAGE_TEAM", async (tx, clinic) => {
    await patientInClinic(tx, clinic.id, input.patientId);
    const [member] = await tx
      .select()
      .from(mindosMemberships)
      .where(
        and(
          eq(mindosMemberships.tenantId, clinic.id),
          eq(mindosMemberships.userId, input.userId)
        )
      );
    if (
      !member ||
      member.role !== "PSYCHOLOGIST" ||
      (input.active && !member.active)
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Selecione psicólogo com associação ativa nesta clínica",
      });
    await tx
      .insert(mindosPatientClinicians)
      .values({
        tenantId: clinic.id,
        patientId: input.patientId,
        userId: input.userId,
        active: input.active,
        assignedByUserId: user.id,
      })
      .onDuplicateKeyUpdate({
        set: { active: input.active, assignedByUserId: user.id },
      });
    await careAudit(
      tx,
      clinic.id,
      user.id,
      "PATIENT",
      input.patientId,
      input.active ? "ASSIGN_CLINICIAN" : "REVOKE_CLINICIAN",
      "CLINICAL"
    );
    return true;
  });
}
