import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { assertMindosPermission, getDb, hasMindosPermission } from "./db";
import {
  mindosTenants,
  mindosMemberships,
  mindosPatients,
  mindosAppointments,
  mindosProfessionals,
  mindosUnits,
  mindosServices,
  mindosAvailability,
  mindosReceptionEvents,
  mindosAccessAudits,
  mindosBookingRequests,
  mindosBookingLimits,
  users,
  type User,
} from "../drizzle/schema";
import {
  clinicParts,
  civilToInstant,
  addCivilDays,
  TRANSITIONS,
  configInput,
  type AppointmentInput,
  publicBookingInput,
} from "../shared/scheduling";
import {
  normalizePatientName,
  normalizePatientPhone,
} from "../shared/patients";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Clinic = typeof mindosTenants.$inferSelect;
const failure = (
  code:
    | "BAD_REQUEST"
    | "NOT_FOUND"
    | "CONFLICT"
    | "FORBIDDEN"
    | "PRECONDITION_FAILED"
    | "TOO_MANY_REQUESTS",
  message: string
): never => {
  throw new TRPCError({ code, message });
};
const missing = (): never =>
  failure("NOT_FOUND", "Registro não encontrado nesta clínica");
async function database() {
  const db = await getDb();
  if (!db) return failure("PRECONDITION_FAILED", "Banco indisponível");
  return db;
}
async function audit(
  tx: Tx,
  tenantId: number,
  userId: number,
  type: string,
  id: number,
  action: string
) {
  await tx.insert(mindosAccessAudits).values({
    tenantId,
    actorUserId: userId,
    subjectType: type,
    subjectId: id,
    dataLayer: "ADMINISTRATIVE",
    action,
    reason: "Operação de agenda e recepção",
  });
}
async function withClinic<T>(
  user: User,
  permission: string,
  action: (tx: Tx, clinic: Clinic) => Promise<T>
) {
  const { tenant } = await assertMindosPermission(
    user.id,
    user.role,
    permission
  );
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
      !hasMindosPermission(member, permission)
    )
      return failure("FORBIDDEN", "Acesso revogado");
    return action(tx, clinic);
  });
}
export async function schedulingContext(user: User) {
  const { tenant, membership } = await assertMindosPermission(
    user.id,
    user.role,
    "VIEW_PATIENT_BASIC"
  );
  const db = await database();
  const [professionals, units, services, availability] = await Promise.all([
    db
      .select()
      .from(mindosProfessionals)
      .where(eq(mindosProfessionals.tenantId, tenant.id)),
    db.select().from(mindosUnits).where(eq(mindosUnits.tenantId, tenant.id)),
    db
      .select()
      .from(mindosServices)
      .where(eq(mindosServices.tenantId, tenant.id)),
    db
      .select()
      .from(mindosAvailability)
      .where(eq(mindosAvailability.tenantId, tenant.id)),
  ]);
  const canConfigure = hasMindosPermission(membership, "MANAGE_TEAM");
  const accounts = canConfigure
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
        .innerJoin(mindosMemberships, eq(users.id, mindosMemberships.userId))
        .where(
          and(
            eq(mindosMemberships.tenantId, tenant.id),
            eq(mindosMemberships.active, true)
          )
        )
    : [];
  return {
    clinic: { name: tenant.name, timezone: tenant.timezone },
    professionals,
    units,
    services,
    availability,
    accounts,
    canConfigure,
    canSchedule: hasMindosPermission(membership, "MANAGE_APPOINTMENTS"),
    canReceive: hasMindosPermission(membership, "VIEW_ADMINISTRATIVE"),
  };
}
export async function saveSchedulingConfig(
  user: User,
  input: z.infer<typeof configInput>
) {
  return withClinic(user, "MANAGE_TEAM", async (tx, clinic) => {
    const table =
      input.kind === "professional"
        ? mindosProfessionals
        : input.kind === "unit"
          ? mindosUnits
          : input.kind === "service"
            ? mindosServices
            : mindosAvailability;
    const [current] = input.id
      ? await tx
          .select({ id: table.id, revision: table.revision })
          .from(table)
          .where(and(eq(table.tenantId, clinic.id), eq(table.id, input.id)))
          .for("update")
      : [];
    if (input.id && !current) return missing();
    if (current && current.revision !== input.revision)
      return failure(
        "CONFLICT",
        "Cadastro alterado. Recarregue antes de salvar."
      );
    const revision = (current?.revision || 0) + 1;
    let resultId = input.id || 0;
    if (input.kind === "availability") {
      if (
        !input.professionalId ||
        !input.unitId ||
        input.weekday === undefined ||
        input.startMinute === undefined ||
        input.endMinute === undefined ||
        input.endMinute <= input.startMinute
      )
        return failure(
          "BAD_REQUEST",
          "Preencha profissional, unidade, dia e intervalo válido"
        );
      const [professional] = await tx
        .select()
        .from(mindosProfessionals)
        .where(
          and(
            eq(mindosProfessionals.tenantId, clinic.id),
            eq(mindosProfessionals.id, input.professionalId)
          )
        );
      const [unit] = await tx
        .select()
        .from(mindosUnits)
        .where(
          and(
            eq(mindosUnits.tenantId, clinic.id),
            eq(mindosUnits.id, input.unitId)
          )
        );
      if (
        !professional ||
        !unit ||
        (input.active && (!professional.active || !unit.active))
      )
        return failure(
          "BAD_REQUEST",
          "Profissional ou unidade inválido nesta clínica"
        );
      const windows = await tx
        .select()
        .from(mindosAvailability)
        .where(
          and(
            eq(mindosAvailability.tenantId, clinic.id),
            eq(mindosAvailability.professionalId, input.professionalId),
            eq(mindosAvailability.weekday, input.weekday)
          )
        );
      if (
        input.active &&
        windows.some(
          w =>
            w.id !== input.id &&
            w.active &&
            input.startMinute! < w.endMinute &&
            input.endMinute! > w.startMinute
        )
      )
        return failure(
          "CONFLICT",
          "Disponibilidade sobreposta para este profissional"
        );
      const values = {
        professionalId: input.professionalId,
        unitId: input.unitId,
        weekday: input.weekday,
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        active: input.active,
        revision,
      };
      if (input.id)
        await tx
          .update(mindosAvailability)
          .set(values)
          .where(eq(mindosAvailability.id, input.id));
      else {
        const [r] = await tx
          .insert(mindosAvailability)
          .values({ ...values, tenantId: clinic.id });
        resultId = r.insertId;
      }
    } else {
      if (!input.name || (input.kind === "unit" && input.name.length > 128))
        return failure("BAD_REQUEST", "Informe um nome válido");
      const values = {
        name: input.name,
        nameKey: normalizePatientName(input.name),
        active: input.active,
        revision,
      };
      const namedTable =
        input.kind === "professional"
          ? mindosProfessionals
          : input.kind === "unit"
            ? mindosUnits
            : mindosServices;
      const same = await tx
        .select({ id: namedTable.id })
        .from(namedTable)
        .where(
          and(
            eq(namedTable.tenantId, clinic.id),
            eq(namedTable.nameKey, values.nameKey)
          )
        );
      if (same.some(row => row.id !== input.id))
        return failure(
          "CONFLICT",
          "Já existe um cadastro com este nome nesta clínica"
        );
      if (input.kind === "professional") {
        if (input.userId) {
          const [member] = await tx
            .select()
            .from(mindosMemberships)
            .where(
              and(
                eq(mindosMemberships.tenantId, clinic.id),
                eq(mindosMemberships.userId, input.userId),
                eq(mindosMemberships.active, true)
              )
            );
          if (
            !member ||
            !["OWNER", "CLINIC_ADMIN", "SUPER_ADMIN", "PSYCHOLOGIST"].includes(
              member.role
            )
          )
            return failure(
              "BAD_REQUEST",
              "Conta profissional deve ter associação clínica ativa e papel clínico"
            );
          const links = await tx
            .select()
            .from(mindosProfessionals)
            .where(
              and(
                eq(mindosProfessionals.tenantId, clinic.id),
                eq(mindosProfessionals.userId, input.userId)
              )
            );
          if (links.some(row => row.id !== input.id))
            return failure(
              "CONFLICT",
              "Conta já vinculada a outro profissional"
            );
        }
        const fields = {
          ...values,
          registration: input.registration || null,
          userId: input.userId || null,
        };
        if (input.id)
          await tx
            .update(mindosProfessionals)
            .set(fields)
            .where(eq(mindosProfessionals.id, input.id));
        else {
          const [r] = await tx
            .insert(mindosProfessionals)
            .values({ ...fields, tenantId: clinic.id });
          resultId = r.insertId;
        }
      } else if (input.kind === "unit") {
        if (input.id)
          await tx
            .update(mindosUnits)
            .set(values)
            .where(eq(mindosUnits.id, input.id));
        else {
          const [r] = await tx
            .insert(mindosUnits)
            .values({ ...values, tenantId: clinic.id });
          resultId = r.insertId;
        }
      } else {
        if (
          !input.durationMinutes ||
          !input.mode ||
          input.publicEnabled === undefined
        )
          return failure(
            "BAD_REQUEST",
            "Informe duração, modalidade e publicação do serviço"
          );
        const fields = {
          ...values,
          durationMinutes: input.durationMinutes,
          mode: input.mode,
          publicEnabled: input.publicEnabled,
        };
        if (input.id)
          await tx
            .update(mindosServices)
            .set(fields)
            .where(eq(mindosServices.id, input.id));
        else {
          const [r] = await tx
            .insert(mindosServices)
            .values({ ...fields, tenantId: clinic.id });
          resultId = r.insertId;
        }
      }
    }
    await audit(
      tx,
      clinic.id,
      user.id,
      "SCHEDULE_CONFIG",
      resultId,
      `SAVE_${input.kind.toUpperCase()}`
    );
    return { id: resultId, revision };
  });
}
export async function saveClinicTimezone(
  user: User,
  timezone: string,
  expected: string
) {
  return withClinic(user, "MANAGE_TEAM", async (tx, clinic) => {
    if (clinic.timezone !== expected)
      return failure("CONFLICT", "Fuso alterado. Recarregue.");
    if (timezone !== clinic.timezone) {
      const sessions = await tx
        .select({
          startsAt: mindosAppointments.startsAt,
          status: mindosAppointments.status,
        })
        .from(mindosAppointments)
        .where(eq(mindosAppointments.tenantId, clinic.id));
      if (
        sessions.some(
          s =>
            s.startsAt >= new Date() &&
            !["CANCELLED", "RESCHEDULED", "NO_SHOW"].includes(s.status)
        )
      )
        return failure(
          "CONFLICT",
          "Cancele ou revise as sessões futuras antes de trocar o fuso da clínica"
        );
      await tx
        .update(mindosTenants)
        .set({ timezone })
        .where(eq(mindosTenants.id, clinic.id));
      await audit(
        tx,
        clinic.id,
        user.id,
        "CLINIC",
        clinic.id,
        "CHANGE_TIMEZONE"
      );
    }
    return { timezone };
  });
}
const blocking = (status: string) =>
  !["CANCELLED", "RESCHEDULED", "NO_SHOW"].includes(status);
