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
const fixture = {
  userId: null,
  tenantId: null,
  emails: [],
  patientNames: [],
  operationTenantId: null,
  operationUserId: null,
  publicSlug: `browser-public-${randomUUID()}`,
};
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
      PUBLIC_TENANT_SLUG: fixture.publicSlug,
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
      `(() => { const element = document.querySelector(${JSON.stringify(selector)}); const proto = ${tag === "select" ? "HTMLSelectElement" : tag === "textarea" ? "HTMLTextAreaElement" : "HTMLInputElement"}.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event(${JSON.stringify(tag === "select" ? "change" : "input")}, { bubbles: true })); })()`
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
  await page("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const patientName = `Paciente navegador ${suffix}`;
  const secondName = `Outro paciente navegador ${suffix}`;
  fixture.patientNames = [patientName, secondName];
  await page("Page.navigate", { url: `${base}/patients` });
  await waitForText("Novo paciente");
  await click("Novo paciente");
  await waitForText("Salvar paciente");
  await fill('[role="dialog"] input[required]', patientName);
  await fill('[role="dialog"] input[type="date"]', "1992-02-20");
  await fill(
    '[role="dialog"] input[type="email"]',
    `patient-${suffix}@example.com`
  );
  await fill('[role="dialog"] input[type="tel"]', "(11) 98888-1234");
  await click("Salvar paciente");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Cadastro não fechou após salvar."
  );
  await fill('input[type="search"]', patientName);
  await click("Buscar");
  await waitForText(patientName);
  const newPatient = (
    await ownerClient.patients.list.query({ search: patientName })
  ).items[0];
  assert.ok(newPatient);
  assert.equal(newPatient.birthDate, "1992-02-20");
  await click("Novo paciente");
  await waitForText("Salvar paciente");
  await fill('[role="dialog"] input[required]', patientName.toUpperCase());
  await fill('[role="dialog"] input[type="date"]', "1992-02-20");
  await click("Salvar paciente");
  await waitForText("Possível paciente duplicado");
  await page("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Modal de duplicidade não fechou."
  );
  const editPatient = () =>
    evaluate(
      `document.querySelector('[aria-label="Editar ${patientName}"]').click()`
    );
  await editPatient();
  await waitForText("Editar paciente");
  await fill(
    '[role="dialog"] fieldset > label:last-child select',
    "INACTIVE",
    "select"
  );
  await click("Salvar paciente");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Inativação não salvou."
  );
  assert.equal(
    (await ownerClient.patients.get.query({ patientId: newPatient.id }))
      .administrativeStatus,
    "INACTIVE"
  );
  await page("Page.reload");
  await waitForText(patientName);
  await waitForText("Inativo");
  const patientScreenshot = await page("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  await writeFile(
    join(tmpdir(), "mindos-pacientes-verificado.png"),
    Buffer.from(patientScreenshot.data, "base64")
  );
  await page("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  const patientMobile = await page("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  await writeFile(
    join(tmpdir(), "mindos-pacientes-mobile.png"),
    Buffer.from(patientMobile.data, "base64")
  );
  await page("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await editPatient();
  await waitForText("Editar paciente");
  await fill(
    '[role="dialog"] fieldset > label:last-child select',
    "ACTIVE",
    "select"
  );
  await click("Salvar paciente");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Reativação não salvou."
  );
  assert.equal(
    (await ownerClient.patients.get.query({ patientId: newPatient.id }))
      .administrativeStatus,
    "ACTIVE"
  );
  await evaluate(
    `document.querySelector('a[href="/patients/view?patientId=${newPatient.id}"]').click()`
  );
  await waitForText("Atividade administrativa recente");
  assert.ok((await evaluate("document.body.innerText")).includes(patientName));
  assert.ok(
    !(
      await evaluate("document.querySelector('section h2').innerText")
    ).includes("Marina S. Andrade")
  );
  const second = await ownerClient.patients.create.mutate({
    fullName: secondName,
    birthDate: "1993-02-20",
  });
  const recordContent = `Rascunho fictício de verificação ${suffix}`;
  await page("Page.navigate", {
    url: `${base}/clinical-records?patientId=${newPatient.id}`,
  });
  await waitForText("Novo rascunho");
  await fill("textarea", recordContent, "textarea");
  await click("Salvar rascunho");
  await waitForText("Rascunho salvo para o paciente selecionado.");
  await page("Page.reload");
  await waitForText(recordContent);
  await fill("textarea", "Texto fictício não salvo", "textarea");
  await fill("select", String(second.id), "select");
  await waitForText("Trocar de paciente descarta");
  await click("Continuar editando");
  assert.equal(
    await evaluate("document.querySelector('textarea').value"),
    "Texto fictício não salvo"
  );
  await fill("select", String(second.id), "select");
  await click("Descartar e trocar");
  await waitForText("Nenhum registro para este paciente.");
  assert.ok(
    !(await evaluate("document.body.innerText")).includes(recordContent)
  );
  assert.equal(await evaluate("document.querySelector('textarea').value"), "");
  const [operationTenant] = await db.execute(
    "INSERT INTO mindos_tenants(slug,name,siteConfigJson) VALUES(?,?,'{}')",
    [fixture.publicSlug, "Clínica fictícia de revisão operacional"]
  );
  fixture.operationTenantId = operationTenant.insertId;
  const operationOpenId = `browser-operation-${randomUUID()}`;
  const [operationUser] = await db.execute(
    "INSERT INTO users(openId,name,role) VALUES(?,?,'user')",
    [operationOpenId, "Administrador fictício operacional"]
  );
  fixture.operationUserId = operationUser.insertId;
  await db.execute(
    "INSERT INTO mindos_memberships(tenantId,userId,role,permissionsJson) VALUES(?,?,'OWNER',?)",
    [
      fixture.operationTenantId,
      fixture.operationUserId,
      JSON.stringify(["ALL"]),
    ]
  );
  const operationToken = await tokenFor({
    openId: operationOpenId,
    name: "Administrador fictício operacional",
  });
  const operation = client(operationToken);
  const opPatient = await operation.patients.create.mutate({
    fullName: `Paciente operacional ${suffix}`,
    administrativeStatus: "ACTIVE",
  });
  const opSecond = await operation.patients.create.mutate({
    fullName: `Outro paciente operacional ${suffix}`,
    administrativeStatus: "ACTIVE",
  });
  await setCookie(operationToken);
  await page("Page.navigate", { url: `${base}/app/scheduling` });
  await waitForText("Novo cadastro");
  const professionalName = `Profissional navegador ${suffix}`,
    unitName = `Unidade navegador ${suffix}`,
    serviceName = `Serviço navegador ${suffix}`;
  await click("Novo cadastro");
  await waitForText("Salvar configuração");
  await fill("#config-name", professionalName);
  await click("Salvar configuração");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Profissional não salvou."
  );
  await click("Unidades");
  await click("Novo cadastro");
  await waitForText("Salvar configuração");
  await fill("#config-name", unitName);
  await click("Salvar configuração");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Unidade não salvou."
  );
  await click("Serviços");
  await click("Novo cadastro");
  await waitForText("Salvar configuração");
  await fill("#config-name", serviceName);
  await fill("#config-duration", "30");
  await evaluate("document.querySelector('#config-public').click()");
  await click("Salvar configuração");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Serviço não salvou."
  );
  let config = await operation.scheduling.context.query();
  const prof = config.professionals.find(p => p.name === professionalName),
    unit = config.units.find(u => u.name === unitName),
    service = config.services.find(s => s.name === serviceName);
  assert.ok(prof && unit && service);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.clinic.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const futureDate = new Date(`${today}T12:00:00Z`);
  futureDate.setUTCDate(futureDate.getUTCDate() + 2);
  const future = futureDate.toISOString().slice(0, 10);
  await click("Disponibilidade");
  for (const weekday of [
    new Date(`${today}T12:00:00Z`).getUTCDay(),
    futureDate.getUTCDay(),
  ]) {
    await click("Novo cadastro");
    await waitForText("Salvar configuração");
    await fill("#config-professional", String(prof.id), "select");
    await fill("#config-unit", String(unit.id), "select");
    await fill("#config-weekday", String(weekday), "select");
    await fill("#config-start", "00:00");
    await fill("#config-end", "00:00");
    await click("Salvar configuração");
    await waitForCondition(
      "!document.querySelector('[role=dialog]')",
      "Disponibilidade não salvou."
    );
  }
  const takeScreenshot = async file => {
    await waitForCondition(
      "document.querySelectorAll('[data-sonner-toast]').length === 0",
      "Toast não desapareceu."
    );
    const shot = await page("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
    });
    await writeFile(join(tmpdir(), file), Buffer.from(shot.data, "base64"));
  };
  await takeScreenshot("mindos-configuracao-agenda.png");
  const fillAppointment = async (date, time, count = "1") => {
    await fill("#schedule-professional", String(prof.id), "select");
    await fill("#schedule-unit", String(unit.id), "select");
    await fill("#schedule-service", String(service.id), "select");
    await fill("#schedule-date", date);
    await fill("#schedule-time", time);
    if (await evaluate("!!document.querySelector('#schedule-count')"))
      await fill("#schedule-count", count);
  };
  await page("Page.navigate", {
    url: `${base}/agenda?patientId=${opPatient.id}`,
  });
  await waitForText("Novo agendamento");
  await click("Novo agendamento");
  await waitForText("Salvar agendamento");
  await fillAppointment(future, "09:00", "3");
  await click("Salvar agendamento");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Série não salvou."
  );
  await click("Todas as datas");
  await waitForCondition(
    "document.querySelectorAll('article[data-appointment-id]').length === 3",
    "Série não apareceu."
  );
  let sessions = (
    await operation.scheduling.list.query({ patientId: opPatient.id })
  ).items;
  const first = sessions[0],
    secondSession = sessions[1];
  const rowClick = (id, text) =>
    evaluate(
      `[...document.querySelector('article[data-appointment-id="${id}"]').querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`
    );
  await rowClick(first.id, "Reagendar");
  await waitForText("Salvar reagendamento");
  await fill("#schedule-time", "10:00");
  await click("Salvar reagendamento");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Reagendamento individual não salvou."
  );
  await rowClick(secondSession.id, "Reagendar");
  await waitForText("Salvar reagendamento");
  await fill("#schedule-time", "11:00");
  await fill("#schedule-scope", "SERIES", "select");
  await click("Salvar reagendamento");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Reagendamento da série não salvou."
  );
  sessions = (
    await operation.scheduling.list.query({ patientId: opPatient.id })
  ).items;
  assert.equal(sessions.filter(s => s.status === "RESCHEDULED").length, 3);
  assert.equal(
    sessions.filter(s => s.local.time === "11:00" && s.status === "SCHEDULED")
      .length,
    2
  );
  const moved = sessions.find(
    s => s.local.time === "10:00" && s.status === "SCHEDULED"
  );
  await rowClick(moved.id, "Cancelada");
  await click("Confirmar alteração");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Cancelamento não salvou."
  );
  await takeScreenshot("mindos-agenda-etapa3.png");
  await fill("select", String(opSecond.id), "select");
  await waitForText("Nenhuma sessão cadastrada para os filtros selecionados.");
  await fill("select", String(opPatient.id), "select");
  await click("Novo agendamento");
  await waitForText("Salvar agendamento");
  await fillAppointment(today, "00:00");
  await click("Salvar agendamento");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Sessão de hoje não salvou."
  );
  const todaySession = (await operation.scheduling.list.query({ date: today }))
    .items[0];
  await page("Page.navigate", { url: `${base}/reception` });
  await waitForText("Fila real do dia");
  await waitForText("Check-in");
  await rowClick(todaySession.id, "Check-in");
  await waitForText("Aguardando");
  await waitForCondition(
    `document.querySelector('article[data-appointment-id="${todaySession.id}"]').innerText.includes('Aguardando')`,
    "Check-in não atualizou a sessão."
  );
  await page("Page.navigate", {
    url: `${base}/agenda?patientId=${opPatient.id}`,
  });
  await waitForText("Em atendimento");
  await rowClick(todaySession.id, "Em atendimento");
  await click("Confirmar alteração");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Início não salvou."
  );
  await rowClick(todaySession.id, "Concluída");
  await click("Confirmar alteração");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Conclusão não salvou."
  );
  await page("Network.deleteCookies", { name: "app_session_id", url: base });
  await page("Page.navigate", { url: `${base}/book` });
  await waitForText(serviceName);
  const publicName = `Solicitante navegador ${suffix}`;
  await fill('input[name="name"]', publicName);
  await fill('select[name="contactChannel"]', "EMAIL", "select");
  await fill('input[name="contactValue"]', `public-${suffix}@example.com`);
  await fill('select[name="serviceId"]', String(service.id), "select");
  await fill('input[name="date"]', future);
  await fill('input[name="time"]', "14:00");
  await evaluate("document.querySelector('input[name=consent]').click()");
  await click("Solicitar horário");
  await waitForText("Solicitação recebida");
  await setCookie(operationToken);
  await page("Page.navigate", { url: `${base}/reception` });
  await waitForText(publicName);
  await click("Registrar contato realizado");
  await click("Confirmar triagem");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Contato não salvou."
  );
  await click("Confirmar e agendar");
  await waitForText("Salvar agendamento");
  await fill('[role="dialog"] select', String(opPatient.id), "select");
  await fillAppointment(future, "14:00");
  await click("Salvar agendamento");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Confirmação pública não salvou."
  );
  const requestResult = (await operation.scheduling.requests.query())[0];
  assert.equal(requestResult.status, "CONFIRMED");
  assert.equal(requestResult.patientId, opPatient.id);
  assert.ok(requestResult.appointmentId);
  assert.equal((await operation.patients.list.query({})).total, 2);
  await operation.publicMindos.requestBooking.mutate({
    name: `Recusa navegador ${suffix}`,
    contactChannel: "EMAIL",
    contactValue: `decline-${suffix}@example.com`,
    serviceId: service.id,
    date: future,
    time: "15:00",
    consent: true,
  });
  await page("Page.reload");
  await waitForText(`Recusa navegador ${suffix}`);
  await click("Recusar");
  await click("Confirmar triagem");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Recusa não salvou."
  );
  await waitForText("Recusada");
  await takeScreenshot("mindos-recepcao-etapa3.png");
  await page("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await takeScreenshot("mindos-recepcao-etapa3-mobile.png");
  console.log(
    "Chrome: configurações, disponibilidade, criação de série, edição individual e da série, cancelamento, check-in, conclusão, formulário público, contato, confirmação e recusa aprovados."
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
  if (fixture.operationTenantId) {
    for (const table of [
      "mindos_booking_limits",
      "mindos_booking_requests",
      "mindos_reception_events",
      "mindos_access_audits",
      "mindos_clinical_records",
      "mindos_appointments",
      "mindos_availability",
      "mindos_professionals",
      "mindos_units",
      "mindos_services",
      "mindos_patients",
      "mindos_memberships",
    ])
      await db.execute(`DELETE FROM ${table} WHERE tenantId=?`, [
        fixture.operationTenantId,
      ]);
    if (fixture.operationUserId)
      await db.execute("DELETE FROM users WHERE id=?", [
        fixture.operationUserId,
      ]);
    await db.execute("DELETE FROM mindos_tenants WHERE id=?", [
      fixture.operationTenantId,
    ]);
  }
  if (fixture.tenantId && fixture.patientNames.length) {
    const marks = fixture.patientNames.map(() => "?").join(",");
    const [patients] = await db.query(
      `SELECT id FROM mindos_patients WHERE tenantId = ? AND fullName IN (${marks})`,
      [fixture.tenantId, ...fixture.patientNames]
    );
    for (const patient of patients) {
      const [records] = await db.query(
        "SELECT id FROM mindos_clinical_records WHERE tenantId = ? AND patientId = ?",
        [fixture.tenantId, patient.id]
      );
      for (const record of records)
        await db.execute(
          "DELETE FROM mindos_access_audits WHERE tenantId = ? AND subjectType = 'CLINICAL_RECORD' AND subjectId = ?",
          [fixture.tenantId, record.id]
        );
      for (const table of ["mindos_clinical_records", "mindos_appointments"])
        await db.execute(
          `DELETE FROM ${table} WHERE tenantId = ? AND patientId = ?`,
          [fixture.tenantId, patient.id]
        );
      await db.execute(
        "DELETE FROM mindos_access_audits WHERE tenantId = ? AND subjectType = 'PATIENT' AND subjectId = ?",
        [fixture.tenantId, patient.id]
      );
      await db.execute(
        "DELETE FROM mindos_patients WHERE tenantId = ? AND id = ?",
        [fixture.tenantId, patient.id]
      );
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
