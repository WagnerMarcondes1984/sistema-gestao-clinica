import { TRPCError } from "@trpc/server";
import { createHash } from "node:crypto";
import { clinicParts } from "../shared/scheduling";
import { and, desc, sql, like, inArray, eq, gt, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  clinicalVerticals,
  transactions,
  transactionItems,
  accountsPayable,
  cashSessions,
  financialAuditLogs,
  type Transaction,
  type InsertTransaction,
  mindosTenants,
  mindosMemberships,
  mindosPatients,
  mindosAppointments,
  mindosClinicalRecords,
  mindosAccessAudits,
  mindosFinancialRules,
  mindosBookingRequests,
  mindosInstitutionalProfiles,
  mindosServiceAreas,
  mindosPortalDocuments,
  mindosReceptionEvents,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Conexão não inicializada");
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Identidade não atualizada");
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Verticais clínicas
 */
export async function listClinicalVerticals() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(clinicalVerticals);
}

export async function getClinicalVerticalByCode(code: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(clinicalVerticals)
    .where(eq(clinicalVerticals.code, code))
    .limit(1);
  return result[0];
}

export type FinancialActor = {
  tenantId: number;
  userId: number;
  operatorName: string;
};

/**
 * Transações e Cobranças
 */
export async function listTransactions(
  actor: FinancialActor,
  filters: {
    verticalCode?: string;
    status?: string;
    paymentMethod?: string;
    search?: string;
    limit?: number;
    offset?: number;
    openOnly?: boolean;
  }
) {
  return (await import("./finance")).listCharges(actor, filters);
}
export async function getTransactionByCode(
  actor: FinancialActor,
  code: string
) {
  return (await import("./finance")).getCharge(actor, code);
}
export async function createTransactionWithItems(
  actor: FinancialActor,
  input: import("zod").input<typeof import("../shared/finance").chargeInput>
) {
  return (await import("./finance")).createCharge(actor, input);
}
export async function confirmTransactionPayment(
  _actor: FinancialActor,
  _code: string
): Promise<never> {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      "Use baixa manual com revisão, valor, referência e chave única; confirmação bancária indisponível",
  });
}
export async function refundTransactionPayment(
  _actor: FinancialActor,
  _code: string,
  _reason: string
): Promise<never> {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "Use reversão manual auditada; estorno bancário indisponível",
  });
}
export async function getDashboardMetrics(
  actor: FinancialActor,
  verticalCode?: string
) {
  return (await import("./finance")).report(actor, verticalCode);
}
export async function listAccountsPayable(
  actor: FinancialActor,
  verticalCode?: string,
  status?: string
) {
  return (await import("./finance")).listPayables(actor, verticalCode, status);
}
export async function payAccountPayable(
  _actor: FinancialActor,
  _code: string
): Promise<never> {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "Use baixa manual de despesa com revisão e referência",
  });
}

/**
 * Caixa
 */
export async function getCurrentCashSession(
  actor: FinancialActor,
  verticalCode: string
) {
  const db = await getDb();
  if (!db) return undefined;

  const sessions = await db
    .select()
    .from(cashSessions)
    .where(
      and(
        eq(cashSessions.tenantId, actor.tenantId),
        eq(cashSessions.verticalCode, verticalCode),
        eq(cashSessions.status, "OPEN")
      )
    )
    .orderBy(desc(cashSessions.openedAt))
    .limit(1);

  return sessions[0];
}

export async function listCashSessions(
  actor: FinancialActor,
  verticalCode?: string
) {
  const db = await getDb();
  if (!db) return [];

  const whereClause = and(
    eq(cashSessions.tenantId, actor.tenantId),
    verticalCode && verticalCode !== "ALL"
      ? eq(cashSessions.verticalCode, verticalCode)
      : undefined
  );
  return await db
    .select()
    .from(cashSessions)
    .where(whereClause)
    .orderBy(desc(cashSessions.openedAt));
}

export async function closeCashSession(
  _actor: FinancialActor,
  _sessionId: number,
  _closingBalance: number,
  _notes?: string
): Promise<never> {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: "Fechamento exige revisão e chave única",
  });
}