async function buildOccurrences(
  tx: Tx,
  clinic: Clinic,
  input: AppointmentInput,
  ignored: number[] = [],
  explicitDates?: string[]
) {
  const [patient] = await tx
    .select()
    .from(mindosPatients)
    .where(
      and(
        eq(mindosPatients.tenantId, clinic.id),
        eq(mindosPatients.id, input.patientId)
      )
    )
    .for("update");
  if (!patient) return missing();
  if (["INACTIVE", "CLOSED"].includes(patient.administrativeStatus))
    return failure("BAD_REQUEST", "Reative o paciente antes de agendar");
  const [professional] = await tx
    .select()
    .from(mindosProfessionals)
    .where(
      and(
        eq(mindosProfessionals.tenantId, clinic.id),
        eq(mindosProfessionals.id, input.professionalId)
      )
    );
  const [unit] = await tx
    .select()
    .from(mindosUnits)
    .where(
      and(eq(mindosUnits.tenantId, clinic.id), eq(mindosUnits.id, input.unitId))
    );
  const [service] = await tx
    .select()
    .from(mindosServices)
    .where(
      and(
        eq(mindosServices.tenantId, clinic.id),
        eq(mindosServices.id, input.serviceId)
      )
    );
  if (!professional?.active || !unit?.active || !service?.active)
    return failure(
      "BAD_REQUEST",
      "Escolha profissional, unidade e serviço ativos desta clínica"
    );
  if (service.mode !== "BOTH" && service.mode !== input.mode)
    return failure("BAD_REQUEST", "Modalidade não permitida pelo serviço");
  if (professional.userId) {
    const [linked] = await tx
      .select()
      .from(mindosMemberships)
      .where(
        and(
          eq(mindosMemberships.tenantId, clinic.id),
          eq(mindosMemberships.userId, professional.userId),
          eq(mindosMemberships.active, true)
        )
      );
    if (
      !linked ||
      !["OWNER", "CLINIC_ADMIN", "SUPER_ADMIN", "PSYCHOLOGIST"].includes(
        linked.role
      )
    )
      return failure(
        "BAD_REQUEST",
        "A conta vinculada ao profissional não possui associação clínica ativa"
      );
  }
  const today = clinicParts(new Date(), clinic.timezone).date;
  const dates =
    explicitDates ||
    Array.from({ length: input.count }, (_, i) =>
      addCivilDays(input.date, i * input.intervalWeeks * 7)
    );
  if (dates.some(d => d < today || d > addCivilDays(today, 1460)))
    return failure(
      "BAD_REQUEST",
      "Escolha datas a partir de hoje, no limite de quatro anos"
    );
  const windows = await tx
    .select()
    .from(mindosAvailability)
    .where(
      and(
        eq(mindosAvailability.tenantId, clinic.id),
        eq(mindosAvailability.professionalId, input.professionalId),
        eq(mindosAvailability.unitId, input.unitId),
        eq(mindosAvailability.active, true)
      )
    );
  // A locking current read sees committed reservations after waiting on the clinic lock.
  const existing = await tx
    .select()
    .from(mindosAppointments)
    .where(eq(mindosAppointments.tenantId, clinic.id))
    .for("update");
  const occurrences = dates.map(date => {
    let startsAt: Date;
    try {
      startsAt = civilToInstant(date, input.time, clinic.timezone);
    } catch (error) {
      return failure("BAD_REQUEST", (error as Error).message);
    }
    const endsAt = new Date(
      startsAt.getTime() + service.durationMinutes * 60000
    );
    const end = clinicParts(endsAt, clinic.timezone);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const startMinute =
      Number(input.time.slice(0, 2)) * 60 + Number(input.time.slice(3));
    const endMinute =
      end.date === date
        ? Number(end.time.slice(0, 2)) * 60 + Number(end.time.slice(3))
        : end.date === addCivilDays(date, 1) && end.time === "00:00"
          ? 1440
          : 2000;
    if (
      !windows.some(
        w =>
          w.weekday === weekday &&
          startMinute >= w.startMinute &&
          endMinute <= w.endMinute
      )
    )
      return failure(
        "BAD_REQUEST",
        `Sessão fora da disponibilidade em ${date}`
      );
    const overlap = existing.some(
      a =>
        !ignored.includes(a.id) &&
        blocking(a.status) &&
        startsAt < a.endsAt &&
        endsAt > a.startsAt &&
        (a.professionalId === professional.id ||
          normalizePatientName(a.professionalName) === professional.nameKey ||
          a.patientId === patient.id)
    );
    if (overlap)
      return failure(
        "CONFLICT",
        `Conflito de profissional ou paciente em ${date} às ${input.time}`
      );
    return {
      tenantId: clinic.id,
      patientId: patient.id,
      professionalId: professional.id,
      professionalUserId: professional.userId,
      professionalName: professional.name,
      unitId: unit.id,
      unitName: unit.name,
      serviceId: service.id,
      serviceType: service.name,
      mode: input.mode,
      startsAt,
      endsAt,
      status: "SCHEDULED" as const,
    };
  });
  for (let i = 0; i < occurrences.length; i++)
    for (let j = 0; j < i; j++)
      if (
        occurrences[i].startsAt < occurrences[j].endsAt &&
        occurrences[i].endsAt > occurrences[j].startsAt
      )
        return failure("CONFLICT", "Ocorrências da série se sobrepõem");
  return occurrences;
}
async function insertOccurrences(
  tx: Tx,
  clinic: Clinic,
  user: User,
  input: AppointmentInput
) {
  const occurrences = await buildOccurrences(tx, clinic, input);
  const recurrenceId = input.count > 1 ? randomUUID() : null;
  const ids: number[] = [];
  for (const occurrence of occurrences) {
    const [r] = await tx
      .insert(mindosAppointments)
      .values({ ...occurrence, recurrenceId });
    ids.push(r.insertId);
    await audit(
      tx,
      clinic.id,
      user.id,
      "APPOINTMENT",
      r.insertId,
      "CREATE_APPOINTMENT"
    );
  }
  return { ids, recurrenceId };
}
export async function createAppointments(user: User, input: AppointmentInput) {
  return withClinic(user, "MANAGE_APPOINTMENTS", (tx, clinic) =>
    insertOccurrences(tx, clinic, user, input)
  );
}
export async function changeAppointment(
  user: User,
  input: { appointmentId: number; revision: number; status: string }
) {
  return withClinic(user, "MANAGE_APPOINTMENTS", async (tx, clinic) => {
    const [a] = await tx
      .select()
      .from(mindosAppointments)
      .where(
        and(
          eq(mindosAppointments.tenantId, clinic.id),
          eq(mindosAppointments.id, input.appointmentId)
        )
      )
      .for("update");
    if (!a) return missing();
    if (a.revision !== input.revision)
      return failure("CONFLICT", "Sessão alterada. Atualize a agenda.");
    if (!TRANSITIONS[a.status]?.includes(input.status))
      return failure("BAD_REQUEST", "Transição de sessão inválida");
    const now = new Date();
    if (
      input.status === "WAITING" &&
      clinicParts(a.startsAt, clinic.timezone).date !==
        clinicParts(now, clinic.timezone).date
    )
      return failure(
        "BAD_REQUEST",
        "Check-in permitido somente no dia da sessão, no fuso da clínica"
      );
    if (["IN_PROGRESS", "COMPLETED"].includes(input.status) && a.startsAt > now)
      return failure("BAD_REQUEST", "A sessão ainda não começou");
    if (input.status === "NO_SHOW" && a.endsAt > now)
      return failure(
        "BAD_REQUEST",
        "Registre falta somente após o término previsto"
      );
    await tx
      .update(mindosAppointments)
      .set({
        status: input.status as typeof a.status,
        revision: a.revision + 1,
      })
      .where(eq(mindosAppointments.id, a.id));
    if (input.status === "WAITING")
      await tx.insert(mindosReceptionEvents).values({
        tenantId: clinic.id,
        patientId: a.patientId,
        appointmentId: a.id,
        eventType: "CHECK_IN",
        createdByUserId: user.id,
      });
    await audit(
      tx,
      clinic.id,
      user.id,
      "APPOINTMENT",
      a.id,
      `STATUS_${input.status}`
    );
    return { id: a.id, revision: a.revision + 1 };
  });
}
export async function rescheduleAppointments(
  user: User,
  input: {
    appointmentId: number;
    revision: number;
    scope: "ONE" | "SERIES";
    data: AppointmentInput;
  }
) {
  return withClinic(user, "MANAGE_APPOINTMENTS", async (tx, clinic) => {
    const all = await tx
      .select()
      .from(mindosAppointments)
      .where(eq(mindosAppointments.tenantId, clinic.id))
      .for("update");
    const anchor = all.find(a => a.id === input.appointmentId);
    if (!anchor) return missing();
    if (anchor.revision !== input.revision)
      return failure("CONFLICT", "Sessão alterada. Recarregue.");
    if (
      !["SCHEDULED", "CONFIRMED"].includes(anchor.status) ||
      anchor.startsAt < new Date()
    )
      return failure(
        "BAD_REQUEST",
        "Somente sessões futuras agendadas ou confirmadas podem ser reagendadas"
      );
    if (input.data.patientId !== anchor.patientId)
      return failure("BAD_REQUEST", "Reagendamento não troca o paciente");
    if (input.scope === "SERIES" && !anchor.recurrenceId)
      return failure("BAD_REQUEST", "Sessão sem série recorrente");
    const targets =
      input.scope === "ONE"
        ? [anchor]
        : all.filter(
            a =>
              a.recurrenceId === anchor.recurrenceId &&
              a.patientId === anchor.patientId &&
              a.startsAt >= anchor.startsAt &&
              ["SCHEDULED", "CONFIRMED"].includes(a.status)
          );
    const oldDate = clinicParts(anchor.startsAt, clinic.timezone).date;
    const delta = Math.round(
      (Date.parse(`${input.data.date}T12:00:00Z`) -
        Date.parse(`${oldDate}T12:00:00Z`)) /
        86400000
    );
    const dates = targets.map(a =>
      addCivilDays(clinicParts(a.startsAt, clinic.timezone).date, delta)
    );
    const replacement = await buildOccurrences(
      tx,
      clinic,
      input.data,
      targets.map(a => a.id),
      dates
    );
    if (replacement.some(a => a.startsAt < new Date()))
      return failure("BAD_REQUEST", "Escolha um horário futuro para reagendar");
    const ids: number[] = [];
    for (let index = 0; index < targets.length; index++) {
      const previous = targets[index];
      const [r] = await tx
        .insert(mindosAppointments)
        .values({ ...replacement[index], recurrenceId: previous.recurrenceId });
      ids.push(r.insertId);
      await tx
        .update(mindosAppointments)
        .set({
          status: "RESCHEDULED",
          revision: previous.revision + 1,
          replacedByAppointmentId: r.insertId,
        })
        .where(eq(mindosAppointments.id, previous.id));
      await tx
        .update(mindosBookingRequests)
        .set({ appointmentId: r.insertId })
        .where(
          and(
            eq(mindosBookingRequests.tenantId, clinic.id),
            eq(mindosBookingRequests.appointmentId, previous.id)
          )
        );
      await audit(
        tx,
        clinic.id,
        user.id,
        "APPOINTMENT",
        previous.id,
        "RESCHEDULE_APPOINTMENT"
      );
      await audit(
        tx,
        clinic.id,
        user.id,
        "APPOINTMENT",
        r.insertId,
        "CREATE_RESCHEDULED_APPOINTMENT"
      );
    }
    return { ids };
  });
}
export async function listSchedule(
  user: User,
  date?: string,
  patientId?: number,
  reception = false
) {
  const { tenant, membership } = await assertMindosPermission(
    user.id,
    user.role,
    reception ? "VIEW_ADMINISTRATIVE" : "MANAGE_APPOINTMENTS"
  );
  const db = await database();
  const [sessions, patients, events] = await Promise.all([
    db
      .select()
      .from(mindosAppointments)
      .where(eq(mindosAppointments.tenantId, tenant.id))
      .orderBy(mindosAppointments.startsAt),
    db
      .select({
        id: mindosPatients.id,
        fullName: mindosPatients.fullName,
        preferredName: mindosPatients.preferredName,
        phone: mindosPatients.phone,
        email: mindosPatients.email,
      })
      .from(mindosPatients)
      .where(eq(mindosPatients.tenantId, tenant.id)),
    reception
      ? db
          .select()
          .from(mindosReceptionEvents)
          .where(eq(mindosReceptionEvents.tenantId, tenant.id))
          .orderBy(desc(mindosReceptionEvents.createdAt))
      : Promise.resolve([]),
  ]);
  const today = clinicParts(new Date(), tenant.timezone).date;
  const chosenDate = reception ? today : date;
  const patientMap = new Map(patients.map(p => [p.id, p]));
  const items = sessions
    .filter(
      a =>
        (!chosenDate ||
          clinicParts(a.startsAt, tenant.timezone).date === chosenDate) &&
        (!patientId || a.patientId === patientId)
    )
    .map(({ notesAdmin, ...a }) => ({
      ...a,
      patient: patientMap.get(a.patientId),
      local: clinicParts(a.startsAt, tenant.timezone),
      lastEvent: events.find(e => e.appointmentId === a.id)?.eventType || null,
    }));
  return {
    items,
    timezone: tenant.timezone,
    today,
    clinicName: tenant.name,
    canSchedule: hasMindosPermission(membership, "MANAGE_APPOINTMENTS"),
    metrics: {
      total: items.filter(a => !["CANCELLED", "RESCHEDULED"].includes(a.status))
        .length,
      waiting: items.filter(a => ["ARRIVED", "WAITING"].includes(a.status))
        .length,
      confirmed: items.filter(a => a.status === "CONFIRMED").length,
      completed: items.filter(a => a.status === "COMPLETED").length,
      arrivals: items.filter(a =>
        events.some(e => e.appointmentId === a.id && e.eventType === "CHECK_IN")
      ).length,
    },
  };
}

