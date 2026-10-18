import { createHash } from "node:crypto";
import { and, eq, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb, hasMindosPermission } from "./db";
import { withClinic, type Tx, type Clinic } from "./scheduling";
import {
  mindosTenants,
  mindosMemberships,
  mindosCmsVersions,
  mindosAccessAudits,
  type User,
} from "../drizzle/schema";
import { draftInput, parseSite, siteSlug } from "../shared/public-site";
const fail = (
  code:
    | "CONFLICT"
    | "NOT_FOUND"
    | "FORBIDDEN"
    | "PRECONDITION_FAILED"
    | "BAD_REQUEST",
  message: string
): never => {
  throw new TRPCError({ code, message });
};
function checkRevision(c: Clinic, revision: number) {
  if (c.cmsRevision !== revision)
    fail(
      "CONFLICT",
      "O conteúdo foi alterado. Atualize e confira antes de continuar."
    );
}
async function audit(
  tx: Tx,
  c: Clinic,
  user: User,
  id: number,
  action: string,
  reason: string
) {
  await tx.insert(mindosAccessAudits).values({
    tenantId: c.id,
    actorUserId: user.id,
    subjectType: "CMS_VERSION",
    subjectId: id,
    dataLayer: "PUBLIC",
    action,
    reason,
  });
}
async function target(tx: Tx, c: Clinic, id: number) {
  const [v] = await tx
    .select()
    .from(mindosCmsVersions)
    .where(
      and(eq(mindosCmsVersions.id, id), eq(mindosCmsVersions.tenantId, c.id))
    );
  if (!v) return fail("NOT_FOUND", "Versão não encontrada nesta clínica");
  const content = parseSite(v.contentJson);
  if (!content)
    return fail(
      "PRECONDITION_FAILED",
      "Versão legada sem contrato público válido. Crie e revise um novo rascunho."
    );
  return { v, content };
}
async function bump(tx: Tx, c: Clinic, versionId?: number) {
  await tx
    .update(mindosTenants)
    .set({
      cmsRevision: c.cmsRevision + 1,
      ...(versionId !== undefined ? { cmsPublishedVersionId: versionId } : {}),
    })
    .where(eq(mindosTenants.id, c.id));
}
export async function publishedSnapshot(
  tx: Tx,
  c: Pick<Clinic, "id" | "cmsPublishedVersionId">
) {
  if (!c.cmsPublishedVersionId) return null;
  const [v] = await tx
    .select()
    .from(mindosCmsVersions)
    .where(
      and(
        eq(mindosCmsVersions.tenantId, c.id),
        eq(mindosCmsVersions.id, c.cmsPublishedVersionId),
        eq(mindosCmsVersions.status, "PUBLISHED")
      )
    );
  const content = v && parseSite(v.contentJson);
  return content ? { content, versionNumber: v.versionNumber } : null;
}
export async function siteOverview(user: User) {
  return withClinic(user, "VIEW_PUBLIC_SITE", async (tx, c) => {
    const [m] = await tx
      .select()
      .from(mindosMemberships)
      .where(
        and(
          eq(mindosMemberships.tenantId, c.id),
          eq(mindosMemberships.userId, user.id)
        )
      );
    const versions = await tx
      .select()
      .from(mindosCmsVersions)
      .where(eq(mindosCmsVersions.tenantId, c.id))
      .orderBy(
        desc(mindosCmsVersions.versionNumber),
        desc(mindosCmsVersions.id)
      );
    return {
      clinicName: c.name,
      timezone: c.timezone,
      slug: c.slug,
      revision: c.cmsRevision,
      publishedVersionId: c.cmsPublishedVersionId,
      publicPath: `/site/${c.slug}`,
      canEdit: hasMindosPermission(m, "MANAGE_PUBLIC_SITE"),
      canPublish: hasMindosPermission(m, "PUBLISH_PUBLIC_SITE"),
      domainStatus: "NOT_VERIFIED" as const,
      versions: versions.map(
        ({ contentJson, creationKey, creationHash, ...v }) => ({
          ...v,
          content: parseSite(contentJson),
          legacy: !parseSite(contentJson),
        })
      ),
    };
  });
}
export async function saveSiteDraft(
  user: User,
  raw: z.input<typeof draftInput>
) {
  const input = draftInput.parse(raw);
  return withClinic(user, "MANAGE_PUBLIC_SITE", async (tx, c) => {
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          content: input.content,
          summary: input.changeSummary,
          user: user.id,
        })
      )
      .digest("hex");
    const [old] = await tx
      .select()
      .from(mindosCmsVersions)
      .where(
        and(
          eq(mindosCmsVersions.tenantId, c.id),
          eq(mindosCmsVersions.creationKey, input.requestKey)
        )
      );
    if (old) {
      if (old.creationHash !== fingerprint)
        return fail("CONFLICT", "Chave já usada para outro rascunho");
      return { id: old.id };
    }
    checkRevision(c, input.revision);
    const [latest] = await tx
      .select()
      .from(mindosCmsVersions)
      .where(eq(mindosCmsVersions.tenantId, c.id))
      .orderBy(desc(mindosCmsVersions.versionNumber))
      .limit(1);
    const [r] = await tx.insert(mindosCmsVersions).values({
      tenantId: c.id,
      versionNumber: (latest?.versionNumber || 0) + 1,
      status: "DRAFT",
      contentJson: JSON.stringify(input.content),
      changeSummary: input.changeSummary,
      createdByUserId: user.id,
      creationKey: input.requestKey,
      creationHash: fingerprint,
    });
    await bump(tx, c);
    await audit(tx, c, user, r.insertId, "SAVE_CMS_DRAFT", input.changeSummary);
    return { id: r.insertId };
  });
}
export async function approveSite(
  user: User,
  input: { versionId: number; revision: number }
) {
  return withClinic(user, "PUBLISH_PUBLIC_SITE", async (tx, c) => {
    checkRevision(c, input.revision);
    const { v } = await target(tx, c, input.versionId);
    if (v.status !== "DRAFT")
      return fail("CONFLICT", "Somente rascunho pode ser aprovado");
    await tx
      .update(mindosCmsVersions)
      .set({
        status: "APPROVED",
        approvedByUserId: user.id,
        approvedAt: new Date(),
      })
      .where(eq(mindosCmsVersions.id, v.id));
    await bump(tx, c);
    await audit(
      tx,
      c,
      user,
      v.id,
      "APPROVE_CMS",
      "Conteúdo conferido e aprovado"
    );
    return { id: v.id };
  });
}
export async function publishSite(
  user: User,
  input: { versionId: number; revision: number },
  rollback = false
) {
  return withClinic(user, "PUBLISH_PUBLIC_SITE", async (tx, c) => {
    checkRevision(c, input.revision);
    const { v } = await target(tx, c, input.versionId);
    if (
      rollback
        ? v.status !== "ARCHIVED" || !v.publishedAt || !v.approvedAt
        : v.status !== "APPROVED" || !v.approvedAt
    )
      return fail(
        "CONFLICT",
        rollback
          ? "Restauração exige versão anteriormente publicada e aprovada"
          : "Aprove o rascunho antes de publicar"
      );
    await tx
      .update(mindosCmsVersions)
      .set({ status: "ARCHIVED" })
      .where(
        and(
          eq(mindosCmsVersions.tenantId, c.id),
          eq(mindosCmsVersions.status, "PUBLISHED")
        )
      );
    await tx
      .update(mindosCmsVersions)
      .set({ status: "PUBLISHED", publishedAt: v.publishedAt || new Date() })
      .where(eq(mindosCmsVersions.id, v.id));
    await bump(tx, c, v.id);
    await audit(
      tx,
      c,
      user,
      v.id,
      rollback ? "ROLLBACK_CMS" : "PUBLISH_CMS",
      `${rollback ? "Restaurada" : "Publicada"} versão ${v.versionNumber}`
    );
    return { id: v.id };
  });
}
export async function publicSite(slugRaw?: string) {
  const slug = siteSlug.safeParse(slugRaw || process.env.PUBLIC_TENANT_SLUG);
  if (!slug.success) return fail("NOT_FOUND", "Site indisponível");
  const db = await getDb();
  if (!db)
    return fail("PRECONDITION_FAILED", "Site temporariamente indisponível");
  return db.transaction(async tx => {
    const [c] = await tx
      .select()
      .from(mindosTenants)
      .where(
        and(
          eq(mindosTenants.slug, slug.data),
          eq(mindosTenants.status, "ACTIVE")
        )
      );
    if (!c) return fail("NOT_FOUND", "Site indisponível");
    const snapshot = await publishedSnapshot(tx, c);
    if (!snapshot)
      return fail("NOT_FOUND", "Nenhum site publicado para esta clínica");
    return { ...snapshot, slug: c.slug };
  });
}
export async function brandForStaff(user: User) {
  return withClinic(user, "VIEW_PATIENT_BASIC", async (tx, c) => {
    const p = await publishedSnapshot(tx, c);
    return {
      name: p?.content.brand.name || c.name,
      primary: p?.content.brand.primary || "#4338CA",
      logoText: p?.content.brand.logoText || "",
      slug: c.slug,
    };
  });
}
