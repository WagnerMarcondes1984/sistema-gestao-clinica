import { siteSlug } from "./public-site";
import { z } from "zod";
export const positiveId = z.number().int().positive();
export const civilDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(value => {
    const date = new Date(`${value}T12:00:00Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Data inválida");
export const civilTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const timezoneInput = z
  .string()
  .max(64)
  .refine(value => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "Fuso IANA inválido");
export function clinicParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}
export function addCivilDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function civilToInstant(date: string, time: string, timezone: string) {
  civilDate.parse(date);
  civilTime.parse(time);
  timezoneInput.parse(timezone);
  const nominal = Date.parse(`${date}T${time}:00Z`);
  const offsets = new Set<number>();
  for (const shift of [-36, 0, 36]) {
    const sample = nominal + shift * 3600000;
    const p = clinicParts(new Date(sample), timezone);
    offsets.add(Date.parse(`${p.date}T${p.time}:00Z`) - sample);
  }
  const candidates = [...offsets]
    .map(offset => new Date(nominal - offset))
    .filter(value => {
      const p = clinicParts(value, timezone);
      return p.date === date && p.time === time;
    });
  if (candidates.length !== 1)
    throw new Error(
      "Horário inexistente ou ambíguo neste fuso. Escolha outro horário."
    );
  return candidates[0];
}
export const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Agendada",
  CONFIRMED: "Confirmada",
  ARRIVED: "Chegou",
  WAITING: "Aguardando",
  IN_PROGRESS: "Em atendimento",
  COMPLETED: "Concluída",
  NO_SHOW: "Falta",
  CANCELLED: "Cancelada",
  RESCHEDULED: "Reagendada",
};
export const TRANSITIONS: Record<string, readonly string[]> = {
  SCHEDULED: ["CONFIRMED", "WAITING", "CANCELLED", "NO_SHOW"],
  CONFIRMED: ["WAITING", "CANCELLED", "NO_SHOW"],
  ARRIVED: ["WAITING", "IN_PROGRESS", "CANCELLED"],
  WAITING: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: [],
  NO_SHOW: [],
  CANCELLED: [],
  RESCHEDULED: [],
};
export const appointmentInput = z
  .object({
    patientId: positiveId,
    professionalId: positiveId,
    unitId: positiveId,
    serviceId: positiveId,
    mode: z.enum(["ONLINE", "IN_PERSON"]),
    date: civilDate,
    time: civilTime,
    count: z.number().int().min(1).max(24).default(1),
    intervalWeeks: z.number().int().min(1).max(8).default(1),
  })
  .strict();
export type AppointmentInput = z.infer<typeof appointmentInput>;
export const configInput = z
  .object({
    kind: z.enum(["professional", "unit", "service", "availability"]),
    id: positiveId.optional(),
    revision: positiveId.optional(),
    name: z.string().trim().min(2).max(160).optional(),
    registration: z.string().trim().max(80).optional(),
    userId: positiveId.nullable().optional(),
    durationMinutes: z.number().int().min(10).max(240).optional(),
    mode: z.enum(["BOTH", "ONLINE", "IN_PERSON"]).optional(),
    publicEnabled: z.boolean().optional(),
    professionalId: positiveId.optional(),
    unitId: positiveId.optional(),
    weekday: z.number().int().min(0).max(6).optional(),
    startMinute: z.number().int().min(0).max(1439).optional(),
    endMinute: z.number().int().min(1).max(1440).optional(),
    active: z.boolean(),
  })
  .strict()
  .refine(
    input => !input.id || Boolean(input.revision),
    "Revisão obrigatória para editar"
  );
export const publicBookingInput = z
  .object({
    clinicSlug: siteSlug.optional(),
    name: z.string().trim().min(2).max(160),
    contactChannel: z.enum(["EMAIL", "PHONE", "WHATSAPP_DISCREET"]),
    contactValue: z.string().trim().min(5).max(200),
    serviceId: positiveId,
    date: civilDate,
    time: civilTime,
    consent: z.literal(true),
    website: z.string().max(200).default(""),
  })
  .strict()
  .refine(
    v =>
      v.contactChannel === "EMAIL"
        ? z.email().safeParse(v.contactValue).success
        : /^[+()\d\s.\-]+$/.test(v.contactValue) &&
          v.contactValue.replace(/\D/g, "").length >= 10 &&
          v.contactValue.replace(/\D/g, "").length <= 15,
    "Contato inválido"
  );
