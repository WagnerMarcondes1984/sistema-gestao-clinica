// Sessão de demonstração exclusivamente local. Não registra uma rota de login.
import "dotenv/config";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import mysql from "mysql2/promise";
import { SignJWT } from "jose";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { assertDemoSeedAllowed } from "../server/seed-safety.mjs";

assertDemoSeedAllowed({ ...process.env, ALLOW_DEMO_SEED: "true" });
assert.ok(process.env.JWT_SECRET?.length >= 32, "Configure JWT_SECRET local.");
assert.ok(
  process.env.DISPLAY || process.env.WAYLAND_DISPLAY,
  "É necessário um ambiente gráfico local."
);
const slug = "mindos-revisao-local",
  clinicName = "Clínica fictícia — revisão local",
  openId = "mindos-local-review-owner";
const appId = "mindos-local-review";
const db = await mysql.createConnection(process.env.DATABASE_URL);
let server, browser, socket, profile;
async function stop() {
  socket?.close();
  for (const child of [browser, server])
    if (child && child.exitCode === null) child.kill("SIGTERM");
  if (profile)
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 250,
    });
}
try {
  const [[lock]] = await db.query(
    "SELECT GET_LOCK('mindos_local_review_setup', 0) AS acquired"
  );
  assert.equal(
    Number(lock.acquired),
    1,
    "Outra preparação local está em andamento."
  );
  let tenantId;
  let freshClinic = false;
  try {
    await db.beginTransaction();
    const [[existing]] = await db.execute(
      "SELECT * FROM mindos_tenants WHERE slug=? FOR UPDATE",
      [slug]
    );
    if (existing) {
      assert.equal(
        existing.name,
        clinicName,
        "O identificador de revisão já pertence a outra clínica."
      );
      assert.equal(
        existing.status,
        "ACTIVE",
        "Clínica de revisão inativa; revise sua associação manualmente."
      );
      tenantId = existing.id;
    } else {
      const [r] = await db.execute(
        "INSERT INTO mindos_tenants(slug,name,siteConfigJson) VALUES(?,?,'{}')",
        [slug, clinicName]
      );
      tenantId = r.insertId;
      freshClinic = true;
    }
    const [[account]] = await db.execute(
      "SELECT * FROM users WHERE openId=? FOR UPDATE",
      [openId]
    );
    let userId;
    if (account) {
      assert.equal(
        account.loginMethod,
        "local-review",
        "Identidade já utilizada fora da revisão local."
      );
      userId = account.id;
    } else {
      const [r] = await db.execute(
        "INSERT INTO users(openId,name,role,loginMethod) VALUES(?,?,'user','local-review')",
        [openId, "Administrador fictício — revisão local"]
      );
      userId = r.insertId;
    }
    const [memberships] = await db.execute(
      "SELECT * FROM mindos_memberships WHERE userId=? FOR UPDATE",
      [userId]
    );
    if (memberships.length) {
      assert.equal(
        memberships.length,
        1,
        "Associações inesperadas na conta de revisão."
      );
      assert.equal(memberships[0].tenantId, tenantId);
      assert.equal(memberships[0].role, "OWNER");
      assert.equal(
        Boolean(memberships[0].active),
        true,
        "Acesso de revisão revogado; nenhuma reativação automática será feita."
      );
    } else
      await db.execute(
        "INSERT INTO mindos_memberships(tenantId,userId,role,permissionsJson) VALUES(?,?,'OWNER',?)",
        [tenantId, userId, JSON.stringify(["ALL"])]
      );
    await db.commit();
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    await db.query("SELECT RELEASE_LOCK('mindos_local_review_setup')");
  }
  await db.end();
  server = spawn(process.execPath, ["dist/index.js"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: "3420",
      VITE_APP_ID: appId,
      PUBLIC_TENANT_SLUG: slug,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Servidor local não iniciou.")),
      45000
    );
    let output = "";
    server.stdout.on("data", chunk => {
      output += chunk.toString();
      const match = output.match(/Server running on http:\/\/localhost:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(`http://localhost:${match[1]}`);
      }
    });
    server.once("error", reject);
    server.once("exit", () =>
      reject(new Error("Servidor de revisão encerrou."))
    );
  });
  const token = await new SignJWT({
    openId,
    appId,
    name: "Administrador fictício — revisão local",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime("2h")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));
  const api = createTRPCProxyClient({
    links: [
      httpBatchLink({
        url: `${base}/api/trpc`,
        transformer: superjson,
        headers: { Authorization: `Bearer ${token}` },
      }),
    ],
  });
  if (freshClinic) {
    let context = await api.scheduling.context.query();
    if (!context.professionals.length)
      await api.scheduling.saveConfig.mutate({
        kind: "professional",
        name: "Profissional fictícia de demonstração",
        registration: "FICTÍCIO",
        active: true,
      });
    if (!context.units.length)
      await api.scheduling.saveConfig.mutate({
        kind: "unit",
        name: "Unidade fictícia de demonstração",
        active: true,
      });
    if (!context.services.length)
      await api.scheduling.saveConfig.mutate({
        kind: "service",
        name: "Sessão demonstrativa",
        durationMinutes: 50,
        mode: "BOTH",
        publicEnabled: true,
        active: true,
      });
    context = await api.scheduling.context.query();
    const professional = context.professionals.find(p => p.active),
      unit = context.units.find(u => u.active),
      service = context.services.find(s => s.active);
    assert.ok(
      professional && unit && service,
      "Os recursos de demonstração foram inativados. Revise os cadastros pela interface."
    );
    if (!context.availability.length)
      for (let weekday = 0; weekday < 7; weekday++)
        await api.scheduling.saveConfig.mutate({
          kind: "availability",
          professionalId: professional.id,
          unitId: unit.id,
          weekday,
          startMinute: 0,
          endMinute: 1440,
          active: true,
        });
    let patients = await api.patients.list.query({ pageSize: 100 });
    if (!patients.total) {
      await api.patients.create.mutate({
        fullName: "Ana Fictícia — demonstração",
        email: "ana-demo@example.com",
        phone: "11900000001",
        administrativeStatus: "ACTIVE",
      });
      await api.patients.create.mutate({
        fullName: "Bruno Fictício — demonstração",
        email: "bruno-demo@example.com",
        phone: "11900000002",
        administrativeStatus: "ACTIVE",
      });
      patients = await api.patients.list.query({ pageSize: 100 });
    }
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: context.clinic.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const tomorrowDate = new Date(`${today}T12:00:00Z`);
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
    const tomorrow = tomorrowDate.toISOString().slice(0, 10);
    if (!(await api.scheduling.list.query({})).items.length) {
      const common = {
        professionalId: professional.id,
        unitId: unit.id,
        serviceId: service.id,
        mode: "IN_PERSON",
        date: today,
        count: 1,
        intervalWeeks: 1,
      };
      await api.scheduling.create.mutate({
        ...common,
        patientId: patients.items[0].id,
        time: "09:00",
      });
      await api.scheduling.create.mutate({
        ...common,
        patientId: patients.items[1]?.id || patients.items[0].id,
        time: "10:00",
      });
      await api.scheduling.create.mutate({
        ...common,
        patientId: patients.items[0].id,
        date: tomorrow,
        time: "15:00",
        count: 2,
      });
    }
    if (!(await api.scheduling.requests.query()).length)
      await api.publicMindos.requestBooking.mutate({
        name: "Solicitante fictício — demonstração",
        contactChannel: "EMAIL",
        contactValue: "solicitante-demo@example.com",
        serviceId: service.id,
        date: tomorrow,
        time: "14:00",
        consent: true,
      });
  }
  profile = await mkdtemp(join(tmpdir(), "mindos-review-"));
  browser = spawn(
    "google-chrome",
    [
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      "--disable-background-networking",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
  const debug = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Chrome não abriu.")),
      45000
    );
    browser.stderr.on("data", chunk => {
      const match = chunk
        .toString()
        .match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    browser.once("error", reject);
    browser.once("exit", () =>
      reject(new Error("Chrome encerrou antes de abrir a revisão."))
    );
  });
  socket = new WebSocket(debug);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let sequence = 0;
  const requests = new Map();
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    const request = requests.get(message.id);
    if (request) {
      requests.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    }
  });
  const cdp = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        requests.delete(id);
        reject(new Error(`Chrome não respondeu: ${method}`));
      }, 15000);
      requests.set(id, { resolve, reject, timer });
      socket.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        })
      );
    });
  const targets = await cdp("Target.getTargets");
  const target = targets.targetInfos.find(t => t.type === "page");
  assert.ok(target, "Janela do Chrome não encontrada.");
  const { sessionId } = await cdp("Target.attachToTarget", {
    targetId: target.targetId,
    flatten: true,
  });
  await cdp("Network.enable", {}, sessionId);
  await cdp(
    "Network.setCookie",
    {
      name: "app_session_id",
      value: token,
      url: base,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
    sessionId
  );
  await cdp("Page.navigate", { url: `${base}/agenda` }, sessionId);
  await cdp("Page.bringToFront", {}, sessionId);
  const deadline = Date.now() + 30000;
  let ready = false;
  while (Date.now() < deadline) {
    const result = await cdp(
      "Runtime.evaluate",
      { expression: "document.body.innerText", returnByValue: true },
      sessionId
    );
    if (
      result.result.value?.includes("Novo agendamento") &&
      result.result.value.includes("Administrador fictício")
    ) {
      ready = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, "A sessão local não abriu a agenda autenticada.");
  console.log(`MindOS aberto para revisão: ${base}/agenda`);
  console.log(
    "Clínica e contas fictícias separadas. Sessão temporária de 2 horas; dados de revisão preservados. Nenhuma credencial Manus alterada."
  );
  socket.close();
  socket = null;
  process.once("SIGTERM", () => stop());
  process.once("SIGINT", () => stop());
  await new Promise(resolve => browser.once("exit", resolve));
  await stop();
} catch (error) {
  try {
    await db.end();
  } catch {}
  await stop();
  console.error(error.message);
  process.exitCode = 1;
}
