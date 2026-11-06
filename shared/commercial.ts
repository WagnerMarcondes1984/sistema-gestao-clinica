import { z } from "zod";
import { crmId } from "./crm";
export const SALES_STAGES = [
  "QUALIFICATION",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
] as const;
export const SALES_LABELS = {
  QUALIFICATION: "Qualificação",
  PROPOSAL: "Proposta",
  NEGOTIATION: "Negociação",
  WON: "Ganha",
  LOST: "Perdida",
};
export const SALES_TRANSITIONS: Record<string, readonly string[]> = {
  QUALIFICATION: ["PROPOSAL", "LOST"],
  PROPOSAL: ["NEGOTIATION", "LOST"],
  NEGOTIATION: ["WON", "LOST"],
  LOST: ["QUALIFICATION"],
  WON: [],
};
export const SOURCE_LABELS = {
  MANUAL: "Manual",
  REFERRAL: "Indicação",
  PUBLIC_BOOKING: "Solicitação online",
  OTHER: "Outra",
};
export const commercialMoney = z.number().int().min(0).max(1_000_000_000);
export const monthInput = z
  .string()
  .regex(
    /^20(?:[0-2]\d|3[0-6])-(?:0[1-9]|1[0-2])$/,
    "Informe mês e ano válidos"
  );
const title = z.string().trim().min(3).max(160);
const op = { opportunityId: crmId, revision: crmId };
export const opportunityInput = z
  .object({
    requestKey: z.string().uuid(),
    leadId: crmId,
    title,
    amount: commercialMoney,
    ownerUserId: crmId,
    expectedCloseDate: z
      .string()
      .regex(/^20\d{2}-\d{2}-\d{2}$/)
      .refine(
        s =>
          s >= "2000-01-01" &&
          s <= "2036-12-31" &&
          !Number.isNaN(Date.parse(s)) &&
          new Date(s).toISOString().slice(0, 10) === s,
        "Data inválida"
      ),
  })
  .strict();
export const opportunityEdit = opportunityInput
  .omit({ requestKey: true, leadId: true })
  .extend(op)
  .strict();
export const moveInput = z
  .object({
    ...op,
    stage: z.enum(SALES_STAGES),
    reason: z.string().trim().max(500).default(""),
    confirmed: z.boolean().default(false),
  })
  .strict();
export const proposalInput = z
  .object({
    requestKey: z.string().uuid(),
    ...op,
    title,
    quantity: z.number().int().min(1).max(1000),
    unitPrice: commercialMoney.refine(v => v > 0),
    discount: commercialMoney.default(0),
    validUntil: opportunityInput.shape.expectedCloseDate,
    terms: z.string().trim().min(8).max(1500),
  })
  .strict();
export const proposalDecision = z
  .object({
    proposalId: crmId,
    revision: crmId,
    status: z.enum(["PRESENTED", "ACCEPTED", "DECLINED", "CANCELLED"]),
    evidence: z.string().trim().min(8).max(500),
    confirmed: z.literal(true),
  })
  .strict();
export const goalInput = z
  .object({
    month: monthInput,
    ownerUserId: crmId.nullable(),
    targetAmount: commercialMoney.refine(v => v > 0),
    revision: z.number().int().min(0),
  })
  .strict();
export const commercialPreference = z
  .object({
    leadId: crmId,
    revision: z.number().int().min(0),
    emailAllowed: z.boolean(),
    whatsappAllowed: z.boolean(),
    reason: z.string().trim().min(8).max(500),
  })
  .strict();
export const ruleInput = z
  .object({
    id: crmId.optional(),
    revision: z.number().int().min(0),
    name: title,
    stage: z.enum(["QUALIFICATION", "PROPOSAL", "NEGOTIATION"]),
    channel: z.enum(["EMAIL", "WHATSAPP_DISCREET"]),
    delayDays: z.number().int().min(0).max(90),
    enabled: z.boolean(),
  })
  .strict()
  .refine(i => Boolean(i.id) === i.revision > 0, "Revise a versão da regra");
export const commercialFilter = z
  .object({
    ownerUserId: crmId.optional(),
    source: z
      .enum(["MANUAL", "REFERRAL", "PUBLIC_BOOKING", "OTHER"])
      .optional(),
    stage: z.enum(SALES_STAGES).optional(),
    channel: z.enum(["EMAIL", "WHATSAPP_DISCREET", "NONE"]).optional(),
    search: z.string().trim().max(80).default(""),
    page: z.number().int().min(0).max(100000).default(0),
  })
  .strict();
export const reportInput = commercialFilter
  .omit({ page: true, stage: true, channel: true, search: true })
  .extend({ month: monthInput })
  .strict();
export function proposalTotal(
  quantity: number,
  unitPrice: number,
  discount: number
) {
  const subtotal = quantity * unitPrice,
    total = subtotal - discount;
  if (
    ![quantity, unitPrice, discount, subtotal, total].every(
      Number.isSafeInteger
    ) ||
    quantity < 1 ||
    quantity > 1000 ||
    unitPrice <= 0 ||
    discount < 0 ||
    discount >= subtotal ||
    total > 1_000_000_000
  )
    throw new Error("Valores da proposta inválidos ou acima do limite");
  return { subtotal, total };
}
export function parseCommercialMoney(value: string): number {
  const s = value.trim().replace(/\s/g, "");
  if (!/^\d+(?:,\d{1,2})?$/.test(s))
    throw new Error(
      "Use valor em reais, por exemplo 1500,00, sem separador de milhar"
    );
  const [whole, cents = ""] = s.split(",");
  return commercialMoney.parse(
    Number(whole) * 100 + Number(cents.padEnd(2, "0"))
  );
}
