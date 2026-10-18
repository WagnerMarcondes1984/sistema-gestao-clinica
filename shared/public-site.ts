import { z } from "zod";
export const siteSlug = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const text = (max: number) => z.string().trim().max(max);
export const BLOCK_KINDS = [
  "HERO",
  "ABOUT",
  "SERVICES",
  "TEAM",
  "FAQ",
  "LOCATION",
  "CTA",
  "FOOTER",
] as const;
export const BLOCK_LABELS = {
  HERO: "Apresentação",
  ABOUT: "Sobre",
  SERVICES: "Serviços",
  TEAM: "Profissionais públicos",
  FAQ: "Perguntas frequentes",
  LOCATION: "Localização",
  CTA: "Agendamento",
  FOOTER: "Rodapé",
};
export const siteBlock = z
  .object({
    id: z.string().uuid(),
    kind: z.enum(BLOCK_KINDS),
    enabled: z.boolean(),
    title: text(160),
    body: text(3000),
    items: z
      .array(z.object({ title: text(160), body: text(1500) }).strict())
      .max(12),
  })
  .strict();
export const siteContent = z
  .object({
    schemaVersion: z.literal(1),
    brand: z
      .object({
        name: z.string().trim().min(2).max(160),
        logoText: text(12),
        primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      })
      .strict(),
    seo: z
      .object({
        title: z.string().trim().min(2).max(100),
        description: z.string().trim().min(10).max(300),
        publicOrigin: z
          .string()
          .max(300)
          .refine(s => {
            if (!s) return true;
            try {
              const u = new URL(s);
              return (
                u.protocol === "https:" &&
                !u.username &&
                !u.password &&
                u.pathname === "/" &&
                !u.search &&
                !u.hash
              );
            } catch {
              return false;
            }
          }, "Informe somente a origem HTTPS, sem caminho ou credenciais"),
      })
      .strict(),
    contact: z
      .object({
        city: text(120),
        address: text(300),
        email: z.union([z.literal(""), z.email().max(200)]),
        phone: text(40),
      })
      .strict(),
    bookingEnabled: z.boolean(),
    portalEnabled: z.boolean(),
    blocks: z.array(siteBlock).min(1).max(16),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (new Set(c.blocks.map(b => b.id)).size !== c.blocks.length)
      ctx.addIssue({
        code: "custom",
        message: "Blocos com identificadores repetidos",
      });
  });
export type SiteContent = z.infer<typeof siteContent>;
export function defaultSite(name: string): SiteContent {
  return {
    schemaVersion: 1,
    brand: { name, logoText: "", primary: "#4338CA", accent: "#6366F1" },
    seo: {
      title: name.slice(0, 100),
      description:
        "Conheça nossa clínica e entre em contato com a equipe para mais informações.",
      publicOrigin: "",
    },
    contact: { city: "", address: "", email: "", phone: "" },
    bookingEnabled: true,
    portalEnabled: true,
    blocks: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        kind: "HERO",
        enabled: true,
        title: "Conheça nossa clínica",
        body: "",
        items: [],
      },
    ],
  };
}
export const siteId = z.number().int().positive().max(2147483647);
export const siteRevision = z.number().int().min(0).max(2147483647);
export const draftInput = z
  .object({
    content: siteContent,
    revision: siteRevision,
    requestKey: z.string().uuid(),
    changeSummary: z.string().trim().min(8).max(255),
  })
  .strict();
export const versionAction = z
  .object({ versionId: siteId, revision: siteRevision })
  .strict();
export function parseSite(json: string): SiteContent | null {
  try {
    const p = siteContent.safeParse(JSON.parse(json));
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}

export function brandForeground(hex: string) {
  const values = hex
    .slice(1)
    .match(/../g)!
    .map(v => parseInt(v, 16) / 255)
    .map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const l = 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
  return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? "#000000" : "#ffffff";
}
