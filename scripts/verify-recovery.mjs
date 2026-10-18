import "dotenv/config";
import {
  randomBytes,
  randomUUID,
  createDecipheriv,
  createHash,
  createHmac,
} from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, rename } from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";
import {
  OperationalError,
  createBackup,
  command,
  unpackAuthenticated,
  databaseManifest,
  privateDirectory,
  receiptSignature,
} from "./lib/backup.mjs";
const key = process.env.BACKUP_ENCRYPTION_KEY,
  started = Date.now();
const suffix = randomUUID().replaceAll("-", ""),
  container = "mindos-restore-" + suffix,
  database = "mindos_restore_" + suffix;
let created = false,
  work,
  receipt;
try {
  if (
    process.env.APP_ENV === "production" ||
    process.env.NODE_ENV === "production"
  )
    throw new OperationalError(
      "Ensaio automático exige ambiente local; não é comando de restauração de produção"
    );
  const u = new URL(process.env.DATABASE_URL || "");
  if (
    !["127.0.0.1", "localhost"].includes(u.hostname) ||
    !["/mindos_dev", "/mindos_test"].includes(u.pathname)
  )
    throw new OperationalError(
      "Ensaio aceita somente banco local de desenvolvimento"
    );
  const backup = await createBackup({
    databaseUrl: process.env.DATABASE_URL,
    container:
      process.env.BACKUP_SOURCE_CONTAINER || "mindos-development-mysql-1",
    documentsRoot:
      process.env.PRIVATE_DOCUMENT_ROOT || ".mindos-private/documents",
    backupRoot: process.env.BACKUP_ROOT || ".mindos-private/backups",
    key,
    clinicalSecret: process.env.CLINICAL_INTEGRITY_SECRET,
    documentSecret: process.env.DOCUMENT_ENCRYPTION_SECRET,
  });
  const root = await privateDirectory(".mindos-private/recovery-drills");
  work = await mkdtemp(path.join(root, "drill-"));
  const target = path.join(work, "restored");
  const manifest = await unpackAuthenticated(backup.path, target, key);
  const secrets = JSON.parse(
    await readFile(path.join(target, "keys.json"), "utf8")
  );
  const password = randomBytes(32).toString("base64url"),
    rootPassword = randomBytes(32).toString("base64url");
  await command(
    "docker",
    [
      "run",
      "--pull=never",
      "--rm",
      "-d",
      "--name",
      container,
      "--tmpfs",
      "/var/lib/mysql:rw,noexec,nosuid,nodev,size=512m,mode=0750",
      "--memory=768m",
      "--memory-swap=768m",
      "--label",
      "mindos.restore-drill=true",
      "--env",
      "MYSQL_ROOT_PASSWORD",
      "--env",
      "MYSQL_PASSWORD",
      "--env",
      "MYSQL_USER=mindos_restore",
      "--env",
      "MYSQL_DATABASE=" + database,
      "-p",
      "127.0.0.1::3306",
      "mysql:8.0.46-debian",
      "--innodb-buffer-pool-size=64M",
      "--max-connections=10",
      "--performance-schema=OFF",
    ],
    {
      env: {
        ...process.env,
        MYSQL_ROOT_PASSWORD: rootPassword,
        MYSQL_PASSWORD: password,
      },
    }
  );
  created = true;
  const info = JSON.parse(await command("docker", ["inspect", container]))[0];
  if (info.Config.Labels["mindos.restore-drill"] !== "true")
    throw new OperationalError("Destino não é contêiner isolado de ensaio");
  const port = Number(info.NetworkSettings.Ports["3306/tcp"][0].HostPort),
    url = `mysql://mindos_restore:${encodeURIComponent(password)}@127.0.0.1:${port}/${database}`;
  let c, lastConnectionCode;
  for (let attempt = 0; attempt < 360; attempt++) {
    try {
      c = await mysql.createConnection({ uri: url, connectTimeout: 1000 });
      await c.query("SELECT 1");
      break;
    } catch (error) {
      lastConnectionCode = /^[A-Z_]+$/.test(error.code || "")
        ? error.code
        : "CONNECTION_FAILED";
      await c?.end().catch(() => {});
      c = undefined;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  if (!c) {
    const logs = await command("docker", ["logs", container]);
    const markers = [
      "Initializing database files",
      "Database files initialized",
      "ready for connections",
      "MySQL init process done",
    ].filter(m => logs.includes(m));
    console.error(
      JSON.stringify({
        event: "restore.target_not_ready",
        connectionCode: lastConnectionCode,
        markers,
      })
    );
    throw new OperationalError("MySQL isolado não ficou pronto");
  }
  try {
    const [tables] = await c.query("SHOW TABLES");
    if (tables.length)
      throw new OperationalError("Restauração exige banco vazio");
  } finally {
    await c.end();
  }
  const clientProbe = path.join(work, "client-command-probe.sql");
  await writeFile(clientProbe, "\\! true\n", { mode: 0o600, flag: "wx" });
  let clientCommandBlocked = false;
  try {
    await command(
      "docker",
      [
        "exec",
        "-i",
        "--env",
        "MYSQL_PWD",
        container,
        "mysql",
        "--host=127.0.0.1",
        "--user=mindos_restore",
        "--binary-mode=1",
        "--local-infile=0",
        "--database=" + database,
      ],
      { env: { ...process.env, MYSQL_PWD: password }, input: clientProbe }
    );
  } catch {
    clientCommandBlocked = true;
  }
  if (!clientCommandBlocked)
    throw new OperationalError(
      "Cliente SQL aceitou comando de sistema no ensaio"
    );
  await command(
    "docker",
    [
      "exec",
      "-i",
      "--env",
      "MYSQL_PWD",
      container,
      "mysql",
      "--host=127.0.0.1",
      "--user=mindos_restore",
      "--binary-mode=1",
      "--local-infile=0",
      "--database=" + database,
    ],
    {
      env: { ...process.env, MYSQL_PWD: password },
      input: path.join(target, "database.sql"),
    }
  );
  const actual = await databaseManifest(url);
  if (JSON.stringify(actual) !== JSON.stringify(manifest.tables))
    throw new OperationalError(
      "Dados restaurados diferem do manifesto original"
    );
  c = await mysql.createConnection({ uri: url, timezone: "Z" });
  await c.query("SET SESSION time_zone='+00:00'");
  let documentsVerified = 0,
    clinicalVersionsVerified = 0;
  try {
    const [docs] = await c.query(
      "SELECT tenantId,patientId,fileKey,fileSize,fileHash FROM mindos_portal_documents WHERE fileKey IS NOT NULL"
    );
    for (const d of docs) {
      const b = await readFile(path.join(target, "documents", d.fileKey));
      if (b[0] !== 1 || b.length < 29)
        throw new OperationalError("Documento restaurado inválido");
      const decipher = createDecipheriv(
        "aes-256-gcm",
        createHash("sha256")
          .update("mindos-documents:" + secrets.documentSecret)
          .digest(),
        b.subarray(1, 13)
      );
      decipher.setAAD(Buffer.from(`${d.tenantId}:${d.patientId}:${d.fileKey}`));
      decipher.setAuthTag(b.subarray(13, 29));
      const data = Buffer.concat([
        decipher.update(b.subarray(29)),
        decipher.final(),
      ]);
      if (
        data.length !== d.fileSize ||
        createHash("sha256").update(data).digest("hex") !== d.fileHash
      )
        throw new OperationalError(
          "Documento restaurado não pôde ser autenticado"
        );
      documentsVerified++;
    }
    const [versions] = await c.query(
      "SELECT * FROM mindos_clinical_versions ORDER BY tenantId,recordId,revision"
    );
    const chains = new Map();
    for (const v of versions) {
      const id = v.tenantId + ":" + v.recordId,
        previous = chains.get(id) || { revision: 0, hash: null };
      const h = createHmac("sha256", secrets.clinicalSecret)
        .update(
          "clinical-version:" +
            JSON.stringify([
              v.tenantId,
              v.recordId,
              v.revision,
              v.snapshotJson,
              v.previousHash,
              v.actorUserId,
              v.action,
            ])
        )
        .digest("hex");
      if (
        v.revision !== previous.revision + 1 ||
        v.previousHash !== previous.hash ||
        v.integrityHash !== h
      )
        throw new OperationalError(
          "Histórico clínico restaurado não autenticado"
        );
      chains.set(id, { revision: v.revision, hash: h });
      clinicalVersionsVerified++;
    }
    const [records] = await c.query("SELECT * FROM mindos_clinical_records");
    const recordsById = new Map(records.map(r => [r.tenantId + ":" + r.id, r]));
    for (const [id, head] of chains) {
      const record = recordsById.get(id);
      if (
        !record ||
        record.integrityVersion !== 1 ||
        record.revision !== head.revision ||
        record.integrityHash !== head.hash
      )
        throw new OperationalError(
          "Cabeçalho clínico restaurado diverge do histórico autenticado"
        );
    }
    for (const r of records.filter(r => r.integrityVersion === 1)) {
      const last = versions
        .filter(v => v.tenantId === r.tenantId && v.recordId === r.id)
        .at(-1);
      const snapshot = {
        id: r.id,
        tenantId: r.tenantId,
        patientId: r.patientId,
        appointmentId: r.appointmentId,
        authorUserId: r.authorUserId,
        recordType: r.recordType,
        status: r.status,
        content: r.content,
        version: r.version,
        revision: r.revision,
        parentRecordId: r.parentRecordId,
        integrityVersion: r.integrityVersion,
        finalizedAt: r.finalizedAt?.toISOString() || null,
        createdAt: r.createdAt.toISOString(),
      };
      if (!last || last.snapshotJson !== JSON.stringify(snapshot))
        throw new OperationalError(
          "Conteúdo clínico restaurado diverge da última versão autenticada"
        );
    }
  } finally {
    await c.end();
  }
  receipt = {
    format: 1,
    result: "PASS",
    scope: "LOCAL_RESTORE_DRILL",
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    backupSha256: backup.sha256,
    tablesVerified: Object.keys(actual).length,
    rowsVerified: Object.values(actual).reduce((n, t) => n + t.rows, 0),
    filesVerified: manifest.files.length,
    documentsVerified,
    clinicalVersionsVerified,
    targetRemoved: false,
  };
} catch (e) {
  console.error(
    "Ensaio de recuperação não concluído:",
    e instanceof OperationalError
      ? e.message
      : "Falha operacional; detalhes sensíveis omitidos"
  );
  process.exitCode = 1;
} finally {
  if (created) {
    try {
      const label = (
        await command("docker", [
          "inspect",
          "--format",
          '{{index .Config.Labels "mindos.restore-drill"}}',
          container,
        ])
      ).trim();
      if (label !== "true")
        throw new OperationalError("Rótulo de isolamento inválido");
      await command("docker", ["rm", "-f", container]);
      if (receipt) receipt.targetRemoved = true;
    } catch {
      console.error("Limpeza do contêiner isolado não confirmada");
      process.exitCode = 1;
      receipt = undefined;
    }
  }
  if (work) await rm(work, { recursive: true, force: true });
  if (receipt && receipt.targetRemoved) {
    const root = await privateDirectory(".mindos-private/operations");
    const payload = receipt;
    const pending = path.join(root, ".receipt-" + randomUUID());
    await writeFile(
      pending,
      JSON.stringify({
        algorithm: "Ed25519-v1",
        payload,
        signature: receiptSignature(payload, key),
      }),
      { mode: 0o600, flag: "wx" }
    );
    await rename(pending, path.join(root, "recovery-latest.json"));
    console.log(JSON.stringify(receipt));
  }
}
