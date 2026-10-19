import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { publicProcedure, router } from "./_core/trpc";
import { registerStorageProxy } from "./_core/storageProxy";
import { getSessionCookieOptions } from "./_core/cookies";
import {
  registerSecurity,
  operationalErrorHandler,
} from "./operational-security";
const servers: Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map(
      s =>
        new Promise<void>(resolve => {
          s.close(() => resolve());
          s.closeAllConnections();
        })
    )
  );
});
async function setup(
  options: {
    production?: boolean;
    trusted?: boolean;
    limit?: number;
    now?: () => number;
  } = {}
) {
  const app = express();
  registerSecurity(
    app,
    {
      production: options.production || false,
      host: "127.0.0.1",
      port: 0,
      origin: options.production ? "https://clinica.test" : "",
      trustProxy: options.trusted ? ["loopback"] : false,
      sessionTtlMs: 1000,
    },
    options
  );
  app.use(express.json({ limit: 100 }));
  registerStorageProxy(app);
  app.all("/api/check", (req, res) =>
    res.json({
      secure: req.secure,
      ip: req.ip,
      cookie: getSessionCookieOptions(req),
    })
  );
  app.get("/api/fail", () => {
    throw new Error(
      "SELECT private_patient FROM clinical WHERE name='fixture-sensitive'"
    );
  });
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: router({
        fail: publicProcedure.query(() => {
          throw new Error("fixture-private-SQL");
        }),
      }),
      createContext: ({ req, res }) => ({ req, res, user: null }),
    })
  );
  app.use(operationalErrorHandler);
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error();
  return `http://127.0.0.1:${address.port}`;
}
describe("proteções HTTP na fronteira real do Express", () => {
  it("aceita JSON da mesma origem e rejeita origem cruzada, nula e formulários", async () => {
    const base = await setup();
    const request = (origin: string, type = "application/json", extra = {}) =>
      fetch(base + "/api/check", {
        method: "POST",
        headers: { origin, "content-type": type, ...extra },
        body: "{}",
      });
    expect((await request(base)).status).toBe(200);
    expect((await request("https://outra.test")).status).toBe(403);
    expect((await request("null")).status).toBe(403);
    expect(
      (
        await request(base, "application/json", {
          "sec-fetch-site": "cross-site",
        })
      ).status
    ).toBe(403);
    expect((await request(base, "text/plain")).status).toBe(415);
  });
  it("recusa cabeçalho de proxy falsificado e gera seu próprio identificador", async () => {
    const base = await setup();
    const r = await fetch(base + "/api/check", {
      headers: {
        "x-forwarded-proto": "https",
        "x-request-id": "attacker",
        "x-forwarded-for": "10.1.2.3",
      },
    });
    const data = await r.json();
    expect(data.secure).toBe(false);
    expect(data.ip).toBe("127.0.0.1");
    expect(r.headers.get("x-request-id")).toMatch(/^[a-f0-9-]{36}$/);
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-powered-by")).toBeNull();
  });
  it("exige HTTPS em produção e aceita somente o proxy configurado", async () => {
    const base = await setup({ production: true });
    expect(
      (
        await fetch(base + "/api/check", {
          headers: { "x-forwarded-proto": "https" },
        })
      ).status
    ).toBe(426);
    const trusted = await setup({ production: true, trusted: true });
    const r = await fetch(trusted + "/api/check", {
      headers: { "x-forwarded-proto": "https", "x-forwarded-for": "10.1.2.3" },
    });
    expect(r.status).toBe(200);
    expect(r.headers.get("strict-transport-security")).toContain("max-age=");
    const data = await r.json();
    expect(data.cookie.secure).toBe(true);
    expect(data.ip).toBe("10.1.2.3");
  });
  it("limita requisições mesmo com IP encaminhado falso e libera após a janela", async () => {
    let now = 1000;
    const base = await setup({ limit: 2, now: () => now });
    expect((await fetch(base + "/api/check")).status).toBe(200);
    await fetch(base + "/api/check", {
      headers: { "x-forwarded-for": "10.1.1.1" },
    });
    const denied = await fetch(base + "/api/check", {
      headers: { "x-forwarded-for": "10.2.2.2" },
    });
    expect(denied.status).toBe(429);
    expect(denied.headers.get("retry-after")).toBeTruthy();
    now += 60001;
    expect((await fetch(base + "/api/check")).status).toBe(200);
  });
  it("retorna 413/400/500 sem corpo sensível, SQL ou stack nos erros e logs", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const base = await setup();
    expect(
      (
        await fetch(base + "/api/check", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: "x".repeat(150) }),
        })
      ).status
    ).toBe(413);
    expect(
      (
        await fetch(base + "/api/check", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{",
        })
      ).status
    ).toBe(400);
    const r = await fetch(base + "/api/fail");
    expect(r.status).toBe(500);
    expect(await r.text()).not.toMatch(/SELECT|fixture-sensitive|stack/);
    const trpc = await fetch(base + "/api/trpc/fail");
    expect(trpc.status).toBe(500);
    expect(await trpc.text()).not.toMatch(/fixture-private-SQL|stack/);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /private_patient|fixture-private-SQL|fixture-sensitive/
    );
  });
  it("desativa o proxy de armazenamento legado sem autenticação", async () => {
    const base = await setup();
    expect((await fetch(base + "/manus-storage/private-key")).status).toBe(404);
  });
});
