import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, desc, sql } from "drizzle-orm";
import { z } from "zod";
import { withClinic, type Tx } from "./scheduling";
import { hasMindosPermission } from "./db";
import { clinicParts } from "../shared/scheduling";
import {
  SALES_TRANSITIONS,
  SALES_LABELS,
  opportunityInput,
  opportunityEdit,
  moveInput,
  proposalInput,
  proposalDecision,
  goalInput,
  commercialPreference,
  ruleInput,
  commercialFilter,
  reportInput,
  proposalTotal,
} from "../shared/commercial";
import {
  salesOpportunities as opps,
  salesProposals as proposals,
  salesGoals as goals,
  salesPreferences as prefs,
  salesRules as rules,
  salesRuns as runs,
  salesEvents as events,
  crmLeads,
  crmTasks,
  mindosPatients,
  contactPreferences,
  mindosMemberships,
  mindosAccessAudits,
  users,
  type User,
} from "../drizzle/schema";
const fail = (
  code: "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST",
  message: string
): never => {
  throw new TRPCError({ code, message });
};
const missing = (): never =>
  fail("NOT_FOUND", "Registro não encontrado nesta clínica");
const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const revision = (row: { revision: number }, expected: number) => {
  if (row.revision !== expected)
    fail("CONFLICT", "Registro alterado. Atualize e confira antes de salvar");
};
const closed = (stage: string) => stage === "WON" || stage === "LOST";
async function audit(
  tx: Tx,
  tenantId: number,
  actorUserId: number,
  subjectType: string,
  subjectId: number,
  action: string
) {
  await tx.insert(mindosAccessAudits).values({
    tenantId,
    actorUserId,
    subjectType,
    subjectId,
    action,
    dataLayer: "ADMINISTRATIVE",
    reason: "Operação comercial autenticada",
  });
}
async function event(
  tx: Tx,
  tenantId: number,
  userId: number,
  opportunityId: number,
  action: string,
  summary: string
) {
  await tx
    .insert(events)
    .values({ tenantId, actorUserId: userId, opportunityId, action, summary });
  await audit(tx, tenantId, userId, "SALES_OPPORTUNITY", opportunityId, action);
}
async function opportunity(tx: Tx, t: number, id: number) {
  const [row] = await tx
    .select()
    .from(opps)
    .where(and(eq(opps.tenantId, t), eq(opps.id, id)))
    .for("update");
  return row || missing();
}
async function lead(tx: Tx, t: number, id: number) {
  const [row] = await tx
    .select()
    .from(crmLeads)
    .where(and(eq(crmLeads.tenantId, t), eq(crmLeads.id, id)))
    .for("update");
  return row || missing();
}
async function team(tx: Tx, t: number) {
  const members = await tx
    .select({
      id: users.id,
      name: users.name,
      role: mindosMemberships.role,
      permissionsJson: mindosMemberships.permissionsJson,
    })
    .from(users)
    .innerJoin(mindosMemberships, eq(users.id, mindosMemberships.userId))
    .where(
      and(eq(mindosMemberships.tenantId, t), eq(mindosMemberships.active, true))
    );
  return members
    .filter(
      m =>
        hasMindosPermission(m, "MANAGE_COMMERCIAL") &&
        hasMindosPermission(m, "MANAGE_CRM")
    )
    .map(({ id, name }) => ({ id, name }));
}
async function owner(tx: Tx, t: number, id: number) {
  if (!(await team(tx, t)).some(m => m.id === id))
    fail(
      "BAD_REQUEST",
      "Responsável precisa ter acesso ativo à gestão comercial e do CRM nesta clínica"
    );
}
function safeOpportunity(row: typeof opps.$inferSelect) {
  const { creationKey, creationHash, ...safe } = row;
  return safe;
}
function safeProposal(row: typeof proposals.$inferSelect) {
  const { creationKey, creationHash, ...safe } = row;
  return safe;
}
async function eligibility(tx: Tx, t: number, l: typeof crmLeads.$inferSelect) {
  const [p] = await tx
    .select()
    .from(prefs)
    .where(and(eq(prefs.tenantId, t), eq(prefs.leadId, l.id)));
  let base = l.contactAllowed && l.stage !== "LOST";
  let patientEmail = true,
    patientWhatsapp = true;
  if (l.patientId) {
    const [patient] = await tx
      .select({ status: mindosPatients.administrativeStatus })
      .from(mindosPatients)
      .where(
        and(eq(mindosPatients.tenantId, t), eq(mindosPatients.id, l.patientId))
      );
    const [global] = await tx
      .select({
        email: contactPreferences.emailAllowed,
        whatsapp: contactPreferences.whatsappAllowed,
      })
      .from(contactPreferences)
      .where(
        and(
          eq(contactPreferences.tenantId, t),
          eq(contactPreferences.patientId, l.patientId)
        )
      );
    base = base && patient?.status === "ACTIVE";
    patientEmail = global?.email === true;
    patientWhatsapp = global?.whatsapp === true;
  }
  return {
    email: Boolean(base && l.email && p?.emailAllowed && patientEmail),
    whatsapp: Boolean(base && l.phone && p?.whatsappAllowed && patientWhatsapp),
  };
}
async function cancelTask(
  tx: Tx,
  t: number,
  userId: number,
  taskId: number,
  reason: string
) {
  const [task] = await tx
    .select()
    .from(crmTasks)
    .where(and(eq(crmTasks.tenantId, t), eq(crmTasks.id, taskId)))
    .for("update");
  if (task?.status === "OPEN") {
    await tx
      .update(crmTasks)
      .set({
        status: "CANCELLED",
        resolvedAt: new Date(),
        resolvedByUserId: userId,
        resolution: reason,
        revision: task.revision + 1,
      })
      .where(and(eq(crmTasks.tenantId, t), eq(crmTasks.id, task.id)));
    await audit(tx, t, userId, "CRM_TASK", task.id, "CANCEL_SALES_TASK");
    return 1;
  }
  return 0;
}
async function cancelOpportunityTasks(
  tx: Tx,
  t: number,
  userId: number,
  id: number,
  reason: string
) {
  const items = await tx
    .select({ taskId: runs.taskId })
    .from(runs)
    .where(and(eq(runs.tenantId, t), eq(runs.opportunityId, id)));
  for (const item of items)
    await cancelTask(tx, t, userId, item.taskId, reason);
}
// Chamado também nas revogações do CRM/portal; não depende de provedor de mensagens.
export async function revokeCommercialTasks(
  tx: Tx,
  t: number,
  userId: number,
  filter: { leadId?: number; patientId?: number }
) {
  const leads = await tx
    .select()
    .from(crmLeads)
    .where(
      and(
        eq(crmLeads.tenantId, t),
        filter.leadId
          ? eq(crmLeads.id, filter.leadId)
          : eq(crmLeads.patientId, filter.patientId!)
      )
    );
  for (const l of leads) {
    const allowed = await eligibility(tx, t, l);
    const items = await tx
      .select({ taskId: runs.taskId, channel: rules.channel })
      .from(runs)
      .innerJoin(
        opps,
        and(eq(opps.id, runs.opportunityId), eq(opps.tenantId, t))
      )
      .innerJoin(rules, and(eq(rules.id, runs.ruleId), eq(rules.tenantId, t)))
      .where(and(eq(runs.tenantId, t), eq(opps.leadId, l.id)));
    for (const item of items)
      if (!(item.channel === "EMAIL" ? allowed.email : allowed.whatsapp))
        await cancelTask(
          tx,
          t,
          userId,
          item.taskId,
          "Autorização de contato comercial indisponível ou retirada"
        );
  }
}
export async function overview(
  user: User,
  raw: z.input<typeof commercialFilter>
) {
  const input = commercialFilter.parse(raw);
  return withClinic(user, "VIEW_COMMERCIAL", async (tx, c) => {
    const [member] = await tx
      .select()
      .from(mindosMemberships)
      .where(
        and(
          eq(mindosMemberships.tenantId, c.id),
          eq(mindosMemberships.userId, user.id)
        )
      );
    const owners = await team(tx, c.id);
    const rows = await tx
      .select()
      .from(opps)
      .where(eq(opps.tenantId, c.id))
      .orderBy(desc(opps.id));
    const leads = await tx
      .select({
        id: crmLeads.id,
        fullName: crmLeads.fullName,
        stage: crmLeads.stage,
      })
      .from(crmLeads)
      .where(eq(crmLeads.tenantId, c.id));
    const names = new Map(leads.map(l => [l.id, l.fullName]));
    const eligibilityMap = new Map<
      number,
      { email: boolean; whatsapp: boolean }
    >();
    if (input.channel)
      for (const id of new Set(rows.map(o => o.leadId)))
        eligibilityMap.set(
          id,
          await eligibility(tx, c.id, await lead(tx, c.id, id))
        );
    const filtered = rows.filter(
      o =>
        (!input.ownerUserId || o.ownerUserId === input.ownerUserId) &&
        (!input.source || o.source === input.source) &&
        (!input.stage || o.stage === input.stage) &&
        (!input.search ||
          `${o.title} ${names.get(o.leadId) || ""}`
            .toLocaleLowerCase()
            .includes(input.search.toLocaleLowerCase())) &&
        (!input.channel ||
          (input.channel === "NONE"
            ? !eligibilityMap.get(o.leadId)?.email &&
              !eligibilityMap.get(o.leadId)?.whatsapp
            : input.channel === "EMAIL"
              ? eligibilityMap.get(o.leadId)?.email
              : eligibilityMap.get(o.leadId)?.whatsapp))
    );
    return {
      clinicName: c.name,
      timezone: c.timezone,
      canManage: hasMindosPermission(member, "MANAGE_COMMERCIAL"),
      owners,
      leads: leads.filter(l => l.stage !== "LOST"),
      total: filtered.length,
      page: input.page,
      pageSize: 60,
      items: filtered.slice(input.page * 60, input.page * 60 + 60).map(o => ({
        ...safeOpportunity(o),
        leadName: names.get(o.leadId) || "Cadastro indisponível",
      })),
      stages: Object.entries(
        filtered.reduce<Record<string, { count: number; amount: number }>>(
          (a, o) => {
            a[o.stage] ||= { count: 0, amount: 0 };
            a[o.stage].count++;
            a[o.stage].amount += o.amount;
            return a;
          },
          {}
        )
      ).map(([stage, v]) => ({ stage, ...v })),
    };
  });
}
export async function detail(user: User, id: number) {
  return withClinic(user, "VIEW_COMMERCIAL", async (tx, c) => {
    const o = await opportunity(tx, c.id, id),
      l = await lead(tx, c.id, o.leadId);
    const [preference] = await tx
      .select()
      .from(prefs)
      .where(and(eq(prefs.tenantId, c.id), eq(prefs.leadId, l.id)));
    return {
      opportunity: safeOpportunity(o),
      lead: {
        id: l.id,
        fullName: l.fullName,
        contactAllowed: l.contactAllowed,
      },
      eligible: await eligibility(tx, c.id, l),
      preference: preference
        ? {
            revision: preference.revision,
            emailAllowed: preference.emailAllowed,
            whatsappAllowed: preference.whatsappAllowed,
            reason: preference.reason,
          }
        : {
            revision: 0,
            emailAllowed: false,
            whatsappAllowed: false,
            reason: "",
          },
      proposals: (
        await tx
          .select()
          .from(proposals)
          .where(
            and(eq(proposals.tenantId, c.id), eq(proposals.opportunityId, id))
          )
          .orderBy(desc(proposals.version))
      ).map(safeProposal),
      history: await tx
        .select({
          id: events.id,
          action: events.action,
          summary: events.summary,
          actorUserId: events.actorUserId,
          createdAt: events.createdAt,
        })
        .from(events)
        .where(and(eq(events.tenantId, c.id), eq(events.opportunityId, id)))
        .orderBy(desc(events.id))
        .limit(100),
    };
  });
}
export async function createOpportunity(
  user: User,
  raw: z.input<typeof opportunityInput>
) {
  const input = opportunityInput.parse(raw);
  return withClinic(user, "MANAGE_COMMERCIAL", async (tx, c) => {
    const hash = fingerprint({ input, actor: user.id });
    const [old] = await tx
      .select()
      .from(opps)
      .where(
        and(eq(opps.tenantId, c.id), eq(opps.creationKey, input.requestKey))
      );
    if (old) {
      if (old.creationHash !== hash)
        fail("CONFLICT", "Chave já usada com outros dados");
      return { id: old.id };
    }
    const l = await lead(tx, c.id, input.leadId);
    if (l.stage === "LOST")
      fail("BAD_REQUEST", "Reabra o lead no CRM antes de criar a oportunidade");
    await owner(tx, c.id, input.ownerUserId);
    const { requestKey, ...fields } = input;
    const [r] = await tx.insert(opps).values({
      ...fields,
      tenantId: c.id,
      source: l.source,
      creationKey: requestKey,
      creationHash: hash,
      createdByUserId: user.id,
    });
    await event(
      tx,
      c.id,
      user.id,
      r.insertId,
      "CREATE_OPPORTUNITY",
      "Oportunidade administrativa criada; nenhum recebimento ou contrato foi gerado"
    );
    await applyForOpportunity(
      tx,
      c.id,
      user.id,
      await opportunity(tx, c.id, r.insertId)
    );
    return { id: r.insertId };
  });
}
export async function editOpportunity(
  user: User,
  raw: z.input<typeof opportunityEdit>
) {
  const input = opportunityEdit.parse(raw);
  return withClinic(user, "MANAGE_COMMERCIAL", async (tx, c) => {
    const o = await opportunity(tx, c.id, input.opportunityId);
    revision(o, input.revision);
    if (closed(o.stage))
      fail(
        "CONFLICT",
        "Oportunidade encerrada; reabra uma perda antes de editar"
      );
    await owner(tx, c.id, input.ownerUserId);
    const [accepted] = await tx
      .select()
      .from(proposals)
      .where(
        and(
          eq(proposals.tenantId, c.id),
          eq(proposals.opportunityId, o.id),
          eq(proposals.status, "ACCEPTED")
        )
      );
    if (accepted && accepted.total !== input.amount)
      fail(
        "CONFLICT",
        "Valor deve corresponder à proposta aceita; cancele o aceite antes de renegociar"
      );
    if (o.ownerUserId !== input.ownerUserId) {
      for (const run of await tx
        .select()
        .from(runs)
        .where(and(eq(runs.tenantId, c.id), eq(runs.opportunityId, o.id)))) {
        await tx
          .update(crmTasks)
          .set({
            ownerUserId: input.ownerUserId,
            revision: sql`${crmTasks.revision}+1`,
          })
          .where(
            and(
              eq(crmTasks.tenantId, c.id),
              eq(crmTasks.id, run.taskId),
              eq(crmTasks.status, "OPEN")
            )
          );
      }
    }
    await tx
      .update(opps)
      .set({
        title: input.title,
        amount: input.amount,
        ownerUserId: input.ownerUserId,
        expectedCloseDate: input.expectedCloseDate,
        revision: o.revision + 1,
      })
      .where(and(eq(opps.tenantId, c.id), eq(opps.id, o.id)));
    await event(
      tx,
      c.id,
      user.id,
      o.id,
      "EDIT_OPPORTUNITY",
      `${o.title} → ${input.title}; valor ${o.amount} → ${input.amount} centavos; responsável #${o.ownerUserId} → #${input.ownerUserId}; previsão ${o.expectedCloseDate} → ${input.expectedCloseDate}`
    );
    // A revisão não recria retornos já gerados para a mesma entrada de etapa.
    return { id: o.id };
  });
}
export async function moveOpportunity(
  user: User,
  raw: z.input<typeof moveInput>
) {
  const input = moveInput.parse(raw);
  return withClinic(user, "MANAGE_COMMERCIAL", async (tx, c) => {
    const o = await opportunity(tx, c.id, input.opportunityId);
    revision(o, input.revision);
    if (!SALES_TRANSITIONS[o.stage]?.includes(input.stage))
      fail("BAD_REQUEST", "Mudança de etapa inválida");
    if (
      (input.stage === "LOST" || o.stage === "LOST") &&
      input.reason.length < 8
    )
      fail("BAD_REQUEST", "Informe um motivo com pelo menos oito caracteres");
    if (input.stage === "WON") {
      if (!input.confirmed)
        fail("BAD_REQUEST", "Confirme a contratação administrativa");
      const [p] = await tx
        .select()
        .from(proposals)
        .where(
          and(
            eq(proposals.tenantId, c.id),
            eq(proposals.opportunityId, o.id),
            eq(proposals.status, "ACCEPTED")
          )
        );
      if (!p || p.total !== o.amount)
        fail(
          "CONFLICT",
          "Registre uma proposta aceita com o mesmo valor antes de ganhar a oportunidade"
        );
    }
    await cancelOpportunityTasks(
      tx,
      c.id,
      user.id,
      o.id,
      "Etapa comercial alterada"
    );
    if (input.stage === "LOST")
      await tx
        .update(proposals)
        .set({
          status: "CANCELLED",
          evidence: `Oportunidade perdida: ${input.reason}`.slice(0, 500),
          decidedAt: new Date(),
          decidedByUserId: user.id,
          revision: sql`${proposals.revision}+1`,
        })
        .where(
          and(
            eq(proposals.tenantId, c.id),
            eq(proposals.opportunityId, o.id),
            sql`${proposals.status} IN ('DRAFT','PRESENTED','ACCEPTED')`
          )
        );
    await tx
      .update(opps)
      .set({
        stage: input.stage,
        lostReason: input.stage === "LOST" ? input.reason : null,
        closedAt: closed(input.stage) ? new Date() : null,
        stageEnteredAt: new Date(),
        stageVersion: o.stageVersion + 1,
        revision: o.revision + 1,
      })
      .where(and(eq(opps.tenantId, c.id), eq(opps.id, o.id)));
    await event(
      tx,
      c.id,
      user.id,
      o.id,
      "MOVE_OPPORTUNITY",
      `${SALES_LABELS[o.stage]} → ${SALES_LABELS[input.stage]}${input.reason ? ": " + input.reason : ""}`
    );
    await applyForOpportunity(
      tx,
      c.id,
      user.id,
      await opportunity(tx, c.id, o.id)
    );
    return { id: o.id };
  });
}
export async function createProposal(
  user: User,
  raw: z.input<typeof proposalInput>
) {
  const input = proposalInput.parse(raw);
  let totals;
  try {
    totals = proposalTotal(input.quantity, input.unitPrice, input.discount);
  } catch {
    return fail(
      "BAD_REQUEST",
      "Confira quantidade, preço e desconto da proposta"
    );
  }
  return withClinic(user, "MANAGE_COMMERCIAL", async (tx, c) => {
    const hash = fingerprint({ input, actor: user.id });
    const [old] = await tx
      .select()
      .from(proposals)
      .where(
        and(
          eq(proposals.tenantId, c.id),
          eq(proposals.creationKey, input.requestKey)
        )
      );
    if (old) {
      if (old.creationHash !== hash)
        fail("CONFLICT", "Chave já usada com outros dados");
      return { id: old.id };
    }
    const o = await opportunity(tx, c.id, input.opportunityId);
    revision(o, input.revision);
    if (closed(o.stage)) fail("CONFLICT", "Oportunidade encerrada");
    if (input.validUntil < clinicParts(new Date(), c.timezone).date)
      fail("BAD_REQUEST", "Validade da proposta já passou");
    const versions = await tx
      .select()
      .from(proposals)
      .where(
        and(eq(proposals.tenantId, c.id), eq(proposals.opportunityId, o.id))
      );
    if (versions.some(p => p.status === "ACCEPTED"))
      fail("CONFLICT", "Cancele o aceite anterior antes de criar nova versão");
    const version = Math.max(0, ...versions.map(p => p.version)) + 1;
    await tx
      .update(proposals)
      .set({
        status: "CANCELLED",
        evidence: `Substituída pela versão ${version}`,
        decidedByUserId: user.id,
        decidedAt: new Date(),
        revision: sql`${proposals.revision}+1`,
      })
      .where(
        and(
          eq(proposals.tenantId, c.id),
          eq(proposals.opportunityId, o.id),
          sql`${proposals.status} IN ('DRAFT','PRESENTED')`
        )
      );
    const [p] = await tx.insert(proposals).values({
      tenantId: c.id,
      opportunityId: o.id,
      version,
      title: input.title,
      quantity: input.quantity,
      unitPrice: input.unitPrice,
      discount: input.discount,
      total: totals.total,
      validUntil: input.validUntil,
      terms: input.terms,
      creationKey: input.requestKey,
      creationHash: hash,
      createdByUserId: user.id,
    });
    await tx
      .update(opps)
      .set({ amount: totals.total, revision: o.revision + 1 })
      .where(and(eq(opps.tenantId, c.id), eq(opps.id, o.id)));
    await event(
      tx,
      c.id,
      user.id,
      o.id,
      "CREATE_PROPOSAL",
      `Proposta versão ${version} criada com total calculado pelo sistema; versões abertas anteriores substituídas`
    );
    return { id: p.insertId };
  });
}
export async function decideProposal(
  user: User,
  raw: z.input<typeof proposalDecision>
) {
  const input = proposalDecision.parse(raw);
  return withClinic(user, "MANAGE_COMMERCIAL", async (tx, c) => {
    const [p] = await tx
      .select()
      .from(proposals)
      .where(
        and(eq(proposals.tenantId, c.id), eq(proposals.id, input.proposalId))
      )
      .for("update");
    if (!p) return missing();
    revision(p, input.revision);
    const o = await opportunity(tx, c.id, p.opportunityId);
    if (closed(o.stage))
      fail("CONFLICT", "Oportunidade encerrada; registro preservado");
    const transitions: Record<string, string[]> = {
      DRAFT: ["PRESENTED", "CANCELLED"],
      PRESENTED: ["ACCEPTED", "DECLINED", "CANCELLED"],
      ACCEPTED: ["CANCELLED"],
    };
    if (!transitions[p.status]?.includes(input.status))
      fail("BAD_REQUEST", "Decisão de proposta inválida");
    if (
      ["PRESENTED", "ACCEPTED"].includes(input.status) &&
      p.validUntil < clinicParts(new Date(), c.timezone).date
    )
      fail("CONFLICT", "Proposta vencida; crie uma nova versão");
    if (input.status === "ACCEPTED" && p.total !== o.amount)
      fail(
        "CONFLICT",
        "Valor da oportunidade mudou; crie uma proposta atualizada"
      );
    await tx
      .update(proposals)
      .set({
        status: input.status,
        evidence: input.evidence,
        decidedByUserId: user.id,
        decidedAt: new Date(),
        revision: p.revision + 1,
      })
      .where(and(eq(proposals.tenantId, c.id), eq(proposals.id, p.id)));
    await tx
      .update(opps)
      .set({ revision: o.revision + 1 })
      .where(and(eq(opps.tenantId, c.id), eq(opps.id, o.id)));
    await event(
      tx,
      c.id,
      user.id,
      o.id,
      "DECIDE_PROPOSAL",
      `Proposta v${p.version}: ${{ PRESENTED: "Apresentada", ACCEPTED: "Aceita", DECLINED: "Recusada", CANCELLED: "Cancelada" }[input.status]}. Evidência administrativa: ${input.evidence}`
    );
    return { id: p.id };
  });
}
export async function savePreference(
  user: User,
  raw: z.input<typeof commercialPreference>
) {
  const input = commercialPreference.parse(raw);
  return withClinic(user, "MANAGE_COMMERCIAL", async (tx, c) => {
    await lead(tx, c.id, input.leadId);
    const [p] = await tx
      .select()
      .from(prefs)
      .where(and(eq(prefs.tenantId, c.id), eq(prefs.leadId, input.leadId)))
      .for("update");
    if ((p?.revision || 0) !== input.revision)
      fail("CONFLICT", "Preferências alteradas. Atualize antes de salvar");
    const values = {
      emailAllowed: input.emailAllowed,
      whatsappAllowed: input.whatsappAllowed,
      reason: input.reason,
      recordedByUserId: user.id,
    };
    if (p)
      await tx
        .update(prefs)
        .set({ ...values, revision: p.revision + 1 })
        .where(and(eq(prefs.tenantId, c.id), eq(prefs.id, p.id)));
    else
      await tx
        .insert(prefs)
        .values({ ...values, tenantId: c.id, leadId: input.leadId });
    await revokeCommercialTasks(tx, c.id, user.id, { leadId: input.leadId });
    await audit(
      tx,
      c.id,
      user.id,
      "SALES_PREFERENCE",
      input.leadId,
      "SAVE_SALES_PREFERENCE"
    );
    return { ok: true };
  });
}
export async function saveGoal(user: User, raw: z.input<typeof goalInput>) {
  const input = goalInput.parse(raw);
  return withClinic(user, "MANAGE_COMMERCIAL", async (tx, c) => {
    if (input.ownerUserId) await owner(tx, c.id, input.ownerUserId);
    const ownerId = input.ownerUserId || 0;
    const [g] = await tx
      .select()
      .from(goals)
      .where(
        and(
          eq(goals.tenantId, c.id),
          eq(goals.month, input.month),
          eq(goals.ownerUserId, ownerId)
        )
      )
      .for("update");
    if ((g?.revision || 0) !== input.revision)
      fail("CONFLICT", "Meta alterada. Atualize antes de salvar");
    let id = g?.id;
    if (g)
      await tx
        .update(goals)
        .set({
          targetAmount: input.targetAmount,
          revision: g.revision + 1,
          recordedByUserId: user.id,
        })
        .where(and(eq(goals.tenantId, c.id), eq(goals.id, g.id)));
    else {
      const [r] = await tx.insert(goals).values({
        tenantId: c.id,
        month: input.month,
        ownerUserId: ownerId,
        targetAmount: input.targetAmount,
        recordedByUserId: user.id,
      });
      id = r.insertId;
    }
    await audit(tx, c.id, user.id, "SALES_GOAL", id!, "SAVE_SALES_GOAL");
    return { id: id! };
  });
}
export async function settings(user: User) {
  return withClinic(user, "VIEW_COMMERCIAL", async (tx, c) => ({
    rules: await tx
      .select()
      .from(rules)
      .where(eq(rules.tenantId, c.id))
      .orderBy(rules.id),
  }));
}
export async function saveRule(user: User, raw: z.input<typeof ruleInput>) {
  const input = ruleInput.parse(raw);
  return withClinic(user, "MANAGE_COMMERCIAL", async (tx, c) => {
    const all = await tx.select().from(rules).where(eq(rules.tenantId, c.id));
    if (
      all.some(
        r =>
          r.id !== input.id &&
          r.name.toLocaleLowerCase() === input.name.toLocaleLowerCase()
      )
    )
      fail("CONFLICT", "Já existe regra com este nome");
    if (!input.id && all.length >= 20)
      fail("BAD_REQUEST", "Limite de vinte regras por clínica");
    const values = {
      name: input.name,
      stage: input.stage,
      channel: input.channel,
      delayDays: input.delayDays,
      enabled: input.enabled,
      recordedByUserId: user.id,
    };
    let id = input.id;
    if (id) {
      const r = all.find(r => r.id === id);
      if (!r) return missing();
      revision(r, input.revision);
      for (const run of await tx
        .select()
        .from(runs)
        .where(and(eq(runs.tenantId, c.id), eq(runs.ruleId, id))))
        await cancelTask(
          tx,
          c.id,
          user.id,
          run.taskId,
          "Regra comercial revisada ou desativada"
        );
      await tx
        .update(rules)
        .set({ ...values, revision: r.revision + 1 })
        .where(and(eq(rules.tenantId, c.id), eq(rules.id, id)));
    } else {
      const [r] = await tx.insert(rules).values({ ...values, tenantId: c.id });
      id = r.insertId;
    }
    await audit(tx, c.id, user.id, "SALES_RULE", id!, "SAVE_SALES_RULE");
    return { id: id! };
  });
}
async function applyForOpportunity(
  tx: Tx,
  t: number,
  userId: number,
  o: typeof opps.$inferSelect
) {
  if (closed(o.stage)) return { created: 0, blocked: 0 };
  const available = (await team(tx, t)).some(m => m.id === o.ownerUserId),
    l = await lead(tx, t, o.leadId),
    allowed = await eligibility(tx, t, l);
  const applicable = await tx
    .select()
    .from(rules)
    .where(
      and(
        eq(rules.tenantId, t),
        eq(
          rules.stage,
          o.stage as "QUALIFICATION" | "PROPOSAL" | "NEGOTIATION"
        ),
        eq(rules.enabled, true)
      )
    );
  let created = 0,
    blocked = 0;
  for (const r of applicable) {
    if (
      !available ||
      !(r.channel === "EMAIL" ? allowed.email : allowed.whatsapp)
    ) {
      blocked++;
      continue;
    }
    const [old] = await tx
      .select()
      .from(runs)
      .where(
        and(
          eq(runs.tenantId, t),
          eq(runs.opportunityId, o.id),
          eq(runs.ruleId, r.id),
          eq(runs.stageVersion, o.stageVersion),
          eq(runs.ruleRevision, r.revision)
        )
      );
    if (old) continue;
    const dueAt = new Date(o.stageEnteredAt.getTime() + r.delayDays * 86400000);
    const creationKey = randomUUID();
    const [task] = await tx.insert(crmTasks).values({
      tenantId: t,
      leadId: l.id,
      title:
        `Retorno comercial #${o.id} • ${r.channel === "EMAIL" ? "e-mail" : "WhatsApp"}`.slice(
          0,
          180
        ),
      kind: "FOLLOW_UP",
      ownerUserId: o.ownerUserId,
      dueAt,
      creationKey,
      creationHash: fingerprint({
        opportunity: o.id,
        rule: r.id,
        version: o.stageVersion,
      }),
      createdByUserId: userId,
    });
    await tx.insert(runs).values({
      tenantId: t,
      opportunityId: o.id,
      ruleId: r.id,
      stageVersion: o.stageVersion,
      ruleRevision: r.revision,
      taskId: task.insertId,
    });
    await event(
      tx,
      t,
      userId,
      o.id,
      "CREATE_SALES_TASK",
      `Tarefa #${task.insertId} criada pela regra ${r.name}. Contato precisa ser realizado pela equipe; nenhuma mensagem enviada`
    );
    created++;
  }
  return { created, blocked };
}
export async function applyRules(user: User) {
  return withClinic(user, "MANAGE_COMMERCIAL", async (tx, c) => {
    const all = await tx.select().from(opps).where(eq(opps.tenantId, c.id));
    let created = 0,
      blocked = 0;
    for (const o of all) {
      await revokeCommercialTasks(tx, c.id, user.id, { leadId: o.leadId });
      const result = await applyForOpportunity(tx, c.id, user.id, o);
      created += result.created;
      blocked += result.blocked;
    }
    await audit(tx, c.id, user.id, "SALES_RULES", c.id, "APPLY_SALES_RULES");
    return { created, blocked };
  });
}
export async function report(user: User, raw: z.input<typeof reportInput>) {
  const input = reportInput.parse(raw);
  return withClinic(user, "VIEW_COMMERCIAL", async (tx, c) => {
    const owners = await team(tx, c.id);
    const all = (
      await tx
        .select({
          id: opps.id,
          stage: opps.stage,
          amount: opps.amount,
          source: opps.source,
          ownerUserId: opps.ownerUserId,
          expectedCloseDate: opps.expectedCloseDate,
          closedAt: opps.closedAt,
          lostReason: opps.lostReason,
        })
        .from(opps)
        .where(eq(opps.tenantId, c.id))
    ).filter(
      o =>
        (!input.ownerUserId || o.ownerUserId === input.ownerUserId) &&
        (!input.source || o.source === input.source)
    );
    const inMonth = (d: Date | null) =>
      d && clinicParts(d, c.timezone).date.slice(0, 7) === input.month;
    const won = all.filter(o => o.stage === "WON" && inMonth(o.closedAt)),
      lost = all.filter(o => o.stage === "LOST" && inMonth(o.closedAt)),
      open = all.filter(
        o => !closed(o.stage) && o.expectedCloseDate.startsWith(input.month)
      );
    const sum = (rows: typeof all) => rows.reduce((s, r) => s + r.amount, 0);
    const group = (key: "source" | "ownerUserId") =>
      [...new Set(all.map(o => String(o[key])))].map(id => {
        const w = won.filter(o => String(o[key]) === id),
          l = lost.filter(o => String(o[key]) === id),
          p = open.filter(o => String(o[key]) === id);
        return {
          id,
          label:
            key === "source"
              ? id
              : owners.find(m => String(m.id) === id)?.name || `Conta #${id}`,
          won: w.length,
          lost: l.length,
          wonAmount: sum(w),
          openAmount: sum(p),
          conversion:
            w.length + l.length ? w.length / (w.length + l.length) : null,
        };
      });
    const periodGoals = (
      await tx
        .select({
          id: goals.id,
          ownerUserId: goals.ownerUserId,
          targetAmount: goals.targetAmount,
          revision: goals.revision,
        })
        .from(goals)
        .where(and(eq(goals.tenantId, c.id), eq(goals.month, input.month)))
    ).filter(g => !input.ownerUserId || g.ownerUserId === input.ownerUserId);
    return {
      month: input.month,
      won: won.length,
      lost: lost.length,
      wonAmount: sum(won),
      openAmount: sum(open),
      conversion:
        won.length + lost.length
          ? won.length / (won.length + lost.length)
          : null,
      bySource: group("source"),
      byOwner: group("ownerUserId"),
      lossReasons: [
        ...new Set(lost.map(o => o.lostReason || "Não informado")),
      ].map(reason => ({
        reason,
        count: lost.filter(o => (o.lostReason || "Não informado") === reason)
          .length,
      })),
      goals: periodGoals.map(g => ({
        ...g,
        achieved: sum(
          won.filter(
            o => g.ownerUserId === 0 || o.ownerUserId === g.ownerUserId
          )
        ),
        label:
          g.ownerUserId === 0
            ? "Clínica inteira"
            : owners.find(m => m.id === g.ownerUserId)?.name ||
              `Conta #${g.ownerUserId}`,
      })),
      goalComparisonAvailable: !input.source,
    };
  });
}
