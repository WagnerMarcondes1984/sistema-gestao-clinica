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
let server, browser, socket, debugPage;
const fixture = {
  userId: null,
  tenantId: null,
  emails: [],
  patientNames: [],
  operationTenantId: null,
  operationUserId: null,
  careUserIds: [],
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
      .setExpirationTime("20m")
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
      PRIVATE_DOCUMENT_ROOT: join(profile, "private-documents"),
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
  debugPage = page;
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
    if (tag === "select")
      await waitForCondition(
        `(() => {const element=document.querySelector(${JSON.stringify(selector)});return !!element && !element.disabled && [...element.options].some(o=>o.value===${JSON.stringify(String(value))});})()`,
        `Seleção não ficou disponível: ${selector}`
      );
    await evaluate(
      `(() => { const element = document.querySelector(${JSON.stringify(selector)}); const proto = ${tag === "select" ? "HTMLSelectElement" : tag === "textarea" ? "HTMLTextAreaElement" : "HTMLInputElement"}.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event(${JSON.stringify(tag === "select" ? "change" : "input")}, { bubbles: true })); })()`
    );
  }
  const click = async text => {
    await waitForCondition(
      `[...document.querySelectorAll('button')].some(button => button.textContent.trim()===${JSON.stringify(text)} && !button.disabled)`,
      `Botão não ficou disponível: ${text}`
    );
    return evaluate(
      `[...document.querySelectorAll('button')].find(button => button.textContent.trim()===${JSON.stringify(text)} && !button.disabled).click()`
    );
  };
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
    email: `retorno-${suffix}@example.com`,
    preferredChannel: "EMAIL",
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
  const rowClick = async (id, text) => {
    await waitForCondition(
      `(() => {const row=document.querySelector('article[data-appointment-id="${id}"]');return row && [...row.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(text)} && !b.disabled);})()`,
      `Ação de sessão não ficou disponível: ${text}`
    );
    return evaluate(
      `[...document.querySelector('article[data-appointment-id="${id}"]').querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)} && !b.disabled).click()`
    );
  };
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
  await page("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page("Page.navigate", {
    url: `${base}/clinical-records?patientId=${opPatient.id}`,
  });
  await waitForText("Novo rascunho");
  const clinicalText = `Registro clínico fictício ${suffix}`,
    revisedText = `Registro clínico fictício revisado ${suffix}`;
  await fill("textarea", clinicalText, "textarea");
  await click("Salvar rascunho");
  await waitForCondition(
    "document.querySelector('textarea').value === ''",
    "Rascunho não salvou."
  );
  let record = (
    await operation.care.records.query({ patientId: opPatient.id })
  )[0];
  const recordClick = async (id, text) => {
    await waitForCondition(
      `(() => {const row=document.querySelector('article[data-record-id="${id}"]');return row && [...row.querySelectorAll('button')].some(b=>b.textContent.trim()===${JSON.stringify(text)} && !b.disabled);})()`,
      `Ação clínica não ficou disponível: ${text}`
    );
    return evaluate(
      `[...document.querySelector('article[data-record-id="${id}"]').querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)} && !b.disabled).click()`
    );
  };
  await recordClick(record.id, "Editar rascunho");
  await fill("textarea", revisedText, "textarea");
  await click("Salvar edição");
  await waitForCondition(
    "document.querySelector('textarea').value === ''",
    "Edição não salvou."
  );
  await recordClick(record.id, "Finalizar");
  await click("Confirmar finalização");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Finalização não salvou."
  );
  record = (
    await operation.care.records.query({ patientId: opPatient.id })
  ).find(r => r.id === record.id);
  assert.equal(record.status, "FINALIZED");
  assert.equal(record.integrityStatus, "VERIFIED");
  await recordClick(record.id, "Ver histórico");
  await waitForText("Revisão 3");
  assert.ok(
    (
      await evaluate("document.querySelector('[role=dialog]').innerText")
    ).includes(clinicalText)
  );
  await page("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Histórico não fechou."
  );
  await recordClick(record.id, "Novo adendo");
  await fill("textarea", `Adendo fictício ${suffix}`, "textarea");
  await click("Salvar adendo");
  await waitForCondition(
    "document.querySelector('textarea').value === ''",
    "Adendo não salvou."
  );
  const addendum = (
    await operation.care.records.query({ patientId: opPatient.id })
  ).find(r => r.parentRecordId === record.id);
  await recordClick(addendum.id, "Finalizar");
  await click("Confirmar finalização");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Finalização do adendo não salvou."
  );
  assert.equal(
    (await operation.care.records.query({ patientId: opPatient.id })).find(
      r => r.id === addendum.id
    ).status,
    "ADDENDUM"
  );
  await takeScreenshot("mindos-prontuario-etapa4.png");
  const portalOpenId = `browser-portal-${randomUUID()}`,
    clinicianOpenId = `browser-clinician-${randomUUID()}`;
  async function careAccount(openId, name, role, permissions) {
    const [r] = await db.execute(
      "INSERT INTO users(openId,name,role) VALUES(?,?,'user')",
      [openId, name]
    );
    fixture.careUserIds.push(r.insertId);
    await db.execute(
      "INSERT INTO mindos_memberships(tenantId,userId,role,permissionsJson) VALUES(?,?,?,?)",
      [fixture.operationTenantId, r.insertId, role, JSON.stringify(permissions)]
    );
    return { id: r.insertId, token: await tokenFor({ openId, name }) };
  }
  const portalAccount = await careAccount(
    portalOpenId,
    `Paciente portal fictício ${suffix}`,
    "PATIENT",
    []
  );
  const clinicianName = `Psicólogo navegador ${suffix}`;
  const clinicianAccount = await careAccount(
    clinicianOpenId,
    clinicianName,
    "PSYCHOLOGIST",
    [
      "VIEW_PATIENT_BASIC",
      "VIEW_CLINICAL_RECORD",
      "EDIT_CLINICAL_RECORD",
      "VIEW_DOCUMENTS",
      "MANAGE_DOCUMENTS",
    ]
  );
  await db.execute("UPDATE mindos_patients SET portalUserId=? WHERE id=?", [
    portalAccount.id,
    opPatient.id,
  ]);
  await assert.rejects(
    client(clinicianAccount.token).care.records.query({
      patientId: opPatient.id,
    }),
    e => e.data?.code === "FORBIDDEN"
  );
  await page("Page.navigate", {
    url: `${base}/patient-care?patientId=${opPatient.id}`,
  });
  await waitForText("Acesso clínico");
  await click("Acesso clínico");
  await waitForText(clinicianName);
  const clinicianCheckbox = `[...document.querySelectorAll('label')].find(l=>l.textContent.includes(${JSON.stringify(clinicianName)})).querySelector('input')`;
  await evaluate(`${clinicianCheckbox}.click()`);
  await waitForCondition(
    `${clinicianCheckbox}.checked`,
    "Vínculo clínico não ativou."
  );
  assert.ok(
    (
      await client(clinicianAccount.token).care.records.query({
        patientId: opPatient.id,
      })
    ).length >= 2
  );
  await evaluate(`${clinicianCheckbox}.click()`);
  await waitForCondition(
    `!${clinicianCheckbox}.checked`,
    "Vínculo clínico não revogou."
  );
  await assert.rejects(
    client(clinicianAccount.token).care.records.query({
      patientId: opPatient.id,
    }),
    e => e.data?.code === "FORBIDDEN"
  );
  await click("Documentos");
  await waitForText("Enviar documento privado");
  const docTitle = `Documento privado fictício ${suffix}`;
  await fill('input[required][maxlength="180"]', docTitle);
  const pdfBytes = Buffer.from(
    "%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n"
  );
  const pdfPath = join(profile, "ficticio.pdf");
  await writeFile(pdfPath, pdfBytes);
  await page("DOM.enable");
  const dom = await page("DOM.getDocument");
  const fileInput = await page("DOM.querySelector", {
    nodeId: dom.root.nodeId,
    selector: "#care-upload",
  });
  await page("DOM.setFileInputFiles", {
    nodeId: fileInput.nodeId,
    files: [pdfPath],
  });
  await click("Enviar documento privado");
  await waitForText(docTitle);
  let document = (
    await operation.care.documents.query({ patientId: opPatient.id })
  ).find(d => d.title === docTitle);
  assert.ok(document.hasFile);
  assert.equal(document.portalVisible, false);
  const downloadUrl = `${base}/api/private-documents/${document.id}/download`;
  assert.equal((await fetch(downloadUrl)).status, 401);
  assert.equal(
    (
      await fetch(`${base}/api/private-documents/${opPatient.id}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${portalAccount.token}`,
          "Content-Type": "application/pdf",
          "X-File-Name": "teste.pdf",
          "X-Document-Title": "Teste",
        },
        body: pdfBytes,
      })
    ).status,
    403
  );
  assert.equal(
    (await client(portalAccount.token).care.portal.query()).documents.length,
    0
  );
  const documentClick = text =>
    evaluate(
      `[...document.querySelector('article[data-document-id="${document.id}"]').querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`
    );
  await documentClick("Liberar no portal");
  await waitForText("Liberado no portal");
  const released = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${portalAccount.token}` },
  });
  assert.equal(released.status, 200);
  assert.ok(released.headers.get("cache-control").includes("no-store"));
  assert.ok(Buffer.from(await released.arrayBuffer()).equals(pdfBytes));
  await setCookie(portalAccount.token);
  await page("Page.navigate", { url: `${base}/portal` });
  await waitForText(`Olá, ${opPatient.fullName}`);
  await click("Documentos");
  await waitForText(docTitle);
  await waitForText("Baixar documento");
  await setCookie(operationToken);
  await page("Page.navigate", {
    url: `${base}/patient-care?patientId=${opPatient.id}`,
  });
  await waitForText(docTitle);
  await documentClick("Revogar documento");
  await waitForText("Revogado");
  assert.equal(
    (
      await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${portalAccount.token}` },
      })
    ).status,
    404
  );
  await takeScreenshot("mindos-documentos-etapa4.png");
  await page("Page.navigate", { url: `${base}/app/consents` });
  await waitForText("Novo termo");
  await click("Novo termo");
  await waitForText("Salvar versão");
  await fill("input[pattern]", `termo-${suffix}`);
  await fill("#consent-title", `Termo fictício ${suffix}`);
  await fill(
    "textarea",
    `Texto fictício integral versão um ${suffix}`,
    "textarea"
  );
  await click("Salvar versão");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Termo não salvou."
  );
  await click("Publicar versão");
  await click("Confirmar publicação");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Termo não publicou."
  );
  await setCookie(portalAccount.token);
  await page("Page.navigate", { url: `${base}/portal` });
  await waitForText(`Olá, ${opPatient.fullName}`);
  await click("Consentimentos");
  await waitForText(`Texto fictício integral versão um ${suffix}`);
  await click("Aceitar termo");
  await evaluate("document.querySelector('#portal-consent-ack').click()");
  await click("Confirmar decisão");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Aceite não salvou."
  );
  assert.equal(
    (await client(portalAccount.token).care.portal.query()).consentHistory[0]
      .decision,
    "ACCEPTED"
  );
  await setCookie(operationToken);
  await page("Page.navigate", { url: `${base}/app/consents` });
  await waitForText("Criar nova versão");
  await click("Criar nova versão");
  await waitForText("Salvar versão");
  await fill(
    "textarea",
    `Texto fictício integral versão dois ${suffix}`,
    "textarea"
  );
  await click("Salvar versão");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Nova versão não salvou."
  );
  await click("Publicar versão");
  await click("Confirmar publicação");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Nova versão não publicou."
  );
  await setCookie(portalAccount.token);
  await page("Page.navigate", { url: `${base}/portal` });
  await waitForText(`Olá, ${opPatient.fullName}`);
  await click("Consentimentos");
  await waitForText(`Texto fictício integral versão dois ${suffix}`);
  await waitForText("Aguardando sua decisão");
  await click("Não aceitar");
  await evaluate("document.querySelector('#portal-consent-ack').click()");
  await click("Confirmar decisão");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Não aceite não salvou."
  );
  await click("Aceitar termo");
  await evaluate("document.querySelector('#portal-consent-ack').click()");
  await click("Confirmar decisão");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Segundo aceite não salvou."
  );
  await click("Retirar aceite");
  await evaluate("document.querySelector('#portal-consent-ack').click()");
  await click("Confirmar decisão");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Retirada não salvou."
  );
  let portalState = await client(portalAccount.token).care.portal.query();
  assert.deepEqual(
    portalState.consentHistory.map(d => d.decision),
    ["ACCEPTED", "DECLINED", "ACCEPTED", "WITHDRAWN"]
  );
  await takeScreenshot("mindos-portal-consentimentos-etapa4.png");
  await page("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await takeScreenshot("mindos-portal-etapa4-mobile.png");
  await page("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const chargeCode = `PORTAL-${suffix}`;
  await db.execute(
    "INSERT INTO transactions(tenantId,code,verticalCode,patientName,patientDocument,professionalName,title,category,subtotal,totalAmount,dueDate) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    [
      fixture.operationTenantId,
      chargeCode,
      "PSYCHOLOGY_CLINIC",
      opPatient.fullName,
      "FICTICIO",
      professionalName,
      "Lançamento fictício de teste",
      "TEST",
      12345,
      12345,
      new Date(),
    ]
  );
  assert.equal(
    (await client(portalAccount.token).care.portal.query()).financial.length,
    0
  );
  await setCookie(operationToken);
  await page("Page.navigate", {
    url: `${base}/patient-care?patientId=${opPatient.id}`,
  });
  await waitForText("Financeiro no portal");
  await click("Financeiro no portal");
  await fill('input[maxlength="32"]', chargeCode);
  await click("Vincular e liberar");
  await waitForText(chargeCode);
  await setCookie(portalAccount.token);
  await page("Page.navigate", { url: `${base}/portal` });
  await waitForText(`Olá, ${opPatient.fullName}`);
  await click("Financeiro");
  await waitForText(chargeCode);
  assert.equal(
    (await client(portalAccount.token).care.portal.query()).financial.length,
    1
  );
  await click("Agenda");
  portalState = await client(portalAccount.token).care.portal.query();
  const futureSession = portalState.appointments.find(
    a =>
      ["SCHEDULED", "CONFIRMED"].includes(a.status) &&
      new Date(a.startsAt) > new Date()
  );
  assert.ok(futureSession);
  await evaluate(
    `[...document.querySelector('article[data-portal-appointment-id="${futureSession.id}"]').querySelectorAll('button')].find(b=>b.textContent.trim()==='Solicitar reagendamento').click()`
  );
  await waitForText("Enviar solicitação");
  const preferredDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: config.clinic.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(futureSession.startsAt));
  await fill("#portal-request-date", preferredDate);
  await fill("#portal-request-time", "12:00");
  await click("Enviar solicitação");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Pedido de reagendamento não salvou."
  );
  await waitForText("Aguardando equipe");
  await setCookie(operationToken);
  await page("Page.navigate", { url: `${base}/reception` });
  await waitForText("Aprovar reagendamento");
  await click("Aprovar reagendamento");
  await waitForText("Salvar reagendamento");
  await fillAppointment(preferredDate, "12:00");
  await click("Salvar reagendamento");
  await waitForCondition(
    "!document.querySelector('[role=dialog]')",
    "Aprovação de reagendamento não salvou."
  );
  await waitForText("Aprovada");
  portalState = await client(portalAccount.token).care.portal.query();
  assert.equal(portalState.rescheduleRequests[0].status, "APPROVED");
  assert.ok(portalState.rescheduleRequests[0].replacementAppointmentId);
  assert.equal(
    portalState.appointments.find(a => a.id === futureSession.id).status,
    "RESCHEDULED"
  );
  await takeScreenshot("mindos-reagendamento-portal-etapa4.png");
  console.log(
    "Chrome: edição, finalização, adendo, histórico, vínculo clínico, upload privado, liberação, download autenticado, revogação, termos versionados, aceite/não aceite/retirada, financeiro liberado e reagendamento pelo portal aprovados."
  );
  // Etapa 5: exercita a interface e confere o resultado persistido.
  const labelFill = async (label, value, tag = "input") => {
    const get = `[...document.querySelectorAll('label')].find(l=>l.firstChild?.textContent.trim()===${JSON.stringify(label)})?.querySelector(${JSON.stringify(tag)})`;
    await waitForCondition(
      `(()=>{const e=${get};return !!e && !e.disabled ${tag === "select" ? `&& [...e.options].some(o=>o.value===${JSON.stringify(String(value))})` : ""};})()`,
      `Campo indisponível: ${label}`
    );
    await evaluate(
      `(()=>{const e=${get};Object.getOwnPropertyDescriptor(${tag === "select" ? "HTMLSelectElement" : tag === "textarea" ? "HTMLTextAreaElement" : "HTMLInputElement"}.prototype,'value').set.call(e,${JSON.stringify(String(value))});e.dispatchEvent(new Event(${JSON.stringify(tag === "select" ? "change" : "input")},{bubbles:true}));})()`
    );
  };
  const closedDialog = () =>
    waitForCondition(
      "!document.querySelector('[role=dialog]')",
      "Operação financeira não concluiu."
    );
  const financeArticleClick = async (title, button) => {
    const expression = `(()=>{const a=[...document.querySelectorAll('article')].find(a=>a.textContent.includes(${JSON.stringify(title)}));return a && [...a.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(button)} && !b.disabled);})()`;
    await waitForCondition(`!!${expression}`, "Ação financeira não disponível");
    await evaluate(`${expression}.click()`);
  };
  await setCookie(operationToken);
  await page("Page.navigate", { url: `${base}/checkout` });
  await waitForText("Nova cobrança interna");
  await labelFill("Paciente", opPatient.id, "select");
  const financeTitle = `Cobrança financeira fictícia ${suffix}`;
  await labelFill("Descrição", financeTitle);
  await labelFill("Serviço", "Sessão fictícia");
  await labelFill("Preço unitário (R$)", "10.01");
  await labelFill("Desconto (R$)", "0.01");
  await labelFill("Acréscimo (R$)", "0.02");
  await labelFill("Parcelas", "3");
  await labelFill("Primeiro vencimento", preferredDate);
  await click("Revisar cobrança");
  await waitForText("Revisar nova cobrança");
  await click("Confirmar registro");
  await closedDialog();
  let financeRow = (await operation.transactions.list.query({})).find(
    r => r.title === financeTitle
  );
  assert.equal(financeRow.totalAmount, 1002);
  assert.deepEqual(
    financeRow.parts.map(p => p.amount),
    [334, 334, 334]
  );
  assert.equal(financeRow.paidAmount, 0);
  assert.equal(financeRow.invoiceStatus, "NOT_ISSUED");
  await page("Page.navigate", { url: `${base}/transactions` });
  await waitForText(financeTitle);
  await financeArticleClick(financeTitle, "Registrar recebimento manual");
  await labelFill(
    "Referência do comprovante / controle",
    "Referência fictícia do navegador"
  );
  await click("Confirmar registro");
  await waitForText("Confira:");
  await click("Confirmar registro");
  await closedDialog();
  financeRow = await operation.transactions.getByCode.query({
    code: financeRow.code,
  });
  assert.equal(financeRow.paidAmount, 1002);
  assert.equal(financeRow.invoiceStatus, "NOT_ISSUED");
  await financeArticleClick(financeTitle, "Registrar reversão interna");
  await labelFill("Valor (R$)", "2.00");
  await labelFill(
    "Referência do comprovante / controle",
    "Devolução fictícia conferida"
  );
  await labelFill("Motivo da reversão", "Reversão fictícia para teste visual");
  await click("Confirmar registro");
  await waitForText("Confira:");
  await click("Confirmar registro");
  await closedDialog();
  financeRow = await operation.transactions.getByCode.query({
    code: financeRow.code,
  });
  assert.equal(financeRow.refundedAmount, 200);
  assert.equal(financeRow.status, "PARTIALLY_REFUNDED");
  await financeArticleClick(financeTitle, "Parcelas e histórico");
  await waitForText("Parcela 3:");
  await click("Fechar histórico");
  await takeScreenshot("mindos-financeiro-etapa5.png");
  await page("Page.navigate", { url: `${base}/cash` });
  await waitForText("Abrir caixa");
  await click("Abrir caixa");
  await labelFill("Valor (R$)", "20.00");
  await click("Confirmar registro");
  await waitForText("Valor conferido:");
  await click("Confirmar registro");
  await closedDialog();
  await click("Suprimento");
  await labelFill("Valor (R$)", "5.00");
  await labelFill("Motivo / observação", "Fundo fictício de teste");
  await click("Confirmar registro");
  await waitForText("Valor conferido:");
  await click("Confirmar registro");
  await closedDialog();
  await click("Sangria");
  await labelFill("Valor (R$)", "2.00");
  await labelFill("Motivo / observação", "Retirada fictícia conferida");
  await click("Confirmar registro");
  await waitForText("Valor conferido:");
  await click("Confirmar registro");
  await closedDialog();
  assert.equal(
    (await operation.cash.current.query({ verticalCode: "PSYCHOLOGY_CLINIC" }))
      .expectedBalance,
    2300
  );
  await page("Page.navigate", { url: `${base}/checkout` });
  await waitForText("Nova cobrança interna");
  await labelFill("Paciente", opPatient.id, "select");
  const cashTitle = `Recebimento em espécie fictício ${suffix}`;
  await labelFill("Descrição", cashTitle);
  await labelFill("Serviço", "Sessão em dinheiro");
  await labelFill("Preço unitário (R$)", "10.00");
  await labelFill("Primeiro vencimento", preferredDate);
  await labelFill("Meio informado", "CASH", "select");
  await click("Revisar cobrança");
  await waitForText("Revisar nova cobrança");
  await click("Confirmar registro");
  await closedDialog();
  await page("Page.navigate", { url: `${base}/transactions` });
  await waitForText(cashTitle);
  await financeArticleClick(cashTitle, "Registrar recebimento manual");
  await labelFill(
    "Referência do comprovante / controle",
    "Recebimento fictício da recepção"
  );
  await labelFill("Dinheiro entregue (R$)", "12.00");
  await click("Confirmar registro");
  await waitForText("troco");
  await click("Confirmar registro");
  await closedDialog();
  const cashRow = (await operation.transactions.list.query({})).find(
    r => r.title === cashTitle
  );
  const cashDetail = await operation.transactions.getByCode.query({
    code: cashRow.code,
  });
  assert.equal(cashDetail.cashChange, 200);
  assert.equal(
    (await operation.cash.current.query({ verticalCode: "PSYCHOLOGY_CLINIC" }))
      .expectedBalance,
    3300
  );
  await page("Page.navigate", { url: `${base}/payables` });
  await waitForText("Nova despesa");
  const supplier = `Fornecedor fictício ${suffix}`;
  await labelFill("Fornecedor", supplier);
  await labelFill("Descrição da despesa", "Material fictício de teste");
  await labelFill("Valor da despesa (R$)", "3.50");
  await labelFill("Vencimento da despesa", preferredDate);
  await labelFill("Meio informado", "CASH", "select");
  await click("Revisar despesa");
  await waitForText("Revisar despesa");
  await click("Confirmar registro");
  await closedDialog();
  await financeArticleClick(supplier, "Registrar pagamento manual");
  await labelFill(
    "Referência do comprovante / controle",
    "Recibo fictício do fornecedor"
  );
  await click("Confirmar registro");
  await waitForText("Confira:");
  await click("Confirmar registro");
  await closedDialog();
  assert.equal(
    (await operation.cash.current.query({ verticalCode: "PSYCHOLOGY_CLINIC" }))
      .expectedBalance,
    2950
  );
  await page("Page.navigate", { url: `${base}/cash` });
  await waitForText("Conferir e fechar caixa");
  await click("Conferir e fechar caixa");
  await labelFill("Valor físico contado (R$)", "29.00");
  await labelFill(
    "Motivo / observação",
    "Diferença fictícia de cinquenta centavos"
  );
  await click("Confirmar registro");
  await waitForText("Valor conferido:");
  await click("Confirmar registro");
  await closedDialog();
  assert.equal(
    await operation.cash.current.query({ verticalCode: "PSYCHOLOGY_CLINIC" }),
    undefined
  );
  const cashHistory = await operation.cash.list.query({});
  assert.equal(cashHistory[0].difference, -50);
  await page("Page.navigate", { url: `${base}/finance` });
  await waitForText("Livro de movimentos");
  await waitForText("Devolução fictícia conferida");
  const financialReport = await operation.dashboard.metrics.query({});
  assert.equal(financialReport.totalReceived, 1802);
  assert.equal(financialReport.paidPayable, 350);
  assert.equal(financialReport.netBalance, 1452);
  assert.equal(financialReport.cashBalance, 0);
  await page("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await takeScreenshot("mindos-financeiro-etapa5-mobile.png");
  await page("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await setCookie(memberToken);
  await page("Page.navigate", { url: `${base}/checkout` });
  await waitForText("Seu acesso permite somente consulta.");
  assert.equal(
    await evaluate(
      "!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Revisar cobrança')"
    ),
    false
  );
  await setCookie(portalAccount.token);
  await page("Page.navigate", { url: `${base}/finance` });
  await waitForText("Permissão insuficiente");
  console.log(
    "Chrome: criação de cobrança, parcelas, baixa e reversão manual, histórico, abertura, suprimento, sangria, dinheiro/troco, despesa, fechamento com diferença, relatório e acesso somente leitura aprovados."
  );

  // Etapa 6: lead → interação → tarefa → conversão → preferências → lembretes.
  await setCookie(operationToken);
  await page("Page.navigate", { url: `${base}/crm` });
  await waitForText("CRM administrativo");
  await waitForText("Novo lead");
  const crmName = `Lead CRM fictício ${suffix}`,
    crmEmail = `crm-${suffix}@example.com`;
  const crmLocal = d =>
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: config.clinic.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .format(d)
      .replace(" ", "T");
  await click("Novo lead");
  await fill("#crm-name", crmName);
  await fill("#crm-email", crmEmail);
  await fill("#crm-owner", String(fixture.operationUserId), "select");
  await fill("#crm-date", crmLocal(new Date(Date.now() + 86400000)));
  await click("Salvar registro");
  await closedDialog();
  await waitForText(crmName);
  let crmLead = (await operation.crm.overview.query()).leads.find(
    l => l.fullName === crmName
  );
  const crmLeadClick = async text => {
    const expr = `[...document.querySelector('[data-lead-id="${crmLead.id}"]').querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)} && !b.disabled)`;
    await waitForCondition(`!!(${expr})`, "Ação do lead não disponível");
    await evaluate(`(${expr}).click()`);
  };
  await crmLeadClick("Gerenciar lead");
  await fill("#crm-stage", "CONTACTED", "select");
  await click("Salvar registro");
  await closedDialog();
  crmLead = (await operation.crm.overview.query()).leads.find(
    l => l.id === crmLead.id
  );
  assert.equal(crmLead.stage, "CONTACTED");
  await crmLeadClick("Registrar interação");
  await fill(
    "#crm-summary",
    `Contato administrativo fictício ${suffix}`,
    "textarea"
  );
  await click("Salvar registro");
  await closedDialog();
  await crmLeadClick("Histórico");
  await waitForText(`Contato administrativo fictício ${suffix}`);
  await evaluate(
    "document.querySelector('[role=dialog] button[data-slot=dialog-close]').click()"
  );
  await crmLeadClick("Criar tarefa");
  await fill("#crm-owner", String(fixture.operationUserId), "select");
  await fill("#crm-date", crmLocal(new Date(Date.now() - 3600000)));
  await fill("#crm-task-title", `Retorno CRM fictício ${suffix}`);
  await click("Salvar registro");
  await closedDialog();
  await click("Tarefas");
  await waitForText(`Retorno CRM fictício ${suffix}`);
  await waitForText("Vencida");
  await click("Editar tarefa");
  await fill("#crm-date", crmLocal(new Date(Date.now() + 86400000)));
  await click("Salvar registro");
  await closedDialog();
  await click("Concluir ou cancelar");
  await fill(
    "#crm-task-resolution",
    "Retorno administrativo conferido no teste"
  );
  await click("Salvar registro");
  await closedDialog();
  await waitForText("Concluída");
  await click("Leads");
  await crmLeadClick("Converter em paciente");
  await evaluate("document.querySelector('#crm-identity-ack').click()");
  await click("Salvar registro");
  await closedDialog();
  crmLead = (await operation.crm.overview.query()).leads.find(
    l => l.id === crmLead.id
  );
  assert.equal(crmLead.stage, "CONVERTED");
  assert.ok(crmLead.patientId);
  const publicCrm = await client().publicMindos.requestBooking.mutate({
    name: crmName,
    contactChannel: "EMAIL",
    contactValue: crmEmail,
    serviceId: service.id,
    date: future,
    time: "16:00",
    consent: true,
  });
  const patientCount = (await operation.crm.overview.query()).patients.length;
  await page("Page.reload");
  await waitForText("Solicitações online");
  await click("Solicitações online");
  await click(`Importar solicitação #${publicCrm.requestId}`);
  await fill("#crm-import-target", String(crmLead.id), "select");
  await evaluate("document.querySelector('#crm-import-ack').click()");
  await click("Salvar registro");
  await closedDialog();
  const imported = (await operation.scheduling.requests.query()).find(
    r => r.id === publicCrm.requestId
  );
  assert.equal(imported.crmLeadId, crmLead.id);
  assert.equal(
    (await operation.crm.overview.query()).patients.length,
    patientCount
  );
  await click("Pacientes e preferências");
  await fill("#crm-patient", String(opPatient.id), "select");
  await waitForText("Origem da preferência informada");
  await fill(
    "#crm-pref-reason",
    "Preferência fictícia informada pelo paciente"
  );
  await click("E-mail: bloqueado");
  await waitForText("E-mail: autorizado");
  await click("WhatsApp: bloqueado");
  await waitForText("WhatsApp: autorizado");
  await click("Criar tarefa de retorno");
  await fill("#crm-owner", String(fixture.operationUserId), "select");
  await fill("#crm-date", crmLocal(new Date(Date.now() + 86400000)));
  await fill("#crm-task-title", `Retorno ao paciente fictício ${suffix}`);
  await click("Salvar registro");
  await closedDialog();
  await click("Lembretes");
  await click("Preparar lembretes");
  await waitForText("Aguardando provedor");
  const beforeQueue = (await operation.crm.reminders.query()).items.length;
  await click("Preparar lembretes");
  await waitForCondition(
    `!document.querySelector('fieldset[disabled]')`,
    "Preparação ocupada"
  );
  assert.equal(
    (await operation.crm.reminders.query()).items.length,
    beforeQueue
  );
  assert.equal(
    (await operation.crm.reminders.query()).providerConfigured,
    false
  );
  await click("Indicadores");
  await waitForText("Leads convertidos");
  assert.equal((await operation.crm.metrics.query()).converted, 1);
  await takeScreenshot("mindos-crm-etapa6.png");
  await page("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await takeScreenshot("mindos-crm-etapa6-mobile.png");
  await page("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await setCookie(portalAccount.token);
  await page("Page.navigate", { url: `${base}/portal` });
  await waitForText(`Olá, ${opPatient.fullName}`);
  await click("Preferências");
  await waitForText("E-mail: autorizado");
  await click("E-mail: autorizado");
  await waitForText("E-mail: bloqueado");
  await click("WhatsApp: autorizado");
  await waitForText("WhatsApp: bloqueado");
  assert.ok(
    (await operation.crm.reminders.query()).items
      .filter(r => r.patientId === opPatient.id)
      .every(r => r.status === "SUPPRESSED" || r.status === "CANCELLED")
  );
  const crmReader = await careAccount(
    `browser-crm-reader-${randomUUID()}`,
    `Consulta CRM fictícia ${suffix}`,
    "ASSISTANT",
    ["VIEW_CRM"]
  );
  await setCookie(crmReader.token);
  await page("Page.navigate", { url: `${base}/crm` });
  await waitForText("Somente consulta");
  assert.equal(
    await evaluate(
      "!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Novo lead')"
    ),
    false
  );
  console.log(
    "Chrome: lead, responsável, etapa, interação/histórico, tarefa vencida/edição/conclusão, conversão sem duplicação, importação conferida, preferências da equipe e paciente, lembretes sem envio, indicadores e leitura restrita aprovados."
  );

  // Etapa 7: rascunho privado → aprovação → publicação → nova versão → restauração.
  await setCookie(operationToken);
  await page("Page.navigate", { url: `${base}/app/admin-studio` });
  await waitForText("Nome público");
  const siteName = `Clínica pública fictícia ${suffix}`,
    siteTitle = `Site fictício ${suffix}`,
    siteHero = `Apresentação pública fictícia ${suffix}`;
  await fill("#site-name", siteName);
  await click("Blocos de conteúdo");
  await labelFill("Título do bloco", siteHero);
  await labelFill(
    "Texto do bloco",
    "Texto público fictício, sem informações de pacientes.",
    "textarea"
  );
  await click("Metadados e contato");
  await fill("#site-seo-title", siteTitle);
  await fill(
    "#site-description",
    "Descrição pública fictícia para verificar publicação e metadados do site.",
    "textarea"
  );
  await fill("#site-summary", "Primeiro conteúdo público fictício revisado");
  await click("Salvar novo rascunho");
  await waitForText(
    "Rascunho salvo. O site público continua na versão publicada."
  );
  let cmsState = await operation.mindos.cms.versions.query();
  const firstSiteVersion = cmsState.versions[0];
  assert.equal(firstSiteVersion.content.brand.name, siteName);
  assert.equal((await fetch(`${base}/site/${fixture.publicSlug}`)).status, 404);
  const previewUrl = `${base}/api/site-preview/${firstSiteVersion.id}`;
  assert.equal((await fetch(previewUrl)).status, 403);
  const preview = await fetch(previewUrl, {
    headers: { Authorization: `Bearer ${operationToken}` },
  });
  assert.equal(preview.status, 200);
  assert.ok(preview.headers.get("x-robots-tag").includes("noindex"));
  assert.ok((await preview.text()).includes(siteHero));
  assert.equal(
    (
      await fetch(previewUrl, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      })
    ).status,
    404
  );
  await click("Versões e publicação");
  const siteVersionClick = async (id, text) => {
    const expr = `[...document.querySelector('[data-version-id="${id}"]').querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled)`;
    await waitForCondition(`!!(${expr})`, "Ação da versão não disponível");
    await evaluate(`(${expr}).click()`);
  };
  const confirmSite = async () => {
    await waitForCondition(
      "!!document.querySelector('#site-action-ack')",
      "Confirmação da versão ausente"
    );
    await evaluate("document.querySelector('#site-action-ack').click()");
    await click("Confirmar operação");
    await closedDialog();
  };
  await siteVersionClick(firstSiteVersion.id, "Aprovar versão");
  await confirmSite();
  assert.equal((await fetch(`${base}/site/${fixture.publicSlug}`)).status, 404);
  await siteVersionClick(firstSiteVersion.id, "Publicar versão");
  await confirmSite();
  const publicUrl = `${base}/site/${fixture.publicSlug}`;
  let publicResponse = await fetch(publicUrl);
  assert.equal(publicResponse.status, 200);
  const firstSiteHtml = await publicResponse.text();
  assert.ok(firstSiteHtml.includes(`<title>${siteTitle}</title>`));
  assert.ok(firstSiteHtml.includes(siteHero));
  assert.ok(!firstSiteHtml.includes(opPatient.fullName));
  assert.ok(!firstSiteHtml.includes("createdByUserId"));
  assert.ok(
    (await (await fetch(`${publicUrl}/llms.txt`)).text()).includes(siteHero)
  );
  await siteVersionClick(firstSiteVersion.id, "Carregar no editor");
  await waitForText("Nome público");
  await fill("#site-name", `${siteName} — nova versão`);
  await fill("#site-summary", "Segunda marca pública fictícia revisada");
  await click("Salvar novo rascunho");
  await waitForText(
    "Rascunho salvo. O site público continua na versão publicada."
  );
  assert.equal(await (await fetch(publicUrl)).text(), firstSiteHtml);
  cmsState = await operation.mindos.cms.versions.query();
  const secondSiteVersion = cmsState.versions[0];
  await click("Versões e publicação");
  await siteVersionClick(secondSiteVersion.id, "Aprovar versão");
  await confirmSite();
  await siteVersionClick(secondSiteVersion.id, "Publicar versão");
  await confirmSite();
  assert.ok(
    (await (await fetch(publicUrl)).text()).includes(
      `${siteName} — nova versão`
    )
  );
  const brandedPortal = await client(
    portalAccount.token
  ).mindos.portalData.query();
  assert.equal(brandedPortal.brand.name, `${siteName} — nova versão`);
  await siteVersionClick(firstSiteVersion.id, "Restaurar versão");
  await confirmSite();
  assert.equal(await (await fetch(publicUrl)).text(), firstSiteHtml);
  await takeScreenshot("mindos-admin-etapa7.png");
  await page("Page.navigate", { url: publicUrl });
  await waitForText(siteHero);
  await takeScreenshot("mindos-site-etapa7.png");
  await page("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await takeScreenshot("mindos-site-etapa7-mobile.png");
  assert.ok(
    await evaluate("document.documentElement.scrollWidth<=window.innerWidth")
  );
  await page("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page("Page.navigate", {
    url: `${base}/book?clinic=${fixture.publicSlug}`,
  });
  await waitForText("Solicitar um horário");
  await waitForText("Clínica fictícia de revisão operacional");
  const cmsReader = await careAccount(
    `browser-cms-reader-${randomUUID()}`,
    `Consulta do site fictícia ${suffix}`,
    "SALES",
    ["VIEW_PUBLIC_SITE"]
  );
  await setCookie(cmsReader.token);
  await page("Page.navigate", { url: `${base}/app/admin-studio` });
  await waitForText("Somente consulta");
  await click("Versões e publicação");
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('button')].some(b=>['Aprovar versão','Publicar versão','Restaurar versão'].includes(b.textContent.trim()))"
    ),
    false
  );
  await setCookie(portalAccount.token);
  await page("Page.navigate", { url: `${base}/app/admin-studio` });
  await waitForText("Permissão insuficiente");
  console.log(
    "Chrome: edição persistente de marca/blocos/SEO, rascunho separado do público, prévia privada entre clínicas, aprovação, publicação, restauração exata, marca no portal, metadados/llms.txt, agendamento por slug e consulta restrita aprovados."
  );

  assert.deepEqual(exceptions, []);
  console.log(
    "Chrome: portal sem sessão, dados do paciente correto, documentos liberados e limpeza após logout aprovados."
  );
  console.log("Screenshot de demonstração: /tmp/mindos-portal-verificado.png");
} catch (error) {
  if (debugPage)
    try {
      const state = await debugPage("Runtime.evaluate", {
        expression:
          "document.querySelector('[role=dialog]')?.innerText || document.body.innerText.slice(-2500)",
        returnByValue: true,
      });
      console.error("Estado fictício da falha:", state.result.value);
      const shot = await debugPage("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
      });
      await writeFile(
        join(tmpdir(), "mindos-browser-falha.png"),
        Buffer.from(shot.data, "base64")
      );
    } catch {}
  throw error;
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
    await db.execute(
      "DELETE FROM transaction_items WHERE transactionId IN (SELECT id FROM transactions WHERE tenantId=?)",
      [fixture.operationTenantId]
    );
    for (const table of [
      "mindos_cms_versions",
      "mindos_crm_reminders",
      "mindos_contact_preferences",
      "mindos_crm_interactions",
      "mindos_crm_tasks",
      "mindos_crm_leads",
      "financial_movements",
      "financial_operations",
      "financial_installments",
      "financial_audit_logs",
      "accounts_payable",
      "cash_sessions",
      "mindos_consent_decisions",
      "mindos_consent_templates",
      "mindos_reschedule_requests",
      "mindos_clinical_versions",
      "mindos_patient_clinicians",
      "mindos_portal_documents",
      "transactions",
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
    for (const userId of fixture.careUserIds)
      await db.execute("DELETE FROM users WHERE id=?", [userId]);
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
      for (const record of records) {
        await db.execute(
          "DELETE FROM mindos_clinical_versions WHERE tenantId=? AND recordId=?",
          [fixture.tenantId, record.id]
        );
        await db.execute(
          "DELETE FROM mindos_access_audits WHERE tenantId = ? AND subjectType = 'CLINICAL_RECORD' AND subjectId = ?",
          [fixture.tenantId, record.id]
        );
      }
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
