import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mysql from "mysql2/promise";
import { SignJWT } from "jose";
import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { assertDemoSeedAllowed } from "../server/seed-safety.mjs";

assertDemoSeedAllowed({ ...process.env, ALLOW_DEMO_SEED: "true" });
assert.ok(process.env.JWT_SECRET?.length >= 32, "Configure JWT_SECRET local.");
const appId = "mindos-local-verification";
const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const db = await mysql.createConnection(process.env.DATABASE_URL);
const profile = await mkdtemp(join(tmpdir(), "mindos-browser-"));
let server, browser, socket;
const fixture = { userId: null, tenantId: null, emails: [] };
try {
  const [[owner]] = await db.query(
    "SELECT * FROM users WHERE openId = 'mindos-demo-owner'"
  );
  const [[patient]] = await db.query(
    "SELECT * FROM users WHERE openId = 'mindos-demo-patient'"
  );
  assert.ok(
    owner && patient,
    "Execute o seed em banco vazio antes desta verificação."
  );
  const tokenFor = (user, id = appId) =>
    new SignJWT({ openId: user.openId, appId: id, name: user.name })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime("10m")
      .sign(secret);
  const ownerToken = await tokenFor(owner);
  const patientToken = await tokenFor(patient);
  server = spawn(process.execPath, ["dist/index.js"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      VITE_APP_ID: appId,
      PORT: "3410",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Servidor não iniciou em 45 segundos.")),
      45_000
    );
    let output = "";
    server.stdout.on("data", chunk => {
      output += chunk.toString();
      const match = output.match(/Server running on http:\/\/localhost:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      }
    });
    server.once("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    server.once("exit", code => {
      clearTimeout(timer);
      reject(new Error(`Servidor encerrou com código ${code}.`));
    });
  });
  const client = token =>
    createTRPCProxyClient({
      links: [
        httpBatchLink({
          url: `${base}/api/trpc`,
          transformer: superjson,
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
      ],
    });
  await assert.rejects(
    client().transactions.list.query({}),
    error => error.data?.code === "UNAUTHORIZED"
  );
  const transactions = await client(ownerToken).transactions.list.query({
    limit: 50,
  });
  assert.ok(
    transactions.length > 0 && transactions.every(row => row.tenantId !== null)
  );
  const portal = await client(patientToken).mindos.portalData.query();
  assert.equal(portal.patient.preferredName, "Marina");
  await assert.rejects(
    client(await tokenFor(owner, "app-incorreto")).transactions.list.query({}),
    error => error.data?.code === "UNAUTHORIZED"
  );
  await assert.rejects(
    client(ownerToken).transactions.simulateWebhook.mutate({
      code: transactions[0].code,
      event: "PIX_RECEIVED",
    }),
    error => error.data?.code === "FORBIDDEN"
  );
  assert.equal((await fetch(`${base}/portal`)).status, 200);
  console.log(
    "HTTP real: autenticação, isolamento financeiro, portal, app incorreto e simulação bloqueada em produção aprovados."
  );

  browser = spawn(
    "google-chrome",
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--disable-background-networking",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
  const debugUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Chrome não iniciou em 45 segundos.")),
      45_000
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
    browser.once("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    browser.once("exit", code => {
      clearTimeout(timer);
      reject(new Error(`Chrome encerrou com código ${code}.`));
    });
  });
  socket = new WebSocket(debugUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let sequence = 0;
  const pending = new Map();
  const exceptions = [];
  socket.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown")
      exceptions.push(message.params.exceptionDetails.text);
    const request = pending.get(message.id);
    if (request) {
      pending.delete(message.id);
      clearTimeout(request.timer);
      message.error
        ? request.reject(new Error(message.error.message))
        : request.resolve(message.result);
    }
  });
  function cdp(method, params = {}, sessionId) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Chrome não respondeu: ${method}`));
      }, 45_000);
      pending.set(id, { resolve, reject, timer });
      socket.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        })
      );
    });
  }
  const { targetId } = await cdp("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const page = (method, params) => cdp(method, params, sessionId);
  await page("Page.enable");
  await page("Runtime.enable");
  await page("Network.enable");
  await page("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  async function waitForText(text) {
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      const result = await page("Runtime.evaluate", {
        expression: "document.body.innerText",
        returnByValue: true,
      });
      if (result.result.value?.includes(text)) return result.result.value;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(`O portal não exibiu o estado esperado: ${text}`);
  }
  await page("Page.navigate", { url: `${base}/portal` });
  await waitForText("Entre com sua conta");
  await page("Network.setCookie", {
    name: "app_session_id",
    value: patientToken,
    url: base,
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  });
  await page("Page.reload");
  const text = await waitForText("Olá, Marina");
  assert.ok(
    !text.includes("ASSINADO") && !text.includes("comprovante disponível")
  );
  await page("Runtime.evaluate", {
    expression: `[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Documentos').click()`,
  });
  await waitForText("Orientações administrativas");
  const screenshot = await page("Page.captureScreenshot", { format: "png" });
  await writeFile(
    join(tmpdir(), "mindos-portal-verificado.png"),
    Buffer.from(screenshot.data, "base64")
  );
  await page("Runtime.evaluate", {
    expression: `[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Sair').click()`,
  });
  const afterLogout = await waitForText("Entre com sua conta");
  assert.ok(
    !afterLogout.includes("Marina") &&
      !afterLogout.includes("Orientações administrativas")
  );
  await page("Page.reload");
  const afterReload = await waitForText("Entre com sua conta");
  assert.ok(!afterReload.includes("Marina"));
  const suffix = randomUUID().slice(0, 8);
  const email = `browser-team-${suffix}@example.com`;
  const cancelEmail = `browser-cancel-${suffix}@example.com`;
  fixture.emails = [email, cancelEmail];
  const name = `Pessoa teste ${suffix}`;
  const openId = `browser-team-${randomUUID()}`;
  const [createdUser] = await db.execute(
    "INSERT INTO users (openId, name, email, role) VALUES (?, ?, ?, ?)",
    [openId, name, email, "user"]
  );
  fixture.userId = createdUser.insertId;
  const ownerClient = client(ownerToken);
  fixture.tenantId = (await ownerClient.team.overview.query()).clinic.id;
  const memberToken = await tokenFor({ openId, name });
  async function evaluate(expression) {
    const result = await page("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });
    assert.ok(
      !result.exceptionDetails,
      "Falha em ação de navegador: " + (result.exceptionDetails?.text ?? "")
    );
    return result.result.value;
  }
  async function waitForCondition(expression, message) {
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error(message);
  }
  async function fill(selector, value, tag = "input") {
    await evaluate(
      `(() => { const element = document.querySelector(${JSON.stringify(selector)}); const proto = ${tag === "select" ? "HTMLSelectElement" : "HTMLInputElement"}.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event(${JSON.stringify(tag === "select" ? "change" : "input")}, { bubbles: true })); })()`
    );
  }
  const click = text =>
    evaluate(
      `[...document.querySelectorAll('button')].find(button => button.textContent.trim() === ${JSON.stringify(text)}).click()`
    );
  const setCookie = value =>
    page("Network.setCookie", {
      name: "app_session_id",
      value,
      url: base,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    });
  await setCookie(ownerToken);
  await page("Page.navigate", { url: `${base}/app/team` });
  await waitForText("Convidar pessoa");
  await fill('input[type="email"]', email);
  await fill("#invite-role", "FINANCIAL", "select");
  await click("Criar convite");
  await waitForText("Link criado");
  const inviteLink = await evaluate(
    'document.querySelector("#created-invite-link").value'
  );
  assert.ok(inviteLink.includes("/invite#token="));
  await setCookie(memberToken);
  await page("Page.navigate", { url: inviteLink });
  await waitForText("Aceitar convite");
  await click("Aceitar convite");
  await waitForText("Convite aceito. Seu acesso está ativo.");
  assert.ok((await client(memberToken).transactions.list.query({})).length > 0);
  await setCookie(ownerToken);
  await page("Page.navigate", { url: `${base}/app/team` });
  await waitForText(name);
  const edit = () =>
    evaluate(
      `document.querySelector('[aria-label="Editar acesso de ${name}"]').click()`
    );
  const toggleActive = () =>
    evaluate(
      `[...document.querySelectorAll('[role="dialog"] label')].find(label => label.textContent.trim() === 'Acesso ativo').querySelector('input').click()`
    );
  const rowState = status =>
    `(() => { const row = [...document.querySelectorAll('tbody tr')].find(row => row.textContent.includes(${JSON.stringify(name)})); return row?.querySelectorAll('td')[2].textContent.trim() === ${JSON.stringify(status)}; })()`;
  await edit();
  await waitForText("Salvar acesso");
  await toggleActive();
  await click("Salvar acesso");
  await waitForCondition(
    rowState("Desativado"),
    "Desativação não apareceu na lista."
  );
  await assert.rejects(
    client(memberToken).transactions.list.query({}),
    error => error.data?.code === "FORBIDDEN"
  );
  await edit();
  await waitForText("Salvar acesso");
  await toggleActive();
  await evaluate(
    `[...document.querySelectorAll('[role="dialog"] label')].find(label => label.textContent.trim() === 'Alterar financeiro').querySelector('input').click()`
  );
  await click("Salvar acesso");
  await waitForCondition(
    rowState("Ativo"),
    "Reativação não apareceu na lista."
  );
  assert.ok((await client(memberToken).transactions.list.query({})).length > 0);
  await assert.rejects(
    client(memberToken).transactions.confirm.mutate({
      code: transactions[0].code,
    }),
    error => error.data?.code === "FORBIDDEN"
  );
  await fill('input[type="email"]', cancelEmail);
  await click("Criar convite");
  await waitForText(cancelEmail);
  await evaluate(
    `document.querySelector('[aria-label="Cancelar convite para ${cancelEmail}"]').click()`
  );
  await waitForCondition(
    `[...document.querySelectorAll('li')].some(item => item.textContent.includes(${JSON.stringify(cancelEmail)}) && item.textContent.includes('Cancelado'))`,
    "Cancelamento do convite não apareceu na lista."
  );
  assert.ok(
    !(await evaluate('!!document.querySelector("#created-invite-link")'))
  );
  await waitForCondition(
    "document.querySelectorAll('[data-sonner-toast]').length === 0",
    "Mensagens temporárias não desapareceram."
  );
  assert.ok(
    !(await evaluate("document.body.innerText.includes('NFS-e Conectado')"))
  );
  assert.ok(
    await evaluate(
      "document.querySelector('header').innerText.includes('Administrador de demonstração')"
    )
  );
  const teamScreenshot = await page("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  await writeFile(
    join(tmpdir(), "mindos-equipe-verificada.png"),
    Buffer.from(teamScreenshot.data, "base64")
  );
  await page("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  const mobileScreenshot = await page("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  await writeFile(
    join(tmpdir(), "mindos-equipe-mobile.png"),
    Buffer.from(mobileScreenshot.data, "base64")
  );
  console.log(
    "Chrome: convite criado e aceito, desativação/reativação, financeiro somente leitura e cancelamento de convite aprovados."
  );
  assert.deepEqual(exceptions, []);
  console.log(
    "Chrome: portal sem sessão, dados do paciente correto, documentos liberados e limpeza após logout aprovados."
  );
  console.log("Screenshot de demonstração: /tmp/mindos-portal-verificado.png");
} finally {
  socket?.close();
  for (const child of [browser, server]) {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([
        new Promise(resolve => child.once("exit", resolve)),
        new Promise(resolve =>
          setTimeout(() => {
            child.kill("SIGKILL");
            resolve();
          }, 3000)
        ),
      ]);
    }
  }
  if (fixture.userId) {
    const placeholders = fixture.emails.map(() => "?").join(",");
    const [invites] = fixture.tenantId
      ? await db.query(
          `SELECT id FROM mindos_team_invites WHERE tenantId = ? AND email IN (${placeholders})`,
          [fixture.tenantId, ...fixture.emails]
        )
      : [[]];
    const [members] = await db.query(
      "SELECT id, tenantId FROM mindos_memberships WHERE userId = ?",
      [fixture.userId]
    );
    for (const invite of invites)
      await db.execute(
        "DELETE FROM mindos_access_audits WHERE tenantId = ? AND subjectType = 'TEAM_INVITE' AND subjectId = ?",
        [fixture.tenantId, invite.id]
      );
    for (const member of members)
      await db.execute(
        "DELETE FROM mindos_access_audits WHERE tenantId = ? AND subjectType = 'MEMBERSHIP' AND subjectId = ?",
        [member.tenantId, member.id]
      );
    if (fixture.tenantId)
      await db.execute(
        `DELETE FROM mindos_team_invites WHERE tenantId = ? AND email IN (${placeholders})`,
        [fixture.tenantId, ...fixture.emails]
      );
    await db.execute("DELETE FROM mindos_memberships WHERE userId = ?", [
      fixture.userId,
    ]);
    await db.execute("DELETE FROM users WHERE id = ?", [fixture.userId]);
  }
  await db.end();
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 200,
  });
}
