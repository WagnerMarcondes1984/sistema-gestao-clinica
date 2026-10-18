import { z } from "zod";

export const PATIENT_STATUSES = [
  "LEAD",
  "ACTIVE",
  "INACTIVE",
  "CLOSED",
] as const;
export const PATIENT_STATUS_LABELS = {
  LEAD: "Em triagem",
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  CLOSED: "Encerrado",
};
export const CONTACT_CHANNEL_LABELS = {
  WHATSAPP_DISCREET: "WhatsApp discreto",
  EMAIL: "E-mail",
  PHONE: "Telefone",
};
export const normalizePatientName = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
export const normalizePatientPhone = (phone: string) =>
  phone.replace(/\D/g, "");

const optionalText = (max: number) => z.string().trim().max(max).default("");
export const patientInput = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Informe o nome completo")
      .max(160)
      .transform(s => s.replace(/\s+/g, " ")),
    preferredName: optionalText(96),
    email: optionalText(200)
      .refine(s => !s || z.email().safeParse(s).success, "E-mail inválido")
      .transform(s => s.toLowerCase()),
    phone: optionalText(40).refine(
      s =>
        !s ||
        (/^[+()\d\s.\-]+$/.test(s) &&
          normalizePatientPhone(s).length >= 10 &&
          normalizePatientPhone(s).length <= 15),
      "Telefone deve conter de 10 a 15 dígitos"
    ),
    birthDate: optionalText(10).refine(s => {
      if (!s) return true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
      const date = new Date(`${s}T12:00:00Z`);
      return (
        Number.isFinite(date.getTime()) &&
        date.toISOString().slice(0, 10) === s &&
        s >= "1900-01-01" &&
        s <= new Date().toISOString().slice(0, 10)
      );
    }, "Data de nascimento inválida ou futura"),
    administrativeStatus: z.enum(PATIENT_STATUSES).default("LEAD"),
    preferredChannel: z
      .enum(["WHATSAPP_DISCREET", "EMAIL", "PHONE"])
      .default("WHATSAPP_DISCREET"),
  })
  .strict();
export type PatientInput = z.infer<typeof patientInput>;
export const patientListInput = z
  .object({
    search: z.string().trim().max(160).default(""),
    status: z.enum([...PATIENT_STATUSES, "ALL"]).default("ALL"),
    page: z.number().int().min(1).max(100000).default(1),
    pageSize: z.number().int().min(1).max(100).default(20),
  })
  .strict();