/**
 * Logs de Auditoria
 */
export async function listAuditLogs(
  actor: FinancialActor,
  verticalCode?: string,
  limit: number = 30
) {
  const db = await getDb();
  if (!db) return [];

  const whereClause = and(
    eq(financialAuditLogs.tenantId, actor.tenantId),
    verticalCode && verticalCode !== "ALL"
      ? eq(financialAuditLogs.verticalCode, verticalCode)
      : undefined
  );
  return await db
    .select()
    .from(financialAuditLogs)
    .where(whereClause)
    .orderBy(desc(financialAuditLogs.createdAt))
    .limit(limit);
}

/**
 * MindOS: tenant e autorização.
 * O tenant é sempre derivado da associação do usuário autenticado; nunca recebe tenantId do cliente.
 */
async function getMindosMembership(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  const rows = await db
    .select()
    .from(mindosMemberships)
    .where(
      and(
        eq(mindosMemberships.userId, userId),
        eq(mindosMemberships.active, true)
      )
    )
    .limit(2);
  if (rows.length > 1)
    throw new TRPCError({
      code: "CONFLICT",
      message: "Seleção explícita de clínica necessária",
    });
  return rows[0];
}

export async function ensureMindosTenantForUser(
  userId: number,
  userRole: string
) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");

  const membership = await getMindosMembership(userId);
  if (membership) {
    const tenantRows = await db
      .select()
      .from(mindosTenants)
      .where(eq(mindosTenants.id, membership.tenantId))
      .limit(1);
    if (tenantRows[0]?.status === "ACTIVE")
      return { tenant: tenantRows[0], membership };
    throw new TRPCError({ code: "FORBIDDEN", message: "Clínica indisponível" });
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Usuário sem associação ativa a uma clínica",
  });
}

export function hasMindosPermission(
  membership: { role: string; permissionsJson: string },
  permission: string
) {
  let permissions: string[] = [];
  try {
    permissions = JSON.parse(membership.permissionsJson || "[]") as string[];
  } catch {
    permissions = [];
  }
  if (
    !Array.isArray(permissions) ||
    !permissions.every(value => typeof value === "string")
  )
    permissions = [];
  const elevated = ["OWNER", "CLINIC_ADMIN", "SUPER_ADMIN"].includes(
    membership.role
  );
  return (
    elevated || permissions.includes("ALL") || permissions.includes(permission)
  );
}

