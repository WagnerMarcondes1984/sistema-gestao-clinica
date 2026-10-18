import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, desc, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { withClinic, type Tx } from "./scheduling";
import { assertMindosPermission, getDb, hasMindosPermission } from "./db";
import { withPortal, careAudit, patientInClinic } from "./care-access";
import { isDuplicatePatient } from "./patients";
import { patientInput, normalizePatientPhone } from "../shared/patients";
import {
  leadInput,
  leadUpdate,
  taskInput,
  interactionInput,
  preferenceInput,
  sameLead,
  CRM_TRANSITIONS,
} from "../shared/crm";
import {
  crmLeads,
  crmTasks,
  crmInteractions,
  crmReminders,
  contactPreferences,
  mindosPatients,
  mindosAppointments,
  mindosBookingRequests,
  mindosMemberships,
  users,
  type User,
} from "../drizzle/schema";
const fail = (
  code:
    | "BAD_REQUEST"
    | "NOT_FOUND"
    | "CONFLICT"
    | "FORBIDDEN"
    | "PRECONDITION_FAILED",
  message: string
): never => {
  throw new TRPCError({ code, message });
};
const missing = () =>
  fail("NOT_FOUND", "Registro não encontrado nesta clínica");
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const revision = (r: { revision: number }, expected: number) => {
  if (r.revision !== expected)
    fail("CONFLICT", "Registro alterado. Atualize e confira antes de salvar");
};
async function lead(tx: Tx, tenantId: number, id: number) {
  const [r] = await tx
    .select()
    .from(crmLeads)
    .where(and(eq(crmLeads.tenantId, tenantId), eq(crmLeads.id, id)))
    .for("update");
  if (!r) return missing();
  return r;
}
async function owners(tx: Tx, tenantId: number) {
  const rows = await tx
    .select({
      id: users.id,
      name: users.name,
      role: mindosMemberships.role,
      permissionsJson: mindosMemberships.permissionsJson,
    })
    .from(users)
    .innerJoin(mindosMemberships, eq(users.id, mindosMemberships.userId))
    .where(
      and(
        eq(mindosMemberships.tenantId, tenantId),
        eq(mindosMemberships.active, true)
      )
    );
  return rows
    .filter(r => hasMindosPermission(r, "MANAGE_CRM"))
    .map(({ id, name }) => ({ id, name }));
}
async function checkOwner(tx: Tx, tenantId: number, id: number | null) {
  if (id !== null && !(await owners(tx, tenantId)).some(o => o.id === id))
    fail(
      "BAD_REQUEST",
      "Responsável precisa ter associação ativa e gestão do CRM nesta clínica"
    );
}
async function event(
  tx: Tx,
  tenantId: number,
  userId: number,
  leadId: number | null,
  patientId: number | null,
  key: string,
  summary: string
) {
  await tx.insert(crmInteractions).values({
    tenantId,
    leadId,
    patientId,
    creationKey: key,
    creationHash: hash({ userId, summary }),
    channel: "INTERNAL",
    outcome: "NOTE",
    summary,
    actorUserId: userId,
  });
}
function publicLead(r: typeof crmLeads.$inferSelect) {
  const { creationKey, creationHash, createdByUserId, ...safe } = r;
  return safe;
}
async function subject(
  tx: Tx,
  tenantId: number,
  input: { leadId?: number; patientId?: number }
) {
  if (input.leadId) {
    const l = await lead(tx, tenantId, input.leadId);
    return { leadId: l.id, patientId: null };
  }
  if (!input.patientId) return fail("BAD_REQUEST", "Escolha lead ou paciente");
  await patientInClinic(tx, tenantId, input.patientId);
  return { leadId: null, patientId: input.patientId };
}
export async function overview(user: User) {
  return withClinic(user, "VIEW_CRM", async (tx, clinic) => {
    const [member] = await tx
      .select()
      .from(mindosMemberships)
      .where(
        and(
          eq(mindosMemberships.tenantId, clinic.id),
          eq(mindosMemberships.userId, user.id)
        )
      );
    const [leads, tasks, patients, requests, team] = await Promise.all([
      tx
        .select()
        .from(crmLeads)
        .where(eq(crmLeads.tenantId, clinic.id))
        .orderBy(desc(crmLeads.id)),
      tx
        .select()
        .from(crmTasks)
        .where(eq(crmTasks.tenantId, clinic.id))
        .orderBy(crmTasks.dueAt),
      tx
        .select({
          id: mindosPatients.id,
          fullName: mindosPatients.fullName,
          status: mindosPatients.administrativeStatus,
        })
        .from(mindosPatients)
        .where(eq(mindosPatients.tenantId, clinic.id)),
      tx
        .select({
          id: mindosBookingRequests.id,
          name: mindosBookingRequests.name,
          contactChannel: mindosBookingRequests.contactChannel,
          contactValue: mindosBookingRequests.contactValue,
          status: mindosBookingRequests.status,
          crmLeadId: mindosBookingRequests.crmLeadId,
          createdAt: mindosBookingRequests.createdAt,
        })
        .from(mindosBookingRequests)
        .where(eq(mindosBookingRequests.tenantId, clinic.id)),
      owners(tx, clinic.id),
    ]);
    return {
      clinicName: clinic.name,
      timezone: clinic.timezone,
      canManage: hasMindosPermission(member, "MANAGE_CRM"),
      canConvert:
        hasMindosPermission(member, "MANAGE_CRM") &&
        hasMindosPermission(member, "MANAGE_PATIENTS"),
      leads: leads.map(publicLead),
      tasks: tasks.map(({ creationKey, creationHash, ...t }) => ({
        ...t,
        overdue: t.status === "OPEN" && t.dueAt < new Date(),
      })),
      patients,
      requests: requests.filter(r => ["NEW", "CONTACTED"].includes(r.status)),
      owners: team,
      providerConfigured: false,
    };
  });
}
export async function createLead(user: User, raw: z.input<typeof leadInput>) {
  const input = leadInput.parse(raw);
  return withClinic(user, "MANAGE_CRM", async (tx, clinic) => {
    const fingerprint = hash({ input, userId: user.id });
    const [old] = await tx
      .select()
      .from(crmLeads)
      .where(
        and(
          eq(crmLeads.tenantId, clinic.id),
          eq(crmLeads.creationKey, input.requestKey)
        )
      );
    if (old) {
      if (old.creationHash !== fingerprint)
        return fail("CONFLICT", "Chave já usada com outros dados");
      return { id: old.id };
    }
    await checkOwner(tx, clinic.id, input.ownerUserId);
    const existing = await tx
      .select()
      .from(crmLeads)
      .where(eq(crmLeads.tenantId, clinic.id));
    if (
      existing.some(l =>
        sameLead(l, {
          ...input,
          email: input.email || null,
          phone: input.phone || null,
        })
      )
    )
      return fail(
        "CONFLICT",
        "Já existe lead com esse nome e contato. Consulte o histórico existente"
      );
    const [r] = await tx.insert(crmLeads).values({
      ...input,
      tenantId: clinic.id,
      email: input.email || null,
      phone: input.phone ? normalizePatientPhone(input.phone) : null,
      creationKey: input.requestKey,
      creationHash: fingerprint,
      createdByUserId: user.id,
    });
    await event(
      tx,
      clinic.id,
      user.id,
      r.insertId,
      null,
      `create:${r.insertId}`,
      "Lead criado manualmente"
    );
    await careAudit(
      tx,
      clinic.id,
      user.id,
      "CRM_LEAD",
      r.insertId,
      "CREATE_LEAD"
    );
    return { id: r.insertId };
  });
}
export async function updateLead(
  user: User,
  input: z.infer<typeof leadUpdate>
) {
  return withClinic(user, "MANAGE_CRM", async (tx, c) => {
    const l = await lead(tx, c.id, input.leadId);
    revision(l, input.revision);
    if (l.stage === "CONVERTED")
      return fail(
        "CONFLICT",
        "Conversão preservada; use tarefas de retorno no paciente"
      );
    if (
      input.stage !== l.stage &&
      !CRM_TRANSITIONS[l.stage]?.includes(input.stage)
    )
      return fail("BAD_REQUEST", "Transição de lead inválida");
    if (
      (input.stage === "LOST" || l.stage === "LOST") &&
      input.reason.length < 8
    )
      return fail(
        "BAD_REQUEST",
        "Informe motivo com pelo menos oito caracteres"
      );
    await checkOwner(tx, c.id, input.ownerUserId);
    await tx
      .update(crmLeads)
      .set({
        stage: input.stage,
        ownerUserId: input.ownerUserId,
        nextContactAt: input.nextContactAt,
        contactAllowed: input.contactAllowed,
        lostReason: input.stage === "LOST" ? input.reason : null,
        revision: l.revision + 1,
      })
      .where(eq(crmLeads.id, l.id));
    await event(
      tx,
      c.id,
      user.id,
      l.id,
      null,
      `update:${l.id}:${l.revision + 1}`,
      `Etapa ${l.stage} → ${input.stage}; responsável e próximo contato conferidos.${input.reason ? " Motivo: " + input.reason : ""}`
    );
    await careAudit(tx, c.id, user.id, "CRM_LEAD", l.id, "UPDATE_LEAD");
    return { id: l.id };
  });
}
export async function importRequest(
  user: User,
  input: {
    requestId: number;
    ownerUserId: number | null;
    targetLeadId?: number;
    identityConfirmed: true;
  }
) {
  return withClinic(user, "MANAGE_CRM", async (tx, c) => {
    const [r] = await tx
      .select()
      .from(mindosBookingRequests)
      .where(
        and(
          eq(mindosBookingRequests.tenantId, c.id),
          eq(mindosBookingRequests.id, input.requestId)
        )
      )
      .for("update");
    if (!r) return missing();
    if (r.crmLeadId) {
      if (input.targetLeadId && input.targetLeadId !== r.crmLeadId)
        return fail("CONFLICT", "Solicitação já vinculada a outro lead");
      await lead(tx, c.id, r.crmLeadId);
      return { id: r.crmLeadId };
    }
    if (!["NEW", "CONTACTED"].includes(r.status))
      return fail("CONFLICT", "Solicitação já encerrada na triagem");
    await checkOwner(tx, c.id, input.ownerUserId);
    const contact = {
      fullName: r.name,
      email: r.contactChannel === "EMAIL" ? r.contactValue.toLowerCase() : null,
      phone:
        r.contactChannel !== "EMAIL"
          ? normalizePatientPhone(r.contactValue)
          : null,
    };
    const matches = (
      await tx.select().from(crmLeads).where(eq(crmLeads.tenantId, c.id))
    ).filter(l => sameLead(l, contact));
    if (matches.length > 1 && !input.targetLeadId)
      return fail(
        "CONFLICT",
        "Identidade ambígua: confira os cadastros antes de importar"
      );
    if (matches.length && !input.targetLeadId)
      return fail(
        "CONFLICT",
        "Lead compatível encontrado. Selecione o existente e confirme a identidade antes de vincular"
      );
    if (input.targetLeadId && !matches.some(l => l.id === input.targetLeadId))
      return fail(
        "CONFLICT",
        "O lead selecionado não corresponde ao nome e contato da solicitação nesta clínica"
      );
    let id = input.targetLeadId;
    if (!id) {
      const [inserted] = await tx.insert(crmLeads).values({
        ...contact,
        tenantId: c.id,
        source: "PUBLIC_BOOKING",
        stage: r.status === "CONTACTED" ? "CONTACTED" : "NEW",
        ownerUserId: input.ownerUserId,
        preferredChannel: r.contactChannel,
        contactAllowed: false,
        creationKey: `booking:${r.id}`,
        creationHash: hash({ request: r.id }),
        createdByUserId: user.id,
      });
      id = inserted.insertId;
    }
    await tx
      .update(mindosBookingRequests)
      .set({ crmLeadId: id, revision: r.revision + 1 })
      .where(eq(mindosBookingRequests.id, r.id));
    await event(
      tx,
      c.id,
      user.id,
      id,
      null,
      `import:${r.id}`,
      `Solicitação pública #${r.id} vinculada ao lead. Preferência para contato precisa ser conferida; nenhum envio realizado.`
    );
    await careAudit(
      tx,
      c.id,
      user.id,
      "CRM_LEAD",
      id,
      "IMPORT_BOOKING_REQUEST"
    );
    return { id };
  });
}
async function finishConversion(
  tx: Tx,
  tenantId: number,
  userId: number,
  l: typeof crmLeads.$inferSelect,
  patientId: number,
  action: string
) {
  if (l.patientId && l.patientId !== patientId)
    return fail("CONFLICT", "Lead já vinculado a outro paciente");
  if (l.stage === "CONVERTED") return;
  await tx
    .update(crmLeads)
    .set({
      stage: "CONVERTED",
      lostReason: null,
      patientId,
      nextContactAt: null,
      convertedAt: new Date(),
      revision: l.revision + 1,
    })
    .where(eq(crmLeads.id, l.id));
  await tx
    .update(crmTasks)
    .set({
      status: "CANCELLED",
      resolution: "Conversão do lead: retorno comercial cancelado",
      resolvedAt: new Date(),
      resolvedByUserId: userId,
      revision: sql`${crmTasks.revision}+1`,
    })
    .where(
      and(
        eq(crmTasks.tenantId, tenantId),
        eq(crmTasks.leadId, l.id),
        eq(crmTasks.status, "OPEN")
      )
    );
  await event(
    tx,
    tenantId,
    userId,
    l.id,
    patientId,
    `convert:${l.id}`,
    `${action}; histórico do lead preservado no paciente #${patientId}.`
  );
  await careAudit(tx, tenantId, userId, "CRM_LEAD", l.id, "CONVERT_LEAD");
}
export async function convertLead(
  user: User,
  input: { leadId: number; revision: number; patientId?: number }
) {
  return withClinic(user, "MANAGE_CRM", async (tx, c) => {
    const [m] = await tx
      .select()
      .from(mindosMemberships)
      .where(
        and(
          eq(mindosMemberships.tenantId, c.id),
          eq(mindosMemberships.userId, user.id)
        )
      );
    if (!hasMindosPermission(m, "MANAGE_PATIENTS"))
      return fail(
        "FORBIDDEN",
        "Conversão exige permissão de cadastro de pacientes"
      );
    const l = await lead(tx, c.id, input.leadId);
    if (l.stage === "CONVERTED") {
      if (input.patientId && l.patientId !== input.patientId)
        return fail("CONFLICT", "Conversão já registrada com outro paciente");
      return { patientId: l.patientId! };
    }
    revision(l, input.revision);
    if (l.stage === "LOST")
      return fail("CONFLICT", "Reabra o lead antes de converter");
    let patientId = input.patientId;
    const requests = await tx
      .select()
      .from(mindosBookingRequests)
      .where(
        and(
          eq(mindosBookingRequests.tenantId, c.id),
          eq(mindosBookingRequests.crmLeadId, l.id)
        )
      );
    const bound = requests.find(r => r.patientId)?.patientId;
    if (bound && bound !== patientId)
      return fail(
        "CONFLICT",
        "Solicitação já vinculada a paciente na triagem; selecione o mesmo cadastro"
      );
    if (patientId) {
      const p = await patientInClinic(tx, c.id, patientId);
      if (p.administrativeStatus !== "ACTIVE")
        return fail(
          "CONFLICT",
          "Ative o paciente existente antes de vinculá-lo"
        );
    } else {
      const draft = patientInput.parse({
        fullName: l.fullName,
        email: l.email || "",
        phone: l.phone || "",
        preferredChannel: l.preferredChannel,
        administrativeStatus: "ACTIVE",
      });
      const all = await tx
        .select()
        .from(mindosPatients)
        .where(eq(mindosPatients.tenantId, c.id));
      if (all.some(p => isDuplicatePatient(p, draft)))
        return fail(
          "CONFLICT",
          "Possível paciente existente: selecione o cadastro após conferir a identidade"
        );
      const [r] = await tx.insert(mindosPatients).values({
        tenantId: c.id,
        fullName: l.fullName,
        email: l.email,
        phone: l.phone,
        preferredChannel: draft.preferredChannel,
        administrativeStatus: "ACTIVE",
      });
      patientId = r.insertId;
      await careAudit(
        tx,
        c.id,
        user.id,
        "PATIENT",
        patientId,
        "CREATE_PATIENT_FROM_LEAD"
      );
    }
    await finishConversion(
      tx,
      c.id,
      user.id,
      l,
      patientId,
      "Conversão administrativa confirmada"
    );
    return { patientId };
  });
}
export async function bookingConverted(
  tx: Tx,
  tenantId: number,
  requestId: number,
  patientId: number,
  userId: number
) {
  const [r] = await tx
    .select()
    .from(mindosBookingRequests)
    .where(
      and(
        eq(mindosBookingRequests.tenantId, tenantId),
        eq(mindosBookingRequests.id, requestId)
      )
    );
  if (r?.crmLeadId) {
    const l = await lead(tx, tenantId, r.crmLeadId);
    await finishConversion(
      tx,
      tenantId,
      userId,
      l,
      patientId,
      "Conversão pela confirmação da triagem"
    );
  }
}
export async function addTask(user: User, input: z.infer<typeof taskInput>) {
  return withClinic(user, "MANAGE_CRM", async (tx, c) => {
    const fingerprint = hash({ input, userId: user.id });
    const [old] = await tx
      .select()
      .from(crmTasks)
      .where(
        and(
          eq(crmTasks.tenantId, c.id),
          eq(crmTasks.creationKey, input.requestKey)
        )
      );
    if (old) {
      if (old.creationHash !== fingerprint)
        return fail("CONFLICT", "Chave de tarefa já usada com outros dados");
      return { id: old.id };
    }
    const s = await subject(tx, c.id, input);
    await checkOwner(tx, c.id, input.ownerUserId);
    const [r] = await tx.insert(crmTasks).values({
      ...s,
      tenantId: c.id,
      title: input.title,
      kind: input.kind,
      ownerUserId: input.ownerUserId,
      dueAt: input.dueAt,
      creationKey: input.requestKey,
      creationHash: fingerprint,
      createdByUserId: user.id,
    });
    await event(
      tx,
      c.id,
      user.id,
      s.leadId,
      s.patientId,
      `task:${r.insertId}`,
      `Tarefa administrativa criada: ${input.title}`
    );
    await careAudit(tx, c.id, user.id, "CRM_TASK", r.insertId, "CREATE_TASK");
    return { id: r.insertId };
  });
}
export async function resolveTask(
  user: User,
  input: {
    taskId: number;
    revision: number;
    status: "DONE" | "CANCELLED";
    resolution: string;
  }
) {
  return withClinic(user, "MANAGE_CRM", async (tx, c) => {
    const [r] = await tx
      .select()
      .from(crmTasks)
      .where(and(eq(crmTasks.tenantId, c.id), eq(crmTasks.id, input.taskId)))
      .for("update");
    if (!r) return missing();
    revision(r, input.revision);
    if (r.status !== "OPEN") return fail("CONFLICT", "Tarefa já encerrada");
    await tx
      .update(crmTasks)
      .set({
        status: input.status,
        resolution: input.resolution,
        revision: r.revision + 1,
        resolvedAt: new Date(),
        resolvedByUserId: user.id,
      })
      .where(eq(crmTasks.id, r.id));
    await tx
      .update(crmReminders)
      .set({ status: "CANCELLED", reason: "Tarefa encerrada" })
      .where(
        and(
          eq(crmReminders.tenantId, c.id),
          eq(crmReminders.taskId, r.id),
          eq(crmReminders.status, "WAITING_PROVIDER")
        )
      );
    await event(
      tx,
      c.id,
      user.id,
      r.leadId,
      r.patientId,
      `task:${r.id}:${r.revision + 1}`,
      `Tarefa ${input.status === "DONE" ? "concluída" : "cancelada"}: ${r.title}. ${input.resolution}`
    );
    await careAudit(tx, c.id, user.id, "CRM_TASK", r.id, "RESOLVE_TASK");
    return { id: r.id };
  });
}
export async function addInteraction(
  user: User,
  input: z.infer<typeof interactionInput>
) {
  return withClinic(user, "MANAGE_CRM", async (tx, c) => {
    const fingerprint = hash({ input, userId: user.id });
    const [old] = await tx
      .select()
      .from(crmInteractions)
      .where(
        and(
          eq(crmInteractions.tenantId, c.id),
          eq(crmInteractions.creationKey, input.requestKey)
        )
      );
    if (old) {
      if (old.creationHash !== fingerprint)
        return fail("CONFLICT", "Chave de interação já usada");
      return { id: old.id };
    }
    const s = await subject(tx, c.id, input);
    const [r] = await tx.insert(crmInteractions).values({
      ...s,
      tenantId: c.id,
      channel: input.channel,
      outcome: input.outcome,
      summary: input.summary,
      creationKey: input.requestKey,
      creationHash: fingerprint,
      actorUserId: user.id,
    });
    await careAudit(
      tx,
      c.id,
      user.id,
      "CRM_INTERACTION",
      r.insertId,
      "LOG_ADMINISTRATIVE_CONTACT"
    );
    return { id: r.insertId };
  });
}
export async function history(
  user: User,
  input: { leadId?: number; patientId?: number }
) {
  return withClinic(user, "VIEW_CRM", async (tx, c) => {
    const s = await subject(tx, c.id, input);
    let condition;
    if (s.leadId) condition = eq(crmInteractions.leadId, s.leadId);
    else {
      const leads = await tx
        .select({ id: crmLeads.id })
        .from(crmLeads)
        .where(
          and(eq(crmLeads.tenantId, c.id), eq(crmLeads.patientId, s.patientId!))
        );
      condition = or(
        eq(crmInteractions.patientId, s.patientId!),
        leads.length
          ? inArray(
              crmInteractions.leadId,
              leads.map(l => l.id)
            )
          : undefined
      );
    }
    const rows = await tx
      .select()
      .from(crmInteractions)
      .where(and(eq(crmInteractions.tenantId, c.id), condition))
      .orderBy(desc(crmInteractions.id));
    return rows.map(({ creationKey, creationHash, ...r }) => r);
  });
}
async function pref(tx: Tx, tenantId: number, patientId: number) {
  const [r] = await tx
    .select()
    .from(contactPreferences)
    .where(
      and(
        eq(contactPreferences.tenantId, tenantId),
        eq(contactPreferences.patientId, patientId)
      )
    );
  return r
    ? {
        revision: r.revision,
        emailAllowed: r.emailAllowed,
        whatsappAllowed: r.whatsappAllowed,
      }
    : { revision: 0, emailAllowed: false, whatsappAllowed: false };
}
async function savePref(
  tx: Tx,
  tenantId: number,
  patientId: number,
  userId: number,
  input: z.infer<typeof preferenceInput>,
  source: "PATIENT_PORTAL" | "STAFF_RECORDED",
  reason: string
) {
  await patientInClinic(tx, tenantId, patientId);
  const current = await pref(tx, tenantId, patientId);
  revision(current, input.revision);
  const values = {
    emailAllowed: input.emailAllowed,
    whatsappAllowed: input.whatsappAllowed,
    source,
    reason,
    recordedByUserId: userId,
    revision: current.revision + 1,
  };
  if (current.revision)
    await tx
      .update(contactPreferences)
      .set(values)
      .where(
        and(
          eq(contactPreferences.tenantId, tenantId),
          eq(contactPreferences.patientId, patientId)
        )
      );
  else
    await tx
      .insert(contactPreferences)
      .values({ ...values, tenantId, patientId });
  await tx
    .update(crmReminders)
    .set({
      status: "SUPPRESSED",
      reason: "Preferências alteradas; preparar novamente após conferência",
    })
    .where(
      and(
        eq(crmReminders.tenantId, tenantId),
        eq(crmReminders.patientId, patientId),
        eq(crmReminders.status, "WAITING_PROVIDER")
      )
    );
  await careAudit(
    tx,
    tenantId,
    userId,
    "CONTACT_PREFERENCE",
    patientId,
    "UPDATE_CONTACT_PREFERENCE"
  );
  return pref(tx, tenantId, patientId);
}
export async function preferences(user: User, patientId: number) {
  return withClinic(user, "VIEW_CRM", async (tx, c) => {
    await patientInClinic(tx, c.id, patientId);
    return pref(tx, c.id, patientId);
  });
}
export async function savePreferences(
  user: User,
  input: z.infer<typeof preferenceInput> & { patientId: number; reason: string }
) {
  return withClinic(user, "MANAGE_CRM", (tx, c) =>
    savePref(
      tx,
      c.id,
      input.patientId,
      user.id,
      input,
      "STAFF_RECORDED",
      input.reason
    )
  );
}
export async function myPreferences(user: User) {
  return withPortal(user, (tx, c, p) => pref(tx, c.id, p.id));
}
export async function saveMyPreferences(
  user: User,
  input: z.infer<typeof preferenceInput>
) {
  return withPortal(user, (tx, c, p) =>
    savePref(
      tx,
      c.id,
      p.id,
      user.id,
      input,
      "PATIENT_PORTAL",
      "Escolha registrada pelo paciente no portal"
    )
  );
}
const neutralText =
  "Há um compromisso no seu cadastro. Consulte o portal ou entre em contato para conferir os detalhes.";
