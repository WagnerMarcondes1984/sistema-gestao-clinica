import { TRPCError } from "@trpc/server";
import { and, eq, desc, ne } from "drizzle-orm";
import {
  mindosConsentTemplates,
  mindosConsentDecisions,
  mindosPortalDocuments,
  mindosAppointments,
  mindosRescheduleRequests,
  transactions,
  type User,
} from "../drizzle/schema";
import { withClinic, rescheduleInTransaction, type Tx } from "./scheduling";
import {
  withPortal,
  patientInClinic,
  missing,
  seal,
  sameHash,
  careAudit,
} from "./care-access";
import {
  clinicParts,
  civilToInstant,
  addCivilDays,
  type AppointmentInput,
} from "../shared/scheduling";

const templatePayload = (t: typeof mindosConsentTemplates.$inferSelect) => [
  t.id,
  t.tenantId,
  t.code,
  t.version,
  t.title,
  t.body,
];
const templateHash = (t: typeof mindosConsentTemplates.$inferSelect) =>
  seal("consent-template", templatePayload(t));
function verifyTemplate(t: typeof mindosConsentTemplates.$inferSelect) {
  if (!sameHash(templateHash(t), t.bodyHash))
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "Falha de integridade do termo. Conteúdo bloqueado para revisão.",
    });
}
export async function consentTemplates(user: User) {
  return withClinic(user, "MANAGE_TEAM", async (tx, clinic) => {
    const rows = await tx
      .select()
      .from(mindosConsentTemplates)
      .where(eq(mindosConsentTemplates.tenantId, clinic.id))
      .orderBy(desc(mindosConsentTemplates.id));
    rows.forEach(verifyTemplate);
    return rows;
  });
}
export async function saveConsent(
  user: User,
  input: {
    id?: number;
    revision?: number;
    code: string;
    title: string;
    body: string;
  }
) {
  return withClinic(user, "MANAGE_TEAM", async (tx, clinic) => {
    const rows = await tx
      .select()
      .from(mindosConsentTemplates)
      .where(
        and(
          eq(mindosConsentTemplates.tenantId, clinic.id),
          eq(mindosConsentTemplates.code, input.code)
        )
      )
      .for("update");
    let id = input.id || 0;
    if (input.id) {
      const row = rows.find(t => t.id === input.id);
      if (!row) return missing();
      verifyTemplate(row);
      if (row.status !== "DRAFT")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Termo publicado é imutável. Crie uma nova versão.",
        });
      if (row.revision !== input.revision)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Rascunho alterado. Recarregue.",
        });
      await tx
        .update(mindosConsentTemplates)
        .set({
          title: input.title,
          body: input.body,
          revision: row.revision + 1,
        })
        .where(eq(mindosConsentTemplates.id, row.id));
    } else {
      const version = Math.max(0, ...rows.map(r => r.version)) + 1;
      const [r] = await tx.insert(mindosConsentTemplates).values({
        tenantId: clinic.id,
        code: input.code,
        version,
        title: input.title,
        body: input.body,
        bodyHash: "",
        createdByUserId: user.id,
      });
      id = r.insertId;
    }
    const [row] = await tx
      .select()
      .from(mindosConsentTemplates)
      .where(eq(mindosConsentTemplates.id, id));
    await tx
      .update(mindosConsentTemplates)
      .set({ bodyHash: templateHash(row) })
      .where(eq(mindosConsentTemplates.id, id));
    await careAudit(
      tx,
      clinic.id,
      user.id,
      "CONSENT_TEMPLATE",
      id,
      "SAVE_CONSENT_DRAFT"
    );
    return { id };
  });
}
export async function publishConsent(
  user: User,
  input: { id: number; revision: number; retire?: boolean }
) {
  return withClinic(user, "MANAGE_TEAM", async (tx, clinic) => {
    const [row] = await tx
      .select()
      .from(mindosConsentTemplates)
      .where(
        and(
          eq(mindosConsentTemplates.tenantId, clinic.id),
          eq(mindosConsentTemplates.id, input.id)
        )
      )
      .for("update");
    if (!row) return missing();
    verifyTemplate(row);
    if (row.revision !== input.revision)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Termo alterado. Recarregue.",
      });
    if (input.retire) {
      if (row.status !== "PUBLISHED")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Somente termo publicado pode ser retirado",
        });
      await tx
        .update(mindosConsentTemplates)
        .set({ status: "RETIRED", revision: row.revision + 1 })
        .where(eq(mindosConsentTemplates.id, row.id));
    } else {
      if (row.status !== "DRAFT")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Apenas rascunho pode ser publicado",
        });
      const newer = await tx
        .select()
        .from(mindosConsentTemplates)
        .where(
          and(
            eq(mindosConsentTemplates.tenantId, clinic.id),
            eq(mindosConsentTemplates.code, row.code)
          )
        );
      if (newer.some(t => t.status === "PUBLISHED" && t.version > row.version))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Já existe versão mais nova publicada",
        });
      await tx
        .update(mindosConsentTemplates)
        .set({ status: "RETIRED" })
        .where(
          and(
            eq(mindosConsentTemplates.tenantId, clinic.id),
            eq(mindosConsentTemplates.code, row.code),
            eq(mindosConsentTemplates.status, "PUBLISHED")
          )
        );
      await tx
        .update(mindosConsentTemplates)
        .set({
          status: "PUBLISHED",
          revision: row.revision + 1,
          publishedByUserId: user.id,
          publishedAt: new Date(),
        })
        .where(eq(mindosConsentTemplates.id, row.id));
    }
    await careAudit(
      tx,
      clinic.id,
      user.id,
      "CONSENT_TEMPLATE",
      row.id,
      input.retire ? "RETIRE_CONSENT" : "PUBLISH_CONSENT"
    );
    return true;
  });
}
async function decisionsForPatient(
  tx: Tx,
  tenantId: number,
  patientId: number
) {
  const decisions = await tx
    .select()
    .from(mindosConsentDecisions)
    .where(
      and(
        eq(mindosConsentDecisions.tenantId, tenantId),
        eq(mindosConsentDecisions.patientId, patientId)
      )
    )
    .orderBy(mindosConsentDecisions.id);
  const previous = new Map<number, string>();
  for (const d of decisions) {
    const expected = seal("consent-decision", [
      d.tenantId,
      d.patientId,
      d.templateId,
      d.actorUserId,
      d.decision,
      d.snapshotJson,
      d.bodyHash,
      d.previousHash,
      d.decidedAt.toISOString(),
    ]);
    if (
      d.previousHash !== (previous.get(d.templateId) || null) ||
      !sameHash(d.evidenceHash, expected)
    )
      throw new TRPCError({
        code: "CONFLICT",
        message: "Falha na evidência de consentimento. Histórico bloqueado.",
      });
    previous.set(d.templateId, d.evidenceHash);
  }
  return decisions;
}
export async function decideConsent(
  user: User,
  input: {
    templateId: number;
    bodyHash: string;
    decision: "ACCEPTED" | "DECLINED" | "WITHDRAWN";
    acknowledged: boolean;
  }
) {
  return withPortal(user, async (tx, clinic, patient) => {
    const [t] = await tx
      .select()
      .from(mindosConsentTemplates)
      .where(
        and(
          eq(mindosConsentTemplates.tenantId, clinic.id),
          eq(mindosConsentTemplates.id, input.templateId)
        )
      )
      .for("update");
    if (!t) return missing();
    verifyTemplate(t);
    if (t.bodyHash !== input.bodyHash)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Leia a versão atual do termo antes de decidir",
      });
    if (!input.acknowledged)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Confirme sua decisão antes de registrar",
      });
    const decisions = await decisionsForPatient(tx, clinic.id, patient.id);
    const previous = decisions.filter(d => d.templateId === t.id).at(-1);
    if (input.decision === previous?.decision) return { id: previous.id };
    if (input.decision === "WITHDRAWN") {
      if (previous?.decision !== "ACCEPTED")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Não há aceite ativo para retirar",
        });
    } else {
      if (t.status !== "PUBLISHED")
        throw new TRPCError({
          code: "CONFLICT",
          message: "Este termo não está mais publicado. Recarregue o portal.",
        });
      if (previous?.decision === "ACCEPTED")
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Para alterar um aceite ativo, registre a retirada",
        });
      if (!input.acknowledged)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Confirme que leu o termo antes de decidir",
        });
    }
    const snapshotJson = JSON.stringify({
      templateId: t.id,
      code: t.code,
      version: t.version,
      title: t.title,
      body: t.body,
      actorName: user.name,
      actorEmail: user.email,
    });
    const decidedAt = new Date();
    const values = {
      tenantId: clinic.id,
      patientId: patient.id,
      templateId: t.id,
      actorUserId: user.id,
      decision: input.decision,
      snapshotJson,
      bodyHash: t.bodyHash,
      previousHash: previous?.evidenceHash || null,
      decidedAt,
    };
    const evidenceHash = seal("consent-decision", [
      values.tenantId,
      values.patientId,
      values.templateId,
      values.actorUserId,
      values.decision,
      values.snapshotJson,
      values.bodyHash,
      values.previousHash,
      decidedAt.toISOString(),
    ]);
    const [r] = await tx
      .insert(mindosConsentDecisions)
      .values({ ...values, evidenceHash });
    await careAudit(
      tx,
      clinic.id,
      user.id,
      "CONSENT_DECISION",
      r.insertId,
      `CONSENT_${input.decision}`
    );
    return { id: r.insertId };
  });
}
export async function portalData(user: User) {
  return withPortal(user, async (tx, clinic, patient) => {
    const appointments = await tx
      .select({
        id: mindosAppointments.id,
        startsAt: mindosAppointments.startsAt,
        endsAt: mindosAppointments.endsAt,
        status: mindosAppointments.status,
        mode: mindosAppointments.mode,
      })
      .from(mindosAppointments)
      .where(
        and(
          eq(mindosAppointments.tenantId, clinic.id),
          eq(mindosAppointments.patientId, patient.id)
        )
      )
      .orderBy(desc(mindosAppointments.startsAt));
    const docs = await tx
      .select()
      .from(mindosPortalDocuments)
      .where(
        and(
          eq(mindosPortalDocuments.tenantId, clinic.id),
          eq(mindosPortalDocuments.patientId, patient.id),
          eq(mindosPortalDocuments.portalVisible, true),
          eq(mindosPortalDocuments.status, "AVAILABLE")
        )
      );
    const terms = await tx
      .select()
      .from(mindosConsentTemplates)
      .where(
        and(
          eq(mindosConsentTemplates.tenantId, clinic.id),
          eq(mindosConsentTemplates.status, "PUBLISHED")
        )
      )
      .orderBy(mindosConsentTemplates.id);
    terms.forEach(verifyTemplate);
    const decisions = await decisionsForPatient(tx, clinic.id, patient.id);
    const financial = await tx
      .select({
        id: transactions.id,
        code: transactions.code,
        title: transactions.title,
        totalAmount: transactions.totalAmount,
        paidAmount: transactions.paidAmount,
        dueDate: transactions.dueDate,
        status: transactions.status,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.tenantId, clinic.id),
          eq(transactions.patientId, patient.id),
          eq(transactions.portalVisible, true),
          eq(transactions.type, "RECEITA")
        )
      );
    const rescheduleRequests = await tx
      .select()
      .from(mindosRescheduleRequests)
      .where(
        and(
          eq(mindosRescheduleRequests.tenantId, clinic.id),
          eq(mindosRescheduleRequests.patientId, patient.id)
        )
      )
      .orderBy(desc(mindosRescheduleRequests.id));
    await careAudit(
      tx,
      clinic.id,
      user.id,
      "PATIENT",
      patient.id,
      "VIEW_PORTAL_DATA"
    );
    return {
      patient: {
        id: patient.id,
        fullName: patient.fullName,
        preferredName: patient.preferredName,
      },
      clinic: { name: clinic.name, timezone: clinic.timezone },
      appointments,
      documents: docs.map(d => ({
        id: d.id,
        title: d.title,
        documentType: d.documentType,
        version: d.version,
        releasedAt: d.releasedAt,
        hasFile: Boolean(d.fileKey),
      })),
      consents: terms.map(t => ({
        id: t.id,
        code: t.code,
        version: t.version,
        title: t.title,
        body: t.body,
        bodyHash: t.bodyHash,
        decision:
          decisions.filter(d => d.templateId === t.id).at(-1)?.decision || null,
      })),
      consentHistory: decisions.map(d => ({
        id: d.id,
        templateId: d.templateId,
        decision: d.decision,
        snapshotJson: d.snapshotJson,
        decidedAt: d.decidedAt,
        evidenceHash: d.evidenceHash,
        bodyHash: d.bodyHash,
      })),
      financial,
      rescheduleRequests: rescheduleRequests.map(
        ({ activeKey, requestedByUserId, resolvedByUserId, ...r }) => r
      ),
    };
  });
}
export async function patientConsentHistory(user: User, patientId: number) {
  return withClinic(user, "VIEW_DOCUMENTS", async (tx, clinic) => {
    await patientInClinic(tx, clinic.id, patientId);
    return decisionsForPatient(tx, clinic.id, patientId);
  });
}
export async function setFinancialPortalAccess(
  user: User,
  input: { patientId: number; code: string; visible: boolean }
) {
  return withClinic(user, "MANAGE_FINANCIAL", async (tx, clinic) => {
    await patientInClinic(tx, clinic.id, input.patientId);
    const [row] = await tx
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.tenantId, clinic.id),
          eq(transactions.code, input.code),
          eq(transactions.type, "RECEITA")
        )
      )
      .for("update");
    if (!row) return missing();
    if (row.patientId && row.patientId !== input.patientId)
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "Cobrança já vinculada a outro paciente. Faça revisão financeira antes de alterar a identidade.",
      });
    await tx
      .update(transactions)
      .set({ patientId: input.patientId, portalVisible: input.visible })
      .where(eq(transactions.id, row.id));
    await careAudit(
      tx,
      clinic.id,
      user.id,
      "TRANSACTION",
      row.id,
      input.visible ? "RELEASE_PORTAL_CHARGE" : "HIDE_PORTAL_CHARGE",
      "FINANCIAL"
    );
    return true;
  });
}
export async function patientFinancialLinks(user: User, patientId: number) {
  return withClinic(user, "VIEW_FINANCIAL", async (tx, clinic) => {
    await patientInClinic(tx, clinic.id, patientId);
    return tx
      .select({
        id: transactions.id,
        code: transactions.code,
        title: transactions.title,
        totalAmount: transactions.totalAmount,
        status: transactions.status,
        portalVisible: transactions.portalVisible,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.tenantId, clinic.id),
          eq(transactions.patientId, patientId)
        )
      );
  });
}
export async function requestReschedule(
  user: User,
  input: { appointmentId: number; date: string; time: string }
) {
  return withPortal(user, async (tx, clinic, patient) => {
    const [a] = await tx
      .select()
      .from(mindosAppointments)
      .where(
        and(
          eq(mindosAppointments.tenantId, clinic.id),
          eq(mindosAppointments.id, input.appointmentId),
          eq(mindosAppointments.patientId, patient.id)
        )
      )
      .for("update");
    if (!a) return missing();
    if (
      !["SCHEDULED", "CONFIRMED"].includes(a.status) ||
      a.startsAt <= new Date()
    )
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Somente sessões futuras agendadas podem receber solicitação",
      });
    const today = clinicParts(new Date(), clinic.timezone).date;
    if (input.date < today || input.date > addCivilDays(today, 365))
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Escolha uma preferência entre hoje e um ano",
      });
    try {
      if (civilToInstant(input.date, input.time, clinic.timezone) <= new Date())
        throw new Error("Escolha horário futuro");
    } catch (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: (error as Error).message,
      });
    }
    const [pending] = await tx
      .select()
      .from(mindosRescheduleRequests)
      .where(
        and(
          eq(mindosRescheduleRequests.tenantId, clinic.id),
          eq(mindosRescheduleRequests.activeKey, String(a.id))
        )
      );
    if (pending)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Já existe uma solicitação pendente para esta sessão",
      });
    const [r] = await tx.insert(mindosRescheduleRequests).values({
      tenantId: clinic.id,
      patientId: patient.id,
      appointmentId: a.id,
      activeKey: String(a.id),
      date: input.date,
      time: input.time,
      requestedByUserId: user.id,
    });
    await careAudit(
      tx,
      clinic.id,
      user.id,
      "RESCHEDULE_REQUEST",
      r.insertId,
      "REQUEST_RESCHEDULE"
    );
    return { id: r.insertId };
  });
}
export async function cancelReschedule(user: User, id: number) {
  return withPortal(user, async (tx, clinic, patient) => {
    const [r] = await tx
      .select()
      .from(mindosRescheduleRequests)
      .where(
        and(
          eq(mindosRescheduleRequests.tenantId, clinic.id),
          eq(mindosRescheduleRequests.patientId, patient.id),
          eq(mindosRescheduleRequests.id, id)
        )
      )
      .for("update");
    if (!r) return missing();
    if (r.status !== "PENDING")
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Solicitação já resolvida",
      });
    await tx
      .update(mindosRescheduleRequests)
      .set({
        status: "CANCELLED",
        activeKey: null,
        revision: r.revision + 1,
        resolvedAt: new Date(),
        resolvedByUserId: user.id,
      })
      .where(eq(mindosRescheduleRequests.id, id));
    await careAudit(
      tx,
      clinic.id,
      user.id,
      "RESCHEDULE_REQUEST",
      id,
      "CANCEL_RESCHEDULE_REQUEST"
    );
    return true;
  });
}
export async function rescheduleInbox(user: User) {
  return withClinic(user, "VIEW_ADMINISTRATIVE", async (tx, clinic) =>
    tx
      .select()
      .from(mindosRescheduleRequests)
      .where(eq(mindosRescheduleRequests.tenantId, clinic.id))
      .orderBy(desc(mindosRescheduleRequests.id))
  );
}
export async function resolveReschedule(
  user: User,
  input: {
    id: number;
    revision: number;
    approve: boolean;
    appointment?: AppointmentInput;
  }
) {
  return withClinic(user, "MANAGE_APPOINTMENTS", async (tx, clinic) => {
    const [r] = await tx
      .select()
      .from(mindosRescheduleRequests)
      .where(
        and(
          eq(mindosRescheduleRequests.tenantId, clinic.id),
          eq(mindosRescheduleRequests.id, input.id)
        )
      )
      .for("update");
    if (!r) return missing();
    if (r.status !== "PENDING" || r.revision !== input.revision)
      throw new TRPCError({
        code: "CONFLICT",
        message: "Solicitação já alterada. Recarregue.",
      });
    let replacementAppointmentId: number | null = null;
    if (input.approve) {
      if (
        !input.appointment ||
        input.appointment.patientId !== r.patientId ||
        input.appointment.count !== 1
      )
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Escolha uma sessão para o mesmo paciente",
        });
      const [a] = await tx
        .select()
        .from(mindosAppointments)
        .where(
          and(
            eq(mindosAppointments.tenantId, clinic.id),
            eq(mindosAppointments.id, r.appointmentId)
          )
        )
        .for("update");
      if (!a) return missing();
      const result = await rescheduleInTransaction(tx, clinic, user, {
        appointmentId: a.id,
        revision: a.revision,
        scope: "ONE",
        data: input.appointment,
      });
      replacementAppointmentId = result.ids[0];
    }
    await tx
      .update(mindosRescheduleRequests)
      .set({
        status: input.approve ? "APPROVED" : "DECLINED",
        activeKey: null,
        revision: r.revision + 1,
        replacementAppointmentId,
        resolvedByUserId: user.id,
        resolvedAt: new Date(),
      })
      .where(eq(mindosRescheduleRequests.id, r.id));
    await careAudit(
      tx,
      clinic.id,
      user.id,
      "RESCHEDULE_REQUEST",
      r.id,
      input.approve
        ? "APPROVE_RESCHEDULE_REQUEST"
        : "DECLINE_RESCHEDULE_REQUEST"
    );
    return { replacementAppointmentId };
  });
}
