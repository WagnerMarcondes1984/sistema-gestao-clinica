import { z } from "zod";
import { patientInput, normalizePatientPhone } from "./patients";
export const crmId = z.number().int().positive().max(2147483647);
export const CRM_STAGES = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "CONVERTED",
  "LOST",
] as const;
export const CRM_STAGE_LABELS = {
  NEW: "Novo",
  CONTACTED: "Em contato",
  QUALIFIED: "Qualificado",
  CONVERTED: "Convertido",
  LOST: "Perdido",
};
export const date = z.coerce
  .date()
  .refine(
    d => d.getUTCFullYear() >= 2000 && d.getUTCFullYear() <= 2036,
    "Data fora do intervalo suportado"
  );
export const leadInput = z
  .object({
    requestKey: z.string().uuid(),
    fullName: patientInput.shape.fullName,
    email: patientInput.shape.email,
    phone: patientInput.shape.phone,
    source: z.enum(["MANUAL", "REFERRAL", "OTHER"]).default("MANUAL"),
    ownerUserId: crmId.nullable().default(null),
    nextContactAt: date.nullable().default(null),
    preferredChannel: patientInput.shape.preferredChannel,
    contactAllowed: z.boolean().default(false),
  })
  .strict()
  .refine(i => Boolean(i.email || i.phone), "Informe e-mail ou telefone");
export const leadUpdate = z
  .object({
    leadId: crmId,
    revision: crmId,
    stage: z.enum(["NEW", "CONTACTED", "QUALIFIED", "LOST"]),
    ownerUserId: crmId.nullable(),
    nextContactAt: date.nullable(),
    contactAllowed: z.boolean(),
    reason: z.string().trim().max(500).default(""),
  })
  .strict();
export const taskInput = z
  .object({
    requestKey: z.string().uuid(),
    leadId: crmId.optional(),
    patientId: crmId.optional(),
    title: z.string().trim().min(3).max(180),
    kind: z.enum(["FOLLOW_UP", "RETURN"]).default("FOLLOW_UP"),
    ownerUserId: crmId,
    dueAt: date,
  })
  .strict()
  .refine(
    i => Boolean(i.leadId) !== Boolean(i.patientId),
    "Escolha somente lead ou paciente"
  );
export const interactionInput = z
  .object({
    requestKey: z.string().uuid(),
    leadId: crmId.optional(),
    patientId: crmId.optional(),
    channel: z.enum([
      "PHONE",
      "EMAIL",
      "WHATSAPP_DISCREET",
      "IN_PERSON",
      "INTERNAL",
    ]),
    outcome: z.enum(["ATTEMPTED", "REACHED", "NO_RESPONSE", "NOTE"]),
    summary: z.string().trim().min(3).max(1000),
  })
  .strict()
  .refine(
    i => Boolean(i.leadId) !== Boolean(i.patientId),
    "Escolha somente lead ou paciente"
  );
export const preferenceInput = z
  .object({
    revision: z.number().int().min(0),
    emailAllowed: z.boolean(),
    whatsappAllowed: z.boolean(),
  })
  .strict();
export function sameLead(
  a: { fullName: string; email: string | null; phone: string | null },
  b: { fullName: string; email: string | null; phone: string | null }
) {
  const name = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, " ");
  return (
    name(a.fullName) === name(b.fullName) &&
    Boolean(
      (a.email && b.email && a.email.toLowerCase() === b.email.toLowerCase()) ||
        (a.phone &&
          b.phone &&
          normalizePatientPhone(a.phone) === normalizePatientPhone(b.phone))
    )
  );
}
export const CRM_TRANSITIONS: Record<string, readonly string[]> = {
  NEW: ["CONTACTED", "QUALIFIED", "LOST"],
  CONTACTED: ["QUALIFIED", "LOST"],
  QUALIFIED: ["CONTACTED", "LOST"],
  LOST: ["NEW"],
};