export async function prepareReminders(user: User) {
  return withClinic(user, "MANAGE_CRM", async (tx, c) => {
    const now = new Date(),
      horizon = new Date(now.getTime() + 7 * 86400000);
    const [patients, appointments, tasks, previous] = await Promise.all([
      tx.select().from(mindosPatients).where(eq(mindosPatients.tenantId, c.id)),
      tx
        .select()
        .from(mindosAppointments)
        .where(eq(mindosAppointments.tenantId, c.id)),
      tx.select().from(crmTasks).where(eq(crmTasks.tenantId, c.id)),
      tx.select().from(crmReminders).where(eq(crmReminders.tenantId, c.id)),
    ]);
    for (const old of previous) {
      const a = appointments.find(a => a.id === old.appointmentId),
        t = tasks.find(t => t.id === old.taskId);
      if (
        (old.appointmentId &&
          (!a ||
            a.revision !== old.appointmentRevision ||
            !["SCHEDULED", "CONFIRMED"].includes(a.status) ||
            a.startsAt <= now)) ||
        (old.taskId &&
          (!t ||
            t.status !== "OPEN" ||
            t.dueAt.getTime() !== old.dueAt.getTime()))
      )
        await tx
          .update(crmReminders)
          .set({
            status: "CANCELLED",
            reason: "Agenda ou tarefa alterada/encerrada",
          })
          .where(eq(crmReminders.id, old.id));
    }
    let created = 0;
    const queue = async (
      patientId: number,
      kind: "CONFIRMATION" | "SESSION_REMINDER" | "RETURN",
      dueAt: Date,
      appointmentId: number | null,
      appointmentRevision: number | null,
      taskId: number | null
    ) => {
      const p = patients.find(p => p.id === patientId);
      if (!p) return;
      const key = hash({
        tenant: c.id,
        patientId,
        kind,
        appointmentId,
        appointmentRevision,
        taskId,
        taskDue: taskId ? dueAt.toISOString() : null,
      });

      const preference = await pref(tx, c.id, patientId);
      const email = p.preferredChannel === "EMAIL",
        channel = p.preferredChannel;
      const allowed =
        p.administrativeStatus === "ACTIVE" &&
        (email
          ? preference.emailAllowed && !!p.email
          : channel === "WHATSAPP_DISCREET" &&
            preference.whatsappAllowed &&
            !!p.phone);
      const previousRow = previous.find(r => r.dedupeKey === key);
      if (previousRow) {
        if (previousRow.status !== "CANCELLED")
          await tx
            .update(crmReminders)
            .set({
              status: allowed ? "WAITING_PROVIDER" : "SUPPRESSED",
              reason: allowed
                ? "Provedor ainda não definido; nenhum envio realizado"
                : "Preferência não autoriza o canal ou contato indisponível",
            })
            .where(eq(crmReminders.id, previousRow.id));
        return;
      }
      await tx.insert(crmReminders).values({
        tenantId: c.id,
        patientId,
        appointmentId,
        appointmentRevision,
        taskId,
        kind,
        dueAt,
        channel,
        templateText: neutralText,
        dedupeKey: key,
        createdByUserId: user.id,
        status: allowed ? "WAITING_PROVIDER" : "SUPPRESSED",
        reason: allowed
          ? "Provedor ainda não definido; nenhum envio realizado"
          : "Preferência não autoriza este canal, contato ausente ou cadastro inativo",
      });
      created++;
    };
    for (const a of appointments.filter(
      a =>
        ["SCHEDULED", "CONFIRMED"].includes(a.status) &&
        a.startsAt > now &&
        a.startsAt <= horizon
    )) {
      await queue(
        a.patientId,
        "SESSION_REMINDER",
        new Date(Math.max(now.getTime(), a.startsAt.getTime() - 86400000)),
        a.id,
        a.revision,
        null
      );
      if (a.status === "SCHEDULED")
        await queue(
          a.patientId,
          "CONFIRMATION",
          new Date(
            Math.max(now.getTime(), a.startsAt.getTime() - 2 * 86400000)
          ),
          a.id,
          a.revision,
          null
        );
    }
    for (const t of tasks.filter(
      t => t.status === "OPEN" && t.kind === "RETURN" && t.dueAt <= horizon
    )) {
      const patientId = t.patientId;
      if (patientId)
        await queue(patientId, "RETURN", t.dueAt, null, null, t.id);
    }
    await careAudit(tx, c.id, user.id, "CRM_REMINDER", 0, "PREPARE_REMINDERS");
    return { created, providerConfigured: false };
  });
}
export async function reminders(user: User) {
  return withClinic(user, "VIEW_CRM", async (tx, c) => {
    const rows = await tx
      .select()
      .from(crmReminders)
      .where(eq(crmReminders.tenantId, c.id))
      .orderBy(desc(crmReminders.id));
    return { providerConfigured: false, items: rows };
  });
}
export async function metrics(user: User) {
  return withClinic(user, "VIEW_CRM", async (tx, c) => {
    const [leads, tasks, sessions] = await Promise.all([
      tx.select().from(crmLeads).where(eq(crmLeads.tenantId, c.id)),
      tx.select().from(crmTasks).where(eq(crmTasks.tenantId, c.id)),
      tx
        .select({
          id: mindosAppointments.id,
          patientId: mindosAppointments.patientId,
          status: mindosAppointments.status,
        })
        .from(mindosAppointments)
        .where(eq(mindosAppointments.tenantId, c.id)),
    ]);
    const converted = leads.filter(l => l.stage === "CONVERTED"),
      cohort = new Set(converted.map(l => l.patientId).filter(Boolean));
    const eligible = sessions.filter(
        s =>
          cohort.has(s.patientId) && ["COMPLETED", "NO_SHOW"].includes(s.status)
      ),
      completed = eligible.filter(s => s.status === "COMPLETED");
    const attended = new Set(completed.map(s => s.patientId));
    return {
      totalLeads: leads.length,
      converted: converted.length,
      conversionRate: leads.length ? converted.length / leads.length : null,
      bySource: ["MANUAL", "PUBLIC_BOOKING", "REFERRAL", "OTHER"].map(
        source => ({
          source,
          total: leads.filter(l => l.source === source).length,
          converted: converted.filter(l => l.source === source).length,
        })
      ),
      overdueTasks: tasks.filter(
        t => t.status === "OPEN" && t.dueAt < new Date()
      ).length,
      eligibleAppointments: eligible.length,
      completedAppointments: completed.length,
      attendanceRate: eligible.length
        ? completed.length / eligible.length
        : null,
      attendedPatients: attended.size,
      returnedPatients: [...attended].filter(
        id => completed.filter(s => s.patientId === id).length >= 2
      ).length,
    };
  });
}