export async function assertMindosPermission(
  userId: number,
  userRole: string,
  permission: string
) {
  const { tenant, membership } = await ensureMindosTenantForUser(
    userId,
    userRole
  );
  if (!hasMindosPermission(membership, permission)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Permissão insuficiente: ${permission}`,
    });
  }
  return { tenant, membership };
}

export async function getMindosDashboardData(userId: number, userRole: string) {
  const { tenant, membership } = await assertMindosPermission(
    userId,
    userRole,
    "VIEW_PATIENT_BASIC"
  );
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  const patients = await db
    .select()
    .from(mindosPatients)
    .where(eq(mindosPatients.tenantId, tenant.id));
  const appointments = await db
    .select()
    .from(mindosAppointments)
    .where(eq(mindosAppointments.tenantId, tenant.id))
    .orderBy(mindosAppointments.startsAt);
  const authorizedAppointments = hasMindosPermission(
    membership,
    "MANAGE_APPOINTMENTS"
  )
    ? appointments
    : [];
  const today = clinicParts(new Date(), tenant.timezone).date;
  const daySessions = authorizedAppointments.filter(
    a => clinicParts(a.startsAt, tenant.timezone).date === today
  );
  return {
    tenant,
    metrics: {
      sessionsToday: daySessions.filter(
        a => !["CANCELLED", "RESCHEDULED"].includes(a.status)
      ).length,
      confirmed: daySessions.filter(a => a.status === "CONFIRMED").length,
      waiting: daySessions.filter(a => a.status === "WAITING").length,
      activePatients: patients.filter(p => p.administrativeStatus === "ACTIVE")
        .length,
      newPatients: patients.filter(p => p.administrativeStatus === "LEAD")
        .length,
      futureSessions: authorizedAppointments.filter(
        a =>
          new Date(a.startsAt) >= new Date() &&
          !["CANCELLED", "RESCHEDULED"].includes(a.status)
      ).length,
    },
    appointments: authorizedAppointments,
    patients,
  };
}

export async function listMindosAppointments(userId: number, userRole: string) {
  const { tenant } = await assertMindosPermission(
    userId,
    userRole,
    "MANAGE_APPOINTMENTS"
  );
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  const appointments = await db
    .select()
    .from(mindosAppointments)
    .where(eq(mindosAppointments.tenantId, tenant.id))
    .orderBy(mindosAppointments.startsAt);
  const patientIds = Array.from(
    new Set(appointments.map(item => item.patientId))
  );
  const patients =
    patientIds.length > 0
      ? await db
          .select()
          .from(mindosPatients)
          .where(
            and(
              eq(mindosPatients.tenantId, tenant.id),
              inArray(mindosPatients.id, patientIds)
            )
          )
      : [];
  const patientMap = new Map(patients.map(patient => [patient.id, patient]));
  return appointments.map(appointment => ({
    ...appointment,
    patient: patientMap.get(appointment.patientId) || null,
  }));
}

export async function createMindosAppointment(
  userId: number,
  userRole: string,
  input: {
    patientId: number;
    professionalName: string;
    unitName: string;
    serviceType: string;
    mode: "IN_PERSON" | "ONLINE";
    status?: "SCHEDULED" | "CONFIRMED";
    startsAt: Date;
    endsAt: Date;
    recurrenceId?: string;
  }
) {
  const { tenant } = await assertMindosPermission(
    userId,
    userRole,
    "MANAGE_APPOINTMENTS"
  );
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const [patient] = await db
    .select()
    .from(mindosPatients)
    .where(
      and(
        eq(mindosPatients.tenantId, tenant.id),
        eq(mindosPatients.id, input.patientId)
      )
    );
  if (!patient)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Paciente não encontrado nesta clínica",
    });
  if (["INACTIVE", "CLOSED"].includes(patient.administrativeStatus))
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Reative o paciente antes de agendar",
    });
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      "Use a nova agenda com profissional, unidade e serviço cadastrados",
  });
}

export async function getMindosPatient360(
  userId: number,
  userRole: string,
  patientId: number
) {
  const { tenant, membership } = await assertMindosPermission(
    userId,
    userRole,
    "VIEW_PATIENT_BASIC"
  );
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  const patientRows = await db
    .select()
    .from(mindosPatients)
    .where(
      and(
        eq(mindosPatients.id, patientId),
        eq(mindosPatients.tenantId, tenant.id)
      )
    )
    .limit(1);
  if (!patientRows[0])
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Paciente não encontrado nesta clínica",
    });
  await db.insert(mindosAccessAudits).values({
    tenantId: tenant.id,
    actorUserId: userId,
    subjectType: "PATIENT",
    subjectId: patientId,
    dataLayer: "ADMINISTRATIVE",
    action: "VIEW_PATIENT_360",
    reason: "Consulta operacional",
  });
  const appointments = await db
    .select()
    .from(mindosAppointments)
    .where(
      and(
        eq(mindosAppointments.tenantId, tenant.id),
        eq(mindosAppointments.patientId, patientId)
      )
    )
    .orderBy(desc(mindosAppointments.startsAt));
  const { portalUserId, ...patient } = patientRows[0];
  return {
    patient,
    appointments: hasMindosPermission(membership, "MANAGE_APPOINTMENTS")
      ? appointments
      : [],
  };
}

export async function listMindosFinancialRules(
  userId: number,
  userRole: string
) {
  const { tenant } = await assertMindosPermission(
    userId,
    userRole,
    "VIEW_FINANCIAL"
  );
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  return await db
    .select()
    .from(mindosFinancialRules)
    .where(
      and(
        eq(mindosFinancialRules.tenantId, tenant.id),
        eq(mindosFinancialRules.active, true)
      )
    );
}

export async function createMindosRecurringAppointments(
  userId: number,
  userRole: string,
  input: {
    patientId: number;
    professionalName: string;
    unitName: string;
    serviceType: string;
    mode: "IN_PERSON" | "ONLINE";
    startsAt: Date;
    endsAt: Date;
    count: number;
    intervalWeeks: number;
  }
) {
  if (input.count < 1 || input.count > 24)
    throw new Error("A série deve ter entre 1 e 24 ocorrências");
  if (input.intervalWeeks < 1 || input.intervalWeeks > 8)
    throw new Error("O intervalo deve estar entre 1 e 8 semanas");
  const recurrenceId = `rec-${Date.now()}-${userId}`;
  const created = [];
  for (let index = 0; index < input.count; index += 1) {
    const startsAt = new Date(
      input.startsAt.getTime() +
        index * input.intervalWeeks * 7 * 24 * 60 * 60 * 1000
    );
    const endsAt = new Date(
      input.endsAt.getTime() +
        index * input.intervalWeeks * 7 * 24 * 60 * 60 * 1000
    );
    created.push(
      await createMindosAppointment(userId, userRole, {
        ...input,
        startsAt,
        endsAt,
        recurrenceId,
      })
    );
  }
  return { recurrenceId, appointments: created };
}

async function careUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco indisponível");
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Conta não encontrada",
    });
  return user;
}
export async function listMindosClinicalRecords(
  userId: number,
  _role: string,
  patientId: number
) {
  return (await import("./clinical")).listClinical(
    await careUser(userId),
    patientId
  );
}
export async function createMindosClinicalRecord(
  userId: number,
  _role: string,
  input: {
    patientId: number;
    appointmentId?: number;
    recordType:
      | "ANAMNESIS"
      | "EVOLUTION"
      | "RESTRICTED_NOTE"
      | "GOAL"
      | "CARE_PLAN";
    content: string;
  }
) {
  return (await import("./clinical")).createClinical(
    await careUser(userId),
    input
  );
}
export async function finalizeMindosClinicalRecord(
  userId: number,
  _role: string,
  recordId: number,
  revision: number
) {
  await (
    await import("./clinical")
  ).updateClinical(await careUser(userId), {
    recordId,
    revision,
    finalize: true,
  });
  return true;
}

async function getMindosPublicTenant() {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  const slug = process.env.PUBLIC_TENANT_SLUG;
  if (!slug)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Clínica pública não configurada",
    });
  const rows = await db
    .select()
    .from(mindosTenants)
    .where(
      and(eq(mindosTenants.status, "ACTIVE"), eq(mindosTenants.slug, slug))
    )
    .limit(1);
  if (!rows[0]) throw new Error("Nenhum tenant MindOS ativo encontrado");
  return { db, tenant: rows[0] };
}

export async function listMindosBookingRequests(
  userId: number,
  userRole: string
) {
  const { tenant } = await assertMindosPermission(
    userId,
    userRole,
    "VIEW_ADMINISTRATIVE"
  );
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  return db
    .select()
    .from(mindosBookingRequests)
    .where(eq(mindosBookingRequests.tenantId, tenant.id))
    .orderBy(desc(mindosBookingRequests.createdAt));
}

export async function listMindosPortalData(userId: number, _role: string) {
  return (await import("./portal-care")).portalData(await careUser(userId));
}

export async function createMindosReceptionEvent(
  userId: number,
  userRole: string,
  input: {
    patientId: number;
    eventType: "CHECK_IN" | "MESSAGE_SENT" | "CALL_LOGGED" | "PROFILE_REVIEWED";
    messageTemplate?: string;
    appointmentId?: number;
  }
) {
  const { tenant } = await assertMindosPermission(
    userId,
    userRole,
    "VIEW_ADMINISTRATIVE"
  );
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  const [patient] = await db
    .select()
    .from(mindosPatients)
    .where(
      and(
        eq(mindosPatients.id, input.patientId),
        eq(mindosPatients.tenantId, tenant.id)
      )
    )
    .limit(1);
  if (!patient)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Paciente não encontrado nesta clínica",
    });
  if (input.eventType === "CHECK_IN")
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Faça check-in na sessão selecionada na nova recepção",
    });
  if (input.eventType === "MESSAGE_SENT")
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Envio de mensagens depende de provedor na etapa 6",
    });
  if (input.appointmentId) {
    const [session] = await db
      .select()
      .from(mindosAppointments)
      .where(
        and(
          eq(mindosAppointments.tenantId, tenant.id),
          eq(mindosAppointments.id, input.appointmentId),
          eq(mindosAppointments.patientId, input.patientId)
        )
      );
    if (!session)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Sessão não encontrada para este paciente",
      });
  }
  const [result] = await db
    .insert(mindosReceptionEvents)
    .values({ tenantId: tenant.id, createdByUserId: userId, ...input });
  await db.insert(mindosAccessAudits).values({
    tenantId: tenant.id,
    actorUserId: userId,
    subjectType: "PATIENT",
    subjectId: input.patientId,
    dataLayer: "ADMINISTRATIVE",
    action: input.eventType,
    reason: "Evento operacional de recepção",
  });
  return Number((result as any).insertId);
}

export async function getMindosInstitutionalProfile(
  userId: number,
  userRole: string
) {
  const { tenant } = await assertMindosPermission(
    userId,
    userRole,
    "VIEW_ADMINISTRATIVE"
  );
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  return db
    .select()
    .from(mindosInstitutionalProfiles)
    .where(eq(mindosInstitutionalProfiles.tenantId, tenant.id))
    .limit(1);
}

export async function saveMindosInstitutionalProfile(
  userId: number,
  userRole: string,
  input: {
    title: string;
    metaDescription: string;
    city?: string;
    faqJson: string;
    llmsTxt: string;
  }
) {
  const { tenant } = await assertMindosPermission(
    userId,
    userRole,
    "MANAGE_PUBLIC_SITE"
  );
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      "Use o rascunho versionado no Admin Studio; alterações públicas exigem aprovação e publicação.",
  });
}

export async function listMindosServiceAreas() {
  const { db, tenant } = await getMindosPublicTenant();
  return db
    .select()
    .from(mindosServiceAreas)
    .where(
      and(
        eq(mindosServiceAreas.tenantId, tenant.id),
        eq(mindosServiceAreas.active, true)
      )
    )
    .orderBy(mindosServiceAreas.sortOrder);
}

export async function listMindosReceptionQueue(
  userId: number,
  userRole: string
) {
  const { tenant } = await assertMindosPermission(
    userId,
    userRole,
    "VIEW_ADMINISTRATIVE"
  );
  const db = await getDb();
  if (!db) throw new Error("Banco de dados não disponível");
  const [appointments, patients, events] = await Promise.all([
    db
      .select()
      .from(mindosAppointments)
      .where(eq(mindosAppointments.tenantId, tenant.id))
      .orderBy(mindosAppointments.startsAt),
    db
      .select()
      .from(mindosPatients)
      .where(eq(mindosPatients.tenantId, tenant.id)),
    db
      .select()
      .from(mindosReceptionEvents)
      .where(eq(mindosReceptionEvents.tenantId, tenant.id))
      .orderBy(desc(mindosReceptionEvents.createdAt)),
  ]);
  const patientMap = new Map(patients.map(patient => [patient.id, patient]));
  const eventMap = new Map<number, (typeof events)[number]>();
  for (const event of events)
    if (!eventMap.has(event.patientId)) eventMap.set(event.patientId, event);
  return appointments.map(appointment => {
    const patient = patientMap.get(appointment.patientId);
    const event = eventMap.get(appointment.patientId);
    return {
      id: appointment.patientId,
      appointmentId: appointment.id,
      name: patient?.preferredName || patient?.fullName || "Paciente",
      time: new Date(appointment.startsAt).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      status: appointment.status,
      channel: patient?.preferredChannel || "WHATSAPP_DISCREET",
      lastEvent: event?.eventType || null,
    };
  });
}
