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
const careReview = process.argv.includes("--care");
let reviewPatientId = 0;
let patientToken = null;
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
  if (careReview) {
    const patients = await api.patients.list.query({ pageSize: 100 });
    assert.ok(
      patients.items.length,
      "Cadastre um paciente fictício na clínica de revisão primeiro."
    );
    const first = patients.items[0];
    reviewPatientId = first.id;
    const portalOpenId = "mindos-local-review-patient";
    const setup = await mysql.createConnection(process.env.DATABASE_URL);
    try {
      await setup.beginTransaction();
      const [[account]] = await setup.execute(
        "SELECT * FROM users WHERE openId=? FOR UPDATE",
        [portalOpenId]
      );
      let portalUserId;
      if (account) {
        assert.equal(
          account.loginMethod,
          "local-review",
          "Identidade de portal fora do ambiente de revisão."
        );
        portalUserId = account.id;
      } else {
        const [r] = await setup.execute(
          "INSERT INTO users(openId,name,role,loginMethod) VALUES(?,?,'user','local-review')",
          [portalOpenId, "Paciente fictício — revisão local"]
        );
        portalUserId = r.insertId;
      }
      const [members] = await setup.execute(
        "SELECT * FROM mindos_memberships WHERE userId=? FOR UPDATE",
        [portalUserId]
      );
      if (members.length) {
        assert.equal(members.length, 1);
        assert.equal(members[0].tenantId, tenantId);
        assert.equal(members[0].role, "PATIENT");
        assert.ok(
          members[0].active,
          "Acesso do paciente de revisão inativo; revise-o em Equipe."
        );
      } else
        await setup.execute(
          "INSERT INTO mindos_memberships(tenantId,userId,role,permissionsJson) VALUES(?,?,'PATIENT','[]')",
          [tenantId, portalUserId]
        );
      const [[patient]] = await setup.execute(
        "SELECT * FROM mindos_patients WHERE tenantId=? AND id=? FOR UPDATE",
        [tenantId, first.id]
      );
      assert.ok(
        !patient.portalUserId || patient.portalUserId === portalUserId,
        "Paciente fictício já vinculado a outra conta; nenhuma substituição automática será feita."
      );
      await setup.execute(
        "UPDATE mindos_patients SET portalUserId=? WHERE tenantId=? AND id=?",
        [portalUserId, tenantId, first.id]
      );
      await setup.commit();
      patientToken = await new SignJWT({
        openId: portalOpenId,
        appId,
        name: "Paciente fictício — revisão local",
      })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setExpirationTime("2h")
        .sign(new TextEncoder().encode(process.env.JWT_SECRET));
    } catch (error) {
      await setup.rollback();
      throw error;
    } finally {
      await setup.end();
    }
    const clinicianDb = await mysql.createConnection(process.env.DATABASE_URL);
    let newClinicianId = null;
    try {
      await clinicianDb.beginTransaction();
      const clinicianOpenId = "mindos-local-review-clinician";
      const [[existing]] = await clinicianDb.execute(
        "SELECT * FROM users WHERE openId=? FOR UPDATE",
        [clinicianOpenId]
      );
      let clinicianId;
      if (existing) {
        assert.equal(existing.loginMethod, "local-review");
        clinicianId = existing.id;
      } else {
        const [r] = await clinicianDb.execute(
          "INSERT INTO users(openId,name,role,loginMethod) VALUES(?,?,'user','local-review')",
          [clinicianOpenId, "Psicóloga fictícia — revisão local"]
        );
        clinicianId = r.insertId;
      }
      const [members] = await clinicianDb.execute(
        "SELECT * FROM mindos_memberships WHERE userId=? FOR UPDATE",
        [clinicianId]
      );
      if (members.length) {
        assert.equal(members.length, 1);
        assert.equal(members[0].tenantId, tenantId);
      } else {
        await clinicianDb.execute(
          "INSERT INTO mindos_memberships(tenantId,userId,role,permissionsJson) VALUES(?,?,'PSYCHOLOGIST',?)",
          [
            tenantId,
            clinicianId,
            JSON.stringify([
              "VIEW_PATIENT_BASIC",
              "MANAGE_APPOINTMENTS",
              "VIEW_CLINICAL_RECORD",
              "EDIT_CLINICAL_RECORD",
              "VIEW_DOCUMENTS",
              "MANAGE_DOCUMENTS",
            ]),
          ]
        );
        newClinicianId = clinicianId;
      }
      await clinicianDb.commit();
    } catch (error) {
      await clinicianDb.rollback();
      throw error;
    } finally {
      await clinicianDb.end();
    }
    if (newClinicianId)
      await api.care.assign.mutate({
        patientId: first.id,
        userId: newClinicianId,
        active: true,
      });
    if (!(await api.care.records.query({ patientId: first.id })).length) {
      const id = await api.care.createRecord.mutate({
        patientId: first.id,
        recordType: "EVOLUTION",
        content:
          "Registro fictício de demonstração. Nenhuma informação clínica real.",
      });
      await api.care.updateRecord.mutate({
        recordId: id,
        revision: 1,
        content:
          "Registro fictício revisado para demonstrar o histórico de alterações. Nenhuma informação clínica real.",
        finalize: false,
      });
      await api.care.updateRecord.mutate({
        recordId: id,
        revision: 2,
        finalize: true,
      });
      await api.care.createRecord.mutate({
        patientId: first.id,
        parentRecordId: id,
        recordType: "EVOLUTION",
        content:
          "Adendo fictício em rascunho, disponível para revisão e finalização.",
      });
    }
    if (!(await api.care.documents.query({ patientId: first.id })).length) {
      const stream =
        "BT /F1 16 Tf 40 750 Td (Documento ficticio MindOS - revisao local.) Tj ET";
      const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
      ];
      let pdf = "%PDF-1.4\n";
      const offsets = [0];
      for (let i = 0; i < objects.length; i++) {
        offsets.push(Buffer.byteLength(pdf));
        pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
      }
      const xref = Buffer.byteLength(pdf);
      pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
        .slice(1)
        .map(v => String(v).padStart(10, "0") + " 00000 n ")
        .join(
          "\n"
        )}\ntrailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
      const response = await fetch(
        `${base}/api/private-documents/${first.id}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/pdf",
            "X-Document-Title": encodeURIComponent(
              "Orientações fictícias — revisão local"
            ),
            "X-File-Name": "documento-ficticio.pdf",
            "X-Document-Scope": "ADMINISTRATIVE",
          },
          body: Buffer.from(pdf),
        }
      );
      const result = await response.json();
      assert.equal(
        response.status,
        201,
        result.error || "Upload fictício falhou"
      );
      await api.care.documentAccess.mutate({
        documentId: result.id,
        revision: 1,
        action: "RELEASE",
      });
    }
    if (!(await api.care.consentTemplates.query()).length) {
      const saved = await api.care.saveConsent.mutate({
        code: "revisao-local",
        title: "Termo fictício de demonstração",
        body: "Este texto é fictício e serve apenas para revisar o fluxo de consentimento. Não corresponde a um termo real de atendimento. Ao decidir, sua conta, esta versão e a data ficam no histórico de demonstração.",
      });
      await api.care.publishConsent.mutate({ id: saved.id, revision: 1 });
    }
    if (
      !(await api.care.financialLinks.query({ patientId: first.id })).length
    ) {
      const seed = await mysql.createConnection(process.env.DATABASE_URL);
      try {
        const code = `DEMO-PORTAL-${tenantId}`;
        const [[existing]] = await seed.execute(
          "SELECT id FROM transactions WHERE code=?",
          [code]
        );
        if (!existing) {
          await seed.execute(
            "INSERT INTO transactions(tenantId,code,verticalCode,patientName,patientDocument,professionalName,title,category,subtotal,totalAmount,dueDate) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
            [
              tenantId,
              code,
              "PSYCHOLOGY_CLINIC",
              first.fullName,
              "FICTICIO",
              "Profissional fictícia",
              "Lançamento interno fictício de demonstração",
              "DEMO",
              15000,
              15000,
              new Date(),
            ]
          );
          await api.care.financialAccess.mutate({
            patientId: first.id,
            code,
            visible: true,
          });
        }
      } finally {
        await seed.end();
      }
    }
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
  const reviewPath = careReview
    ? `/clinical-records?patientId=${reviewPatientId}`
    : "/agenda";
  await cdp("Page.navigate", { url: `${base}${reviewPath}` }, sessionId);
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
      result.result.value?.includes(
        careReview ? "Prontuário psicológico" : "Novo agendamento"
      ) &&
      result.result.value.includes("Administrador fictício")
    ) {
      ready = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, "A sessão local não abriu a agenda autenticada.");
  console.log(`MindOS aberto para revisão: ${base}${reviewPath}`);
  console.log(
    "Clínica e contas fictícias separadas. Sessão temporária de 2 horas; dados de revisão preservados. Nenhuma credencial Manus alterada."
  );
  if (careReview && patientToken) {
    const { browserContextId } = await cdp("Target.createBrowserContext", {
      disposeOnDetach: false,
    });
    const { targetId } = await cdp("Target.createTarget", {
      url: "about:blank",
      browserContextId,
      newWindow: true,
    });
    const { sessionId: portalSession } = await cdp("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    await cdp("Network.enable", {}, portalSession);
    await cdp(
      "Network.setCookie",
      {
        name: "app_session_id",
        value: patientToken,
        url: base,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
      portalSession
    );
    await cdp("Page.navigate", { url: `${base}/portal` }, portalSession);
    await cdp("Page.bringToFront", {}, portalSession);
    const end = Date.now() + 30000;
    let portalReady = false;
    while (Date.now() < end) {
      const result = await cdp(
        "Runtime.evaluate",
        { expression: "document.body.innerText", returnByValue: true },
        portalSession
      );
      if (result.result.value?.includes("Olá,")) {
        portalReady = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    assert.ok(portalReady, "Portal fictício não abriu autenticado.");
    console.log(`Portal do paciente aberto em janela separada: ${base}/portal`);
  }
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