export async function updateTask(
  user: User,
  input: {
    taskId: number;
    revision: number;
    title: string;
    ownerUserId: number;
    dueAt: Date;
  }
) {
  return withClinic(user, "MANAGE_CRM", async (tx, c) => {
    const [r] = await tx
      .select()
      .from(crmTasks)
      .where(and(eq(crmTasks.tenantId, c.id), eq(crmTasks.id, input.taskId)))
      .for("update");
    if (!r) return missing();
    revision(r, input.revision);
    if (r.status !== "OPEN")
      return fail("CONFLICT", "Tarefa encerrada não pode ser alterada");
    await checkOwner(tx, c.id, input.ownerUserId);
    await tx
      .update(crmTasks)
      .set({
        title: input.title,
        ownerUserId: input.ownerUserId,
        dueAt: input.dueAt,
        revision: r.revision + 1,
      })
      .where(eq(crmTasks.id, r.id));
    await tx
      .update(crmReminders)
      .set({
        status: "CANCELLED",
        reason: "Tarefa alterada; preparar novamente",
      })
      .where(
        and(eq(crmReminders.tenantId, c.id), eq(crmReminders.taskId, r.id))
      );
    await event(
      tx,
      c.id,
      user.id,
      r.leadId,
      r.patientId,
      `task:${r.id}:${r.revision + 1}`,
      `Prazo/responsável da tarefa conferidos: ${input.title}`
    );
    return { id: r.id };
  });
}
