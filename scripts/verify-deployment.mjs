// Homologação técnica local da imagem: sem VPS, domínio ou autenticação externa.
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import mysql from "mysql2/promise";
import { SignJWT } from "jose";
import { command, privateDirectory, receiptPublicKey } from "./lib/backup.mjs";
if (
  process.env.APP_ENV === "production" ||
  process.env.NODE_ENV === "production"
)
  throw new Error("Ensaio de imagem exige ambiente local");
const image = process.env.DEPLOYMENT_TEST_IMAGE || "mindos:stage8-review";
assert.match(image, /^[a-zA-Z0-9][a-zA-Z0-9_./:@-]{0,200}$/);
const suffix = randomUUID().replaceAll("-", ""),
  dbName = "mindos-deploy-db-" + suffix,
  appName = "mindos-deploy-app-" + suffix;
const password = () => randomBytes(32).toString("base64url");
const credentials = {
  MYSQL_ROOT_PASSWORD: password(),
  MYSQL_PASSWORD: password(),
  MYSQL_RUNTIME_PASSWORD: password(),
};
let dbCreated = false,
  appCreated = false,
  work,
  phase = "image",
  passed = false;
try {
  console.log(JSON.stringify({ event: "deployment.check", phase }));
  assert.equal(
    (
      await command("docker", [
        "image",
        "inspect",
        "--format",
        "{{.Config.User}}",
        image,
      ])
    ).trim(),
    "node"
  );
  await command("docker", [
    "run",
    "--no-healthcheck",
    "--rm",
    "--network",
    "none",
    image,
    "node",
    "-e",
    "require('fs').appendFile('dist/index.js','\\n// forbidden',error=>process.exit(error?.code==='EACCES'?0:1))",
  ]);
  const build = JSON.parse(
    await command("docker", [
      "run",
      "--no-healthcheck",
      "--rm",
      "--network",
      "none",
      image,
      "node",
      "-e",
      "process.stdout.write(require('fs').readFileSync('dist/build-info.json','utf8'))",
    ])
  );
  assert.ok(
    build.appId &&
      build.oauthPortal.startsWith("https://") &&
      !build.oauthPortal.includes(".example.com"),
    "Gere a imagem de teste com os parâmetros públicos fictícios .test descritos no guia"
  );
  await assert.rejects(
    command("docker", [
      "run",
      "--no-healthcheck",
      "--rm",
      "--network",
      "none",
      image,
    ])
  );
  phase = "database-init";
  console.log(JSON.stringify({ event: "deployment.check", phase }));
  await command(
    "docker",
    [
      "run",
      "--no-healthcheck",
      "--rm",
      "-d",
      "--name",
      dbName,
      "--label",
      "mindos.deployment-drill=true",
      "--tmpfs",
      "/var/lib/mysql:rw,noexec,nosuid,nodev,size=512m,mode=0750",
      "--memory=768m",
      "--memory-swap=768m",
      "--env",
      "MYSQL_ROOT_PASSWORD",
      "--env",
      "MYSQL_PASSWORD",
      "--env",
      "MYSQL_RUNTIME_PASSWORD",
      "--env",
      "MYSQL_DATABASE=mindos",
      "--env",
      "MYSQL_USER=mindos_migrator",
      "--mount",
      `type=bind,source=${path.resolve("deployment/mysql-init/10-runtime-user.sh")},target=/docker-entrypoint-initdb.d/10-runtime-user.sh,readonly`,
      "-p",
      "127.0.0.1::3306",
      "mysql:8.0.46-debian",
      "--innodb-buffer-pool-size=64M",
      "--max-connections=10",
      "--performance-schema=OFF",
    ],
    { env: { ...process.env, ...credentials } }
  );
  dbCreated = true;
  const info = JSON.parse(await command("docker", ["inspect", dbName]))[0],
    port = Number(info.NetworkSettings.Ports["3306/tcp"][0].HostPort);
  const url = (user, pw) =>
    `mysql://${user}:${encodeURIComponent(pw)}@127.0.0.1:${port}/mindos`;
  const migrationUrl = url("mindos_migrator", credentials.MYSQL_PASSWORD),
    runtimeUrl = url("mindos", credentials.MYSQL_RUNTIME_PASSWORD);
  let c;
  for (let i = 0; i < 180; i++) {
    try {
      c = await mysql.createConnection({
        uri: migrationUrl,
        connectTimeout: 1000,
      });
      await c.query({ sql: "SELECT 1", timeout: 3000 });
      break;
    } catch {
      await c?.end().catch(() => {});
      c = undefined;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  assert.ok(c, "Banco isolado não inicializou");
  await c.end();
  phase = "migrations";
  console.log(JSON.stringify({ event: "deployment.check", phase }));
  await command(
    "docker",
    [
      "run",
      "--no-healthcheck",
      "--rm",
      "--network",
      "host",
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges:true",
      "--env",
      "DATABASE_URL",
      image,
      "node",
      "scripts/migrate.mjs",
    ],
    { env: { ...process.env, DATABASE_URL: migrationUrl } }
  );
  // A segunda execução deve respeitar o histórico, sem recriar tabelas ou executar seed.
  await command(
    "docker",
    [
      "run",
      "--no-healthcheck",
      "--rm",
      "--network",
      "host",
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges:true",
      "--env",
      "DATABASE_URL",
      image,
      "node",
      "scripts/migrate.mjs",
    ],
    { env: { ...process.env, DATABASE_URL: migrationUrl } }
  );
  phase = "runtime-privileges";
  console.log(JSON.stringify({ event: "deployment.check", phase }));
  c = await mysql.createConnection(runtimeUrl);
  try {
    await assert.rejects(
      c.query("CREATE TABLE forbidden_runtime_ddl(id INT PRIMARY KEY)"),
      e =>
        ["ER_TABLEACCESS_DENIED_ERROR", "ER_DBACCESS_DENIED_ERROR"].includes(
          e.code
        )
    );
    const [[empty]] = await c.query("SELECT COUNT(*) AS n FROM mindos_tenants");
    assert.equal(Number(empty.n), 0);
    const [r] = await c.execute(
      "INSERT INTO mindos_tenants(slug,name,siteConfigJson) VALUES('deployment-smoke','Clínica fictícia de infraestrutura','{}')"
    );
    await c.execute(
      "UPDATE mindos_tenants SET name='Clínica fictícia atualizada' WHERE id=?",
      [r.insertId]
    );
    const [[row]] = await c.execute(
      "SELECT name FROM mindos_tenants WHERE id=?",
      [r.insertId]
    );
    assert.equal(row.name, "Clínica fictícia atualizada");
    await c.execute("DELETE FROM mindos_tenants WHERE id=?", [r.insertId]);
    const [clinic] = await c.execute(
      "INSERT INTO mindos_tenants(slug,name,siteConfigJson) VALUES('deployment-api','Clínica fictícia da imagem','{}')"
    );
    const [user] = await c.execute(
      "INSERT INTO users(openId,name,role,loginMethod) VALUES('deployment-smoke-owner','Administrador fictício da imagem','user','local-verification')"
    );
    await c.execute(
      "INSERT INTO mindos_memberships(tenantId,userId,role,permissionsJson) VALUES(?,?,'OWNER','[\"ALL\"]')",
      [clinic.insertId, user.insertId]
    );
  } finally {
    await c.end();
  }
  phase = "production-startup";
  console.log(JSON.stringify({ event: "deployment.check", phase }));
  const root = await privateDirectory(".mindos-private/deployment-drills");
  work = await mkdtemp(path.join(root, "image-"));
  const documents = path.join(work, "documents");
  await mkdir(documents, { mode: 0o700 });
  const appPort = await new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
  const environment = {
    NODE_ENV: "production",
    APP_ENV: "production",
    HOST: "127.0.0.1",
    PORT: String(appPort),
    DATABASE_URL: runtimeUrl,
    APP_ORIGIN: "https://clinica.mindos.test",
    TRUST_PROXY_CIDRS: "127.0.0.1/32",
    JWT_SECRET: password(),
    CLINICAL_INTEGRITY_SECRET: password(),
    DOCUMENT_ENCRYPTION_SECRET: password(),
    RECOVERY_RECEIPT_PUBLIC_KEY: receiptPublicKey(
      randomBytes(32).toString("base64")
    ),
    PRIVATE_DOCUMENT_ROOT: "/var/lib/mindos/documents",
    VITE_APP_ID: build.appId,
    VITE_OAUTH_PORTAL_URL: build.oauthPortal,
    OAUTH_SERVER_URL: "https://auth.mindos.test",
    ALLOW_DEMO_SEED: "false",
    ENABLE_MANUS_DEBUG: "false",
  };
  await command(
    "docker",
    [
      "run",
      "--no-healthcheck",
      "-d",
      "--name",
      appName,
      "--label",
      "mindos.deployment-drill=true",
      "--network",
      "host",
      "--read-only",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges:true",
      "--tmpfs",
      "/tmp:size=64m,mode=1777",
      "--mount",
      `type=bind,source=${documents},target=/var/lib/mindos/documents`,
      ...Object.keys(environment).flatMap(n => ["--env", n]),
      image,
    ],
    { env: { ...process.env, ...environment } }
  );
  appCreated = true;
  const appInfo = JSON.parse(await command("docker", ["inspect", appName]))[0];
  assert.ok(
    !appInfo.Config.Env.some(v => v.startsWith("BACKUP_ENCRYPTION_KEY="))
  );
  const base = `http://127.0.0.1:${appPort}`;
  let ready = false;
  const readyDeadline = Date.now() + 180000;
  while (Date.now() < readyDeadline) {
    try {
      if (
        (
          await fetch(base + "/health/ready", {
            signal: AbortSignal.timeout(5000),
          })
        ).status === 200
      ) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  assert.ok(ready, "Imagem não ficou pronta com o usuário restrito");
  assert.equal((await fetch(base + "/app/readiness")).status, 426);
  const html = await fetch(base + "/app/readiness", {
    headers: { "x-forwarded-proto": "https" },
  });
  assert.equal(html.status, 200);
  assert.ok((await html.text()).includes('id="root"'));
  assert.ok(html.headers.has("strict-transport-security"));
  assert.equal(
    (
      await fetch(base + "/api/trpc/operations.status", {
        headers: { "x-forwarded-proto": "https" },
      })
    ).status,
    401
  );
  phase = "authorized-api";
  console.log(JSON.stringify({ event: "deployment.check", phase }));
  const session = await new SignJWT({
    openId: "deployment-smoke-owner",
    appId: build.appId,
    name: "Administrador fictício da imagem",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(environment.JWT_SECRET));
  const authorized = await fetch(base + "/api/trpc/operations.status", {
    headers: {
      "x-forwarded-proto": "https",
      Authorization: "Bearer " + session,
    },
  });
  assert.equal(authorized.status, 200);
  const response = await authorized.json();
  const operational = response.result?.data?.json;
  assert.equal(operational.clinic.name, "Clínica fictícia da imagem");
  assert.ok(Object.values(operational.checks).every(Boolean));
  assert.equal(operational.productionApproved, false);
  assert.equal(operational.recovery, null);
  phase = "shutdown";
  console.log(JSON.stringify({ event: "deployment.check", phase }));
  await command("docker", ["stop", "--time", "75", appName]);
  assert.equal(
    (
      await command("docker", [
        "inspect",
        "--format",
        "{{.State.ExitCode}}",
        appName,
      ])
    ).trim(),
    "0"
  );
  passed = true;
} catch (error) {
  if (appCreated) {
    try {
      const status = JSON.parse(
        await command("docker", ["inspect", appName])
      )[0].State;
      const output = await command("docker", ["logs", appName], {
        captureStderr: true,
      });
      const markers = [
        "Server running",
        "Configuração ou inicialização inválida",
        "Banco, migrações ou armazenamento privado",
        "Metadados do build ausentes",
        "Configuração pública Manus difere",
        "RECOVERY_RECEIPT_PUBLIC_KEY",
        "DATABASE_URL",
        "JWT_SECRET",
      ].filter(m => output.includes(m));
      console.error(
        JSON.stringify({
          event: "deployment.app_state",
          running: status.Running,
          exitCode: status.ExitCode,
          markers,
        })
      );
    } catch {}
  }
  console.error(
    JSON.stringify({
      event: "deployment.drill_failed",
      phase,
      expectedStatus:
        typeof error?.expected === "number" ? error.expected : undefined,
      actualStatus:
        typeof error?.actual === "number" ? error.actual : undefined,
      reason:
        error?.code === "ERR_ASSERTION" &&
        String(error.message).startsWith("Imagem não ficou pronta")
          ? "APP_NOT_READY"
          : undefined,
      category:
        typeof error?.code === "string" && /^[A-Z_]{1,50}$/.test(error.code)
          ? error.code
          : "OPERATION_FAILED",
      details: "Detalhes sensíveis omitidos; nenhum VPS foi modificado",
    })
  );
  process.exitCode = 1;
} finally {
  for (const [created, name] of [
    [appCreated, appName],
    [dbCreated, dbName],
  ])
    if (created) {
      try {
        assert.equal(
          (
            await command("docker", [
              "inspect",
              "--format",
              '{{index .Config.Labels "mindos.deployment-drill"}}',
              name,
            ])
          ).trim(),
          "true"
        );
        await command("docker", ["rm", "-f", name]);
      } catch {
        passed = false;
        process.exitCode = 1;
        console.error("Limpeza do ensaio de imagem não confirmada");
      }
    }
  if (work) await rm(work, { recursive: true, force: true });
  if (passed)
    console.log(
      JSON.stringify({
        result: "PASS",
        scope: "LOCAL_DOCKER_IMAGE",
        nonRoot: true,
        codeWriteDenied: true,
        authorizedApiWithDmlUser: true,
        backupKeyAbsent: true,
        runtimeDmlOnly: true,
        migrationsIdempotent: true,
        noSeed: true,
        healthReady: true,
        httpsGuard: true,
        anonymousDenied: true,
        gracefulShutdown: true,
        targetsRemoved: true,
        realOAuthVerified: false,
        realTlsVerified: false,
      })
    );
}