export async function publicSchedule() {
  const db = await database();
  if (!process.env.PUBLIC_TENANT_SLUG)
    return failure("PRECONDITION_FAILED", "Clínica pública não configurada");
  const [clinic] = await db
    .select()
    .from(mindosTenants)
    .where(
      and(
        eq(mindosTenants.slug, process.env.PUBLIC_TENANT_SLUG),
        eq(mindosTenants.status, "ACTIVE")
      )
    );
  if (!clinic) return missing();
  const services = await db
    .select({
      id: mindosServices.id,
      name: mindosServices.name,
      durationMinutes: mindosServices.durationMinutes,
    })
    .from(mindosServices)
    .where(
      and(
        eq(mindosServices.tenantId, clinic.id),
        eq(mindosServices.active, true),
        eq(mindosServices.publicEnabled, true)
      )
    );
  return {
    clinicId: clinic.id,
    clinicName: clinic.name,
    timezone: clinic.timezone,
    services,
  };
}
export async function requestPublicBooking(
  raw: z.infer<typeof publicBookingInput>,
  ip: string
) {
  const input = publicBookingInput.parse(raw);
  if (input.website) return failure("BAD_REQUEST", "Solicitação inválida");
  const context = await publicSchedule();
  const db = await database();
  return db.transaction(async tx => {
    const [clinic] = await tx
      .select()
      .from(mindosTenants)
      .where(eq(mindosTenants.id, context.clinicId))
      .for("update");
    if (clinic.status !== "ACTIVE") return missing();
    const [service] = await tx
      .select()
      .from(mindosServices)
      .where(
        and(
          eq(mindosServices.tenantId, clinic.id),
          eq(mindosServices.id, input.serviceId),
          eq(mindosServices.active, true),
          eq(mindosServices.publicEnabled, true)
        )
      );
    if (!service) return failure("BAD_REQUEST", "Serviço não disponível");
    const today = clinicParts(new Date(), clinic.timezone).date;
    if (input.date < today || input.date > addCivilDays(today, 365))
      return failure("BAD_REQUEST", "Escolha uma data entre hoje e um ano");
    try {
      if (civilToInstant(input.date, input.time, clinic.timezone) <= new Date())
        return failure("BAD_REQUEST", "Escolha um horário futuro");
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      return failure("BAD_REQUEST", (error as Error).message);
    }
    const contact =
      input.contactChannel === "EMAIL"
        ? input.contactValue.toLowerCase()
        : normalizePatientPhone(input.contactValue);
    const now = new Date();
    for (const limit of [
      { key: `ip:${ip}`, max: 10, milliseconds: 600000 },
      { key: `contact:${contact}`, max: 1, milliseconds: 600000 },
      { key: "clinic", max: 200, milliseconds: 86400000 },
    ]) {
      const hash = createHash("sha256")
        .update(`${clinic.id}:${limit.key}`)
        .digest("hex");
      const [previous] = await tx
        .select()
        .from(mindosBookingLimits)
        .where(
          and(
            eq(mindosBookingLimits.tenantId, clinic.id),
            eq(mindosBookingLimits.keyHash, hash)
          )
        )
        .for("update");
      const expired =
        !previous ||
        now.getTime() - previous.windowStart.getTime() >= limit.milliseconds;
      if (!expired && previous.attempts >= limit.max)
        return failure(
          "TOO_MANY_REQUESTS",
          "Aguarde antes de enviar outra solicitação"
        );
      if (previous)
        await tx
          .update(mindosBookingLimits)
          .set({
            attempts: expired ? 1 : previous.attempts + 1,
            windowStart: expired ? now : previous.windowStart,
          })
          .where(eq(mindosBookingLimits.id, previous.id));
      else
        await tx.insert(mindosBookingLimits).values({
          tenantId: clinic.id,
          keyHash: hash,
          windowStart: now,
          attempts: 1,
        });
    }
    const [r] = await tx.insert(mindosBookingRequests).values({
      tenantId: clinic.id,
      name: input.name,
      contactChannel: input.contactChannel,
      contactValue: contact,
      serviceId: service.id,
      serviceType: service.name,
      preferredDate: new Date(`${input.date}T12:00:00Z`),
      preferredTime: input.time,
    });
    return { requestId: r.insertId, status: "NEW" as const };
  });
}
export async function listBookingRequests(user: User) {
  const { tenant } = await assertMindosPermission(
    user.id,
    user.role,
    "VIEW_ADMINISTRATIVE"
  );
  const db = await database();
  return db
    .select()
    .from(mindosBookingRequests)
    .where(eq(mindosBookingRequests.tenantId, tenant.id))
    .orderBy(desc(mindosBookingRequests.createdAt));
}
export async function processBookingRequest(
  user: User,
  input: {
    requestId: number;
    revision: number;
    status: "CONTACTED" | "DECLINED" | "SPAM" | "CONFIRMED";
    appointment?: AppointmentInput;
  }
) {
  return withClinic(user, "MANAGE_APPOINTMENTS", async (tx, clinic) => {
    const [request] = await tx
      .select()
      .from(mindosBookingRequests)
      .where(
        and(
          eq(mindosBookingRequests.tenantId, clinic.id),
          eq(mindosBookingRequests.id, input.requestId)
        )
      )
      .for("update");
    if (!request) return missing();
    if (request.revision !== input.revision)
      return failure("CONFLICT", "Solicitação alterada. Recarregue.");
    if (
      !["NEW", "CONTACTED"].includes(request.status) ||
      (input.status === "CONFIRMED" && request.status !== "CONTACTED") ||
      (input.status === "CONTACTED" && request.status !== "NEW")
    )
      return failure("BAD_REQUEST", "Transição de solicitação inválida");
    let appointmentId: number | null = null,
      patientId: number | null = null;
    if (input.status === "CONFIRMED") {
      if (!input.appointment || input.appointment.count !== 1)
        return failure(
          "BAD_REQUEST",
          "Escolha paciente e uma sessão para confirmar"
        );
      const result = await insertOccurrences(
        tx,
        clinic,
        user,
        input.appointment
      );
      appointmentId = result.ids[0];
      await tx
        .update(mindosAppointments)
        .set({ status: "CONFIRMED" })
        .where(eq(mindosAppointments.id, appointmentId));
      patientId = input.appointment.patientId;
    }
    await tx
      .update(mindosBookingRequests)
      .set({
        status: input.status,
        appointmentId,
        patientId,
        revision: request.revision + 1,
      })
      .where(eq(mindosBookingRequests.id, request.id));
    await audit(
      tx,
      clinic.id,
      user.id,
      "BOOKING_REQUEST",
      request.id,
      `TRIAGE_${input.status}`
    );
    return { appointmentId, patientId };
  });
}
