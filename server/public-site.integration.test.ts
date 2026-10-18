import { randomUUID } from "node:crypto";
import { describe, beforeAll, afterAll, it, expect, vi } from "vitest";
import mysql, {
  type Connection,
  type RowDataPacket,
  type ResultSetHeader,
} from "mysql2/promise";
import { appRouter } from "./routers";
import { publicSite } from "./public-site";
import { defaultSite } from "../shared/public-site";
import type { TrpcContext } from "./_core/context";
import * as databaseModule from "./db";
import { mindosAccessAudits } from "../drizzle/schema";
// @ts-expect-error Guard compartilhado com o seed JS.
import { assertDemoSeedAllowed } from "./seed-safety.mjs";
describe("CMS público com versões e MySQL real", () => {
  let db: Connection,
    t: number,
    t2: number,
    ownerId: number,
    editorId: number,
    readerId: number;
  let owner: ReturnType<typeof appRouter.createCaller>,
    foreign: typeof owner,
    editor: typeof owner,
    reader: typeof owner,
    publisher: typeof owner;
  const tenants: number[] = [],
    users: number[] = [];
  const slug = `cms-${randomUUID()}`,
    otherSlug = `cms-other-${randomUUID()}`;
  async function insert(s: string, a: unknown[]) {
    const [r] = await db.execute<ResultSetHeader>(s, a);
    return r.insertId;
  }
  async function account(tenant: number, role: string, permissions: string[]) {
    const id = await insert("INSERT INTO users(openId,name) VALUES(?,?)", [
      `cms-test-${randomUUID()}`,
      "Autor CMS fictício",
    ]);
    users.push(id);
    await insert(
      "INSERT INTO mindos_memberships(tenantId,userId,role,permissionsJson) VALUES(?,?,?,?)",
      [tenant, id, role, JSON.stringify(permissions)]
    );
    const d = new Date();
    return {
      id,
      caller: appRouter.createCaller({
        user: {
          id,
          openId: `fixture-${id}`,
          name: "Nome não confiável do contexto",
          email: null,
          role: "user",
          loginMethod: "test",
          createdAt: d,
          updatedAt: d,
          lastSignedIn: d,
        },
        req: { headers: {} },
        res: {},
      } as TrpcContext),
    };
  }
  const overview = () => owner.mindos.cms.versions();
  const content = (title = "Conteúdo institucional fictício") => {
    const c = defaultSite("Clínica pública fictícia");
    c.blocks[0].title = title;
    return c;
  };
  async function draft(title?: string) {
    const r = await overview();
    return owner.mindos.cms.saveDraft({
      revision: r.revision,
      requestKey: randomUUID(),
      changeSummary: "Conteúdo institucional de teste",
      content: content(title),
    });
  }
  async function approve(id: number) {
    return owner.mindos.cms.approve({
      versionId: id,
      revision: (await overview()).revision,
    });
  }
  async function publish(id: number) {
    return owner.mindos.cms.publish({
      versionId: id,
      revision: (await overview()).revision,
    });
  }
  beforeAll(async () => {
    assertDemoSeedAllowed({ ...process.env, ALLOW_DEMO_SEED: "true" });
    db = await mysql.createConnection(process.env.DATABASE_URL!);
    t = await insert(
      "INSERT INTO mindos_tenants(slug,name,siteConfigJson) VALUES(?,?,'{}')",
      [slug, "Clínica CMS fictícia"]
    );
    t2 = await insert(
      "INSERT INTO mindos_tenants(slug,name,siteConfigJson) VALUES(?,?,'{}')",
      [otherSlug, "Outra clínica CMS fictícia"]
    );
    tenants.push(t, t2);
    const o = await account(t, "OWNER", []);
    owner = o.caller;
    ownerId = o.id;
    foreign = (await account(t2, "OWNER", [])).caller;
    const e = await account(t, "SALES", [
      "VIEW_PUBLIC_SITE",
      "MANAGE_PUBLIC_SITE",
    ]);
    editor = e.caller;
    editorId = e.id;
    const r = await account(t, "SALES", ["VIEW_PUBLIC_SITE"]);
    reader = r.caller;
    readerId = r.id;
    publisher = (
      await account(t, "SALES", ["VIEW_PUBLIC_SITE", "PUBLISH_PUBLIC_SITE"])
    ).caller;
  });
  afterAll(async () => {
    if (!db) return;
    try {
      for (const id of tenants) {
        for (const table of [
          "mindos_booking_limits",
          "mindos_booking_requests",
          "mindos_services",
          "mindos_access_audits",
          "mindos_cms_versions",
          "mindos_memberships",
        ]) {
          await db.execute(`DELETE FROM ${table} WHERE tenantId=?`, [id]);
        }
        await db.execute("DELETE FROM mindos_tenants WHERE id=?", [id]);
      }
      for (const id of users)
        await db.execute("DELETE FROM users WHERE id=?", [id]);
    } finally {
      await db.end();
    }
  });
  it("não expõe clínica sem publicação, nem usa publicação legada como fallback", async () => {
    await expect(publicSite(slug)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await insert(
      "INSERT INTO mindos_cms_versions(tenantId,versionNumber,status,contentJson,createdByUserId) VALUES(?,1,'PUBLISHED',?,?)",
      [t, '{"title":"Legado não revisado"}', ownerId]
    );
    await expect(publicSite(slug)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await overview()).versions[0].legacy).toBe(true);
  });
  it("salva snapshot imutável com autoria da sessão, sem mudar o site público", async () => {
    const r = await draft();
    const q = await overview();
    const v = q.versions.find(v => v.id === r.id)!;
    expect(v.status).toBe("DRAFT");
    expect(v.createdByUserId).toBe(ownerId);
    expect(v).not.toHaveProperty("creationHash");
    await expect(publicSite(slug)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("replay concorrente cria uma versão só e rejeita chave com outro conteúdo", async () => {
    const input = {
      revision: (await overview()).revision,
      requestKey: randomUUID(),
      changeSummary: "Rascunho concorrente fictício",
      content: content(),
    };
    const [a, b] = await Promise.all([
      owner.mindos.cms.saveDraft(input),
      owner.mindos.cms.saveDraft(input),
    ]);
    expect(a.id).toBe(b.id);
    await expect(
      owner.mindos.cms.saveDraft({
        ...input,
        content: content("Outro conteúdo"),
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("duas alterações na mesma revisão não sobrescrevem uma à outra", async () => {
    const revision = (await overview()).revision;
    const r = await Promise.allSettled(
      ["A", "B"].map(x =>
        owner.mindos.cms.saveDraft({
          revision,
          requestKey: randomUUID(),
          changeSummary: "Mudança concorrente " + x,
          content: content(x),
        })
      )
    );
    expect(r.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(r.filter(x => x.status === "rejected")).toHaveLength(1);
  });
  it("exige aprovação antes de publicar e preserva autor da aprovação", async () => {
    const v = await draft("Primeira versão pública");
    await expect(publish(v.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await approve(v.id);
    await expect(publicSite(slug)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await publish(v.id);
    const p = await publicSite(slug);
    expect(p.content.blocks[0].title).toBe("Primeira versão pública");
    expect(p).not.toHaveProperty("createdByUserId");
    const q = await overview();
    expect(q.versions.find(x => x.id === v.id)?.approvedByUserId).toBe(ownerId);
  });
  it("rascunho e aprovação posteriores não alteram o publicado; rollback restaura marca e metadados", async () => {
    const before = await publicSite(slug);
    const old = (await overview()).publishedVersionId!;
    const c = content("Nova publicação");
    c.brand.name = "Nova marca fictícia";
    c.seo.title = "Novo título público";
    const v = await owner.mindos.cms.saveDraft({
      content: c,
      revision: (await overview()).revision,
      requestKey: randomUUID(),
      changeSummary: "Nova marca e conteúdo público",
    });
    expect(await publicSite(slug)).toEqual(before);
    await approve(v.id);
    expect(await publicSite(slug)).toEqual(before);
    await publish(v.id);
    expect((await publicSite(slug)).content.brand.name).toBe(c.brand.name);
    await owner.mindos.cms.rollback({
      versionId: old,
      revision: (await overview()).revision,
    });
    expect(await publicSite(slug)).toEqual(before);
    expect((await overview()).versions.find(x => x.id === v.id)?.status).toBe(
      "ARCHIVED"
    );
  });
  it("nega restauração de rascunho e alteração de estado da publicação atual", async () => {
    const v = await draft();
    const revision = (await overview()).revision;
    await expect(
      owner.mindos.cms.rollback({ versionId: v.id, revision })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const current = (await overview()).publishedVersionId!;
    await expect(
      owner.mindos.cms.approve({ versionId: current, revision })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("separa consulta, edição e publicação; não amplia permissões de leitor", async () => {
    const r = await reader.mindos.cms.versions();
    expect(r.canEdit).toBe(false);
    expect(r.canPublish).toBe(false);
    const input = {
      revision: r.revision,
      requestKey: randomUUID(),
      changeSummary: "Tentativa sem autorização",
      content: content(),
    };
    await expect(reader.mindos.cms.saveDraft(input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const v = await editor.mindos.cms.saveDraft(input);
    await expect(
      editor.mindos.cms.approve({
        versionId: v.id,
        revision: (await overview()).revision,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await publisher.mindos.cms.approve({
      versionId: v.id,
      revision: (await overview()).revision,
    });
    await expect(
      publisher.mindos.cms.saveDraft({
        ...input,
        requestKey: randomUUID(),
        revision: (await overview()).revision,
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("isola IDs de versão e leituras públicas entre clínicas e bloqueia versão legada", async () => {
    const q = await overview(),
      id = q.versions[0].id;
    await expect(
      foreign.mindos.cms.approve({ versionId: id, revision: 0 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const legacy = q.versions.find(v => v.legacy)!;
    await expect(
      owner.mindos.cms.approve({ versionId: legacy.id, revision: q.revision })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(publicSite("clinica-inexistente")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
  it("revalida associação revogada inclusive em replay", async () => {
    const input = {
      revision: (await overview()).revision,
      requestKey: randomUUID(),
      changeSummary: "Rascunho antes da revogação",
      content: content(),
    };
    await editor.mindos.cms.saveDraft(input);
    await db.execute(
      "UPDATE mindos_memberships SET active=false WHERE tenantId=? AND userId=?",
      [t, editorId]
    );
    await expect(editor.mindos.cms.saveDraft(input)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(editor.mindos.cms.versions()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it("aceita snapshot Unicode maior que TEXT sem truncar blocos", async () => {
    const c = content();
    c.blocks = Array.from({ length: 12 }, () => ({
      id: randomUUID(),
      kind: "ABOUT" as const,
      enabled: true,
      title: "Conteúdo fictício",
      body: "🧠".repeat(1000),
      items: [{ title: "Informação pública", body: "á".repeat(1000) }],
    }));
    expect(Buffer.byteLength(JSON.stringify(c), "utf8")).toBeGreaterThan(65535);
    const v = await owner.mindos.cms.saveDraft({
      content: c,
      revision: (await overview()).revision,
      requestKey: randomUUID(),
      changeSummary: "Conteúdo extenso para teste Unicode",
    });
    expect(
      (await overview()).versions.find(x => x.id === v.id)?.content
    ).toEqual(c);
  });
  it("desativa publicação pública quando a clínica está pausada", async () => {
    await db.execute("UPDATE mindos_tenants SET status='PAUSED' WHERE id=?", [
      t,
    ]);
    try {
      await expect(publicSite(slug)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    } finally {
      await db.execute("UPDATE mindos_tenants SET status='ACTIVE' WHERE id=?", [
        t,
      ]);
    }
  });
  it("falha de auditoria reverte publicação e revisão sem expor SQL", async () => {
    const v = await draft("Publicação para falha controlada");
    await approve(v.id);
    const before = await overview(),
      previous = await publicSite(slug);
    const real = (await databaseModule.getDb())!;
    const proxy = new Proxy(real, {
      get(target, prop) {
        if (prop === "transaction")
          return async (work: any) =>
            target.transaction(async tx =>
              work(
                new Proxy(tx, {
                  get(t, k) {
                    if (k === "insert")
                      return (table: unknown) => {
                        if (table === mindosAccessAudits)
                          throw new Error("Falha fictícia da auditoria CMS");
                        return t.insert(table as any);
                      };
                    const value = Reflect.get(t, k);
                    return typeof value === "function" ? value.bind(t) : value;
                  },
                })
              )
            );
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const spy = vi.spyOn(databaseModule, "getDb").mockResolvedValue(proxy);
    try {
      await expect(
        owner.mindos.cms.publish({ versionId: v.id, revision: before.revision })
      ).rejects.toThrow("Não foi possível concluir a alteração do site");
    } finally {
      spy.mockRestore();
    }
    expect((await overview()).revision).toBe(before.revision);
    expect((await overview()).publishedVersionId).toBe(
      before.publishedVersionId
    );
    expect(await publicSite(slug)).toEqual(previous);
  });
  it("mantém agendamento público no slug explícito e rejeita serviço de outra clínica", async () => {
    const sid = await insert(
      "INSERT INTO mindos_services(tenantId,name,nameKey,durationMinutes,publicEnabled,active) VALUES(?,'Serviço público fictício','servico publico ficticio',50,true,true)",
      [t]
    );
    const ctx = await appRouter
      .createCaller({
        user: null,
        req: { headers: {}, socket: { remoteAddress: "127.0.0.1" } },
        res: {},
      } as unknown as TrpcContext)
      .publicMindos.scheduling({ clinicSlug: slug });
    expect(ctx.clinicId).toBe(t);
    expect(ctx.services.map(x => x.id)).toContain(sid);
    const anonymous = appRouter.createCaller({
      user: null,
      req: { headers: {}, socket: { remoteAddress: "127.0.0.1" } },
      res: {},
    } as unknown as TrpcContext);
    expect(
      (await anonymous.publicMindos.scheduling({ clinicSlug: otherSlug }))
        .services
    ).toEqual([]);
    await expect(
      anonymous.publicMindos.requestBooking({
        clinicSlug: otherSlug,
        name: "Solicitante fictício",
        contactChannel: "EMAIL",
        contactValue: "cms-book@example.com",
        serviceId: sid,
        date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        time: "10:00",
        consent: true,
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
