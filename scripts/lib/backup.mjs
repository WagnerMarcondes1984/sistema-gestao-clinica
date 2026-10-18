import {
  randomBytes,
  randomUUID,
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  lstat,
  realpath,
  readdir,
  rm,
  rename,
  appendFile,
  open,
} from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import mysql from "mysql2/promise";
export class OperationalError extends Error {}
const MAGIC = Buffer.from("MINDOS-BACKUP-v1\n"),
  BIN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.bin$/;
export const identifier = s => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(s))
    throw new OperationalError("Identificador de banco inválido");
  return s;
};
export function backupKey(s) {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(s || ""))
    throw new OperationalError(
      "Configure BACKUP_ENCRYPTION_KEY com 32 bytes em base64"
    );
  const k = Buffer.from(s, "base64");
  if (k.length !== 32) throw new OperationalError("Chave de backup inválida");
  return k;
}
export const shaFile = async p => {
  const h = createHash("sha256");
  for await (const b of createReadStream(p)) h.update(b);
  return h.digest("hex");
};
export async function command(
  cmd,
  args,
  { env = process.env, input, output } = {}
) {
  const child = spawn(cmd, args, { env, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "",
    stderr = "";
  child.stderr.on("data", b => {
    if (stderr.length < 2000) stderr += b.toString();
  });
  const exit = new Promise((resolve, reject) => {
    child.once("error", () =>
      reject(new OperationalError("Ferramenta operacional indisponível"))
    );
    child.once("close", code =>
      code === 0
        ? resolve()
        : reject(
            new OperationalError(
              "Comando operacional falhou; dados sensíveis do processo não foram registrados"
            )
          )
    );
  });
  const pipes = [];
  if (input) pipes.push(pipeline(createReadStream(input), child.stdin));
  else child.stdin.end();
  if (output)
    pipes.push(
      pipeline(
        child.stdout,
        createWriteStream(output, { flags: "wx", mode: 0o600 })
      )
    );
  else
    child.stdout.on("data", b => {
      if (stdout.length > 16 * 1024 * 1024) child.kill();
      else stdout += b.toString();
    });
  try {
    await Promise.all([exit, ...pipes]);
    return stdout;
  } catch (e) {
    child.kill("SIGTERM");
    throw e;
  }
}
export async function privateDirectory(p) {
  const resolved = path.resolve(p);
  await mkdir(resolved, { recursive: true, mode: 0o700 });
  const s = await lstat(resolved),
    real = await realpath(resolved);
  if (!s.isDirectory() || s.isSymbolicLink() || (s.mode & 0o077) !== 0)
    throw new OperationalError("Diretório privado inválido");
  const project = path.resolve(),
    allowed = path.resolve(".mindos-private");
  if (
    (real === project || real.startsWith(project + path.sep)) &&
    real !== allowed &&
    !real.startsWith(allowed + path.sep)
  )
    throw new OperationalError(
      "Dentro do projeto, use somente .mindos-private para dados operacionais"
    );
  for (const pub of ["client", "dist/public", ".git"]) {
    const q = path.resolve(pub);
    if (real === q || real.startsWith(q + path.sep))
      throw new OperationalError(
        "Backup/documentos não podem ficar em área pública ou Git"
      );
  }
  return real;
}
export async function encryptArchive(input, output, key) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", backupKey(key), iv);
  cipher.setAAD(MAGIC);
  await writeFile(output, Buffer.concat([MAGIC, iv]), {
    flag: "wx",
    mode: 0o600,
  });
  try {
    await pipeline(
      createReadStream(input),
      cipher,
      createWriteStream(output, { flags: "a", mode: 0o600 })
    );
    await appendFile(output, cipher.getAuthTag());
  } catch (e) {
    await rm(output, { force: true });
    throw e;
  }
}
export async function decryptArchive(input, output, key) {
  const stat = await lstat(input);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < MAGIC.length + 28)
    throw new OperationalError("Backup inválido");
  const f = await open(input, "r");
  let head, tag;
  try {
    head = Buffer.alloc(MAGIC.length + 12);
    tag = Buffer.alloc(16);
    await f.read(head, 0, head.length, 0);
    await f.read(tag, 0, 16, stat.size - 16);
  } finally {
    await f.close();
  }
  if (!head.subarray(0, MAGIC.length).equals(MAGIC))
    throw new OperationalError("Formato de backup não suportado");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    backupKey(key),
    head.subarray(MAGIC.length)
  );
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  await writeFile(output, Buffer.alloc(0), { flag: "wx", mode: 0o600 });
  try {
    await pipeline(
      createReadStream(input, { start: head.length, end: stat.size - 17 }),
      decipher,
      createWriteStream(output, { flags: "a", mode: 0o600 })
    );
  } catch {
    await rm(output, { force: true });
    throw new OperationalError(
      "Backup não autenticado: chave incorreta ou arquivo adulterado"
    );
  }
}
export function validateArchiveNames(names, verbose) {
  const list = names.trim().split("\n");
  if (list.length > 100010)
    throw new OperationalError("Backup excede o limite operacional");
  const seen = new Set();
  for (const n of list) {
    if (
      seen.has(n) ||
      !(
        ["database.sql", "manifest.json", "keys.json", "documents/"].includes(
          n
        ) || new RegExp("^documents/" + BIN.source.slice(1, -1) + "$").test(n)
      )
    )
      throw new OperationalError("Entrada de arquivo inválida no backup");
    seen.add(n);
  }
  if (
    !["database.sql", "manifest.json", "keys.json", "documents/"].every(n =>
      seen.has(n)
    )
  )
    throw new OperationalError("Backup incompleto");
  const modes = verbose.trim().split("\n");
  if (
    modes.length !== list.length ||
    modes.some(l => !["-", "d"].includes(l[0]))
  )
    throw new OperationalError(
      "Links e tipos especiais não são aceitos no backup"
    );
  return list;
}
export async function unpackAuthenticated(input, target, key) {
  await mkdir(target, { mode: 0o700 });
  const tar = path.join(target, "payload.tar");
  try {
    await decryptArchive(input, tar, key);
    const list = await command("tar", ["-tf", tar]),
      verbose = await command("tar", ["-tvf", tar, "--numeric-owner"]);
    validateArchiveNames(list, verbose);
    await command("tar", [
      "-xf",
      tar,
      "-C",
      target,
      "--no-same-owner",
      "--no-same-permissions",
      "--keep-old-files",
    ]);
    await rm(tar);
    const m = JSON.parse(
      await readFile(path.join(target, "manifest.json"), "utf8")
    );
    if (
      m.format !== 1 ||
      !m.tables ||
      !m.files ||
      !Array.isArray(m.files) ||
      m.files.length > 100000 ||
      typeof m.sqlSha256 !== "string"
    )
      throw new OperationalError("Manifesto inválido");
    if ((await shaFile(path.join(target, "database.sql"))) !== m.sqlSha256)
      throw new OperationalError("SQL não corresponde ao manifesto");
    for (const f of m.files) {
      if (!BIN.test(f.name) || !/^[a-f0-9]{64}$/.test(f.sha256))
        throw new OperationalError("Documento inválido no manifesto");
      const p = path.join(target, "documents", f.name),
        s = await lstat(p);
      if (
        !s.isFile() ||
        s.isSymbolicLink() ||
        s.size !== f.size ||
        (await shaFile(p)) !== f.sha256
      )
        throw new OperationalError("Documento não corresponde ao manifesto");
    }
    const actual = (await readdir(path.join(target, "documents"))).sort();
    if (
      JSON.stringify(actual) !== JSON.stringify(m.files.map(f => f.name).sort())
    )
      throw new OperationalError("Lista de documentos inconsistente");
    return m;
  } catch (e) {
    await rm(target, { recursive: true, force: true });
    throw e;
  }
}
export async function databaseManifest(url) {
  const c = await mysql.createConnection({
    uri: url,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    charset: "utf8mb4",
  });
  try {
    await c.query("SET SESSION time_zone='+00:00'");
    const [special] = await c.query(
      "SELECT TABLE_NAME,ENGINE,TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()"
    );
    if (
      !special.length ||
      special.some(r => r.TABLE_TYPE !== "BASE TABLE" || r.ENGINE !== "InnoDB")
    )
      throw new OperationalError(
        "Backup exige tabelas InnoDB e banco não vazio"
      );
    const [[objects]] = await c.query(
      "SELECT (SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE())+(SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA=DATABASE())+(SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA=DATABASE()) AS n"
    );
    if (Number(objects.n))
      throw new OperationalError(
        "Objetos SQL adicionais exigem procedimento de backup revisado"
      );
    const result = {};
    for (const t of special.sort((a, b) =>
      a.TABLE_NAME.localeCompare(b.TABLE_NAME)
    )) {
      const table = identifier(t.TABLE_NAME),
        [pk] = await c.query(
          "SHOW KEYS FROM `" + table + "` WHERE Key_name='PRIMARY'"
        );
      if (!pk.length)
        throw new OperationalError(
          "Tabela sem chave primária exige procedimento específico"
        );
      const order = pk
        .sort((a, b) => a.Seq_in_index - b.Seq_in_index)
        .map(p => "`" + identifier(p.Column_name) + "`")
        .join(",");
      const h = createHash("sha256");
      let rows = 0;
      const stream = c.connection
        .query({
          sql: "SELECT * FROM `" + table + "` ORDER BY " + order,
          rowsAsArray: true,
        })
        .stream({ highWaterMark: 16 });
      for await (const r of stream) {
        h.update(JSON.stringify(r) + "\n");
        rows++;
      }
      result[table] = { rows, sha256: h.digest("hex") };
    }
    return result;
  } finally {
    await c.end();
  }
}
export async function documentManifest(root) {
  const files = [];
  for (const e of await readdir(root, { withFileTypes: true })) {
    if (!e.isFile() || e.isSymbolicLink() || !BIN.test(e.name))
      throw new OperationalError("Armazenamento contém entrada não suportada");
    const p = path.join(root, e.name),
      s = await lstat(p);
    files.push({ name: e.name, size: s.size, sha256: await shaFile(p) });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}
export async function assertOffline({
  appContainer,
  project = process.cwd(),
  production = false,
}) {
  if (appContainer) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(appContainer))
      throw new OperationalError("Contêiner de aplicação inválido");
    const running = (
      await command("docker", [
        "inspect",
        "--format",
        "{{.State.Running}}",
        appContainer,
      ])
    ).trim();
    if (running !== "false")
      throw new OperationalError(
        "Pare todas as instâncias da aplicação antes do backup"
      );
  } else if (production)
    throw new OperationalError(
      "Produção exige BACKUP_APP_CONTAINER e aplicação parada"
    );
  if (process.platform !== "linux")
    throw new OperationalError("A conferência offline exige host Linux");
  for (const p of await readdir("/proc")) {
    if (!/^\d+$/.test(p) || Number(p) === process.pid) continue;
    try {
      const cwd = await realpath("/proc/" + p + "/cwd");
      if (cwd !== path.resolve(project)) continue;
      const args = (await readFile("/proc/" + p + "/cmdline"))
        .toString()
        .split("\0");
      if (
        args.some(a =>
          /^(?:.*\/)?(?:dist\/index\.js|server\/_core\/index\.ts|scripts\/open-review\.mjs)$/.test(
            a
          )
        )
      )
        throw new OperationalError("APPLICATION_RUNNING");
    } catch (e) {
      if (e.message === "APPLICATION_RUNNING")
        throw new OperationalError(
          "Encerre o servidor e a revisão local antes do backup"
        );
    }
  }
}
export async function createBackup({
  databaseUrl,
  container,
  documentsRoot,
  backupRoot,
  key,
  clinicalSecret,
  documentSecret,
  appContainer,
  production = false,
}) {
  backupKey(key);
  if (
    !clinicalSecret ||
    clinicalSecret.length < 32 ||
    !documentSecret ||
    documentSecret.length < 32 ||
    clinicalSecret === documentSecret ||
    key === clinicalSecret ||
    key === documentSecret
  )
    throw new OperationalError(
      "Configure segredos independentes para backup e recuperação"
    );
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,100}$/.test(container || ""))
    throw new OperationalError("Configure BACKUP_SOURCE_CONTAINER");
  const u = new URL(databaseUrl),
    database = identifier(decodeURIComponent(u.pathname.slice(1)));
  if (u.protocol !== "mysql:")
    throw new OperationalError("Banco não suportado");
  await assertOffline({ appContainer, production });
  const sourceConnection = await mysql.createConnection(databaseUrl);
  let sourceUuid;
  try {
    const [[row]] = await sourceConnection.query(
      "SELECT @@server_uuid AS uuid"
    );
    sourceUuid = row.uuid;
  } finally {
    await sourceConnection.end();
  }
  const containerUuid = (
    await command(
      "docker",
      [
        "exec",
        "--env",
        "MYSQL_PWD",
        container,
        "mysql",
        "--host=127.0.0.1",
        "--user=" + decodeURIComponent(u.username),
        "--batch",
        "--skip-column-names",
        "--execute=SELECT @@server_uuid",
      ],
      { env: { ...process.env, MYSQL_PWD: decodeURIComponent(u.password) } }
    )
  ).trim();
  if (!sourceUuid || containerUuid !== sourceUuid)
    throw new OperationalError(
      "Contêiner de origem não corresponde ao banco configurado"
    );
  const root = await privateDirectory(backupRoot),
    docs = await privateDirectory(documentsRoot);
  if (
    root === docs ||
    root.startsWith(docs + path.sep) ||
    docs.startsWith(root + path.sep)
  )
    throw new OperationalError("Separe documentos e backups");
  const work = await mkdtemp(path.join(root, ".work-"));
  const filename =
      "backup-" +
      new Date().toISOString().replace(/[:.]/g, "-") +
      "-" +
      randomUUID() +
      ".mindos.enc",
    final = path.join(root, filename),
    temp = final + ".partial";
  try {
    const tables = await databaseManifest(databaseUrl),
      files = await documentManifest(docs);
    await mkdir(path.join(work, "documents"), { mode: 0o700 });
    for (const f of files) {
      await pipeline(
        createReadStream(path.join(docs, f.name)),
        createWriteStream(path.join(work, "documents", f.name), {
          flags: "wx",
          mode: 0o600,
        })
      );
    }
    const c = await mysql.createConnection(databaseUrl);
    try {
      const [rows] = await c.query(
        "SELECT fileKey FROM mindos_portal_documents WHERE fileKey IS NOT NULL"
      );
      if (rows.some(r => !files.some(f => f.name === r.fileKey)))
        throw new OperationalError(
          "Banco referencia documento ausente; backup recusado"
        );
    } finally {
      await c.end();
    }
    await command(
      "docker",
      [
        "exec",
        "-i",
        "--env",
        "MYSQL_PWD",
        container,
        "mysqldump",
        "--host=127.0.0.1",
        "--port=3306",
        "--user=" + decodeURIComponent(u.username),
        "--single-transaction",
        "--skip-lock-tables",
        "--no-tablespaces",
        "--hex-blob",
        "--set-gtid-purged=OFF",
        "--column-statistics=0",
        "--skip-add-drop-table",
        "--skip-add-locks",
        "--skip-triggers",
        database,
      ],
      {
        env: { ...process.env, MYSQL_PWD: decodeURIComponent(u.password) },
        output: path.join(work, "database.sql"),
      }
    );
    if (
      JSON.stringify(await databaseManifest(databaseUrl)) !==
        JSON.stringify(tables) ||
      JSON.stringify(await documentManifest(docs)) !== JSON.stringify(files)
    )
      throw new OperationalError(
        "Dados mudaram durante a cópia; backup recusado"
      );
    const manifest = {
      format: 1,
      createdAt: new Date().toISOString(),
      sourceScope: production ? "PRODUCTION" : "LOCAL",
      tables,
      files,
      sqlSha256: await shaFile(path.join(work, "database.sql")),
    };
    await writeFile(
      path.join(work, "manifest.json"),
      JSON.stringify(manifest),
      { mode: 0o600 }
    );
    await writeFile(
      path.join(work, "keys.json"),
      JSON.stringify({ clinicalSecret, documentSecret }),
      { mode: 0o600 }
    );
    await command("tar", [
      "--format=ustar",
      "-cf",
      path.join(work, "payload.tar"),
      "-C",
      work,
      "database.sql",
      "manifest.json",
      "keys.json",
      "documents",
    ]);
    await encryptArchive(path.join(work, "payload.tar"), temp, key);
    await rename(temp, final);
    return {
      path: final,
      sha256: await shaFile(final),
      createdAt: manifest.createdAt,
      manifest,
    };
  } finally {
    await rm(work, { recursive: true, force: true });
    await rm(temp, { force: true });
  }
}
function receiptPrivateKey(key) {
  const seed = createHash("sha256")
    .update("mindos-recovery-receipt-key-v1:")
    .update(backupKey(key))
    .digest();
  return createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      seed,
    ]),
    format: "der",
    type: "pkcs8",
  });
}
export function receiptPublicKey(key) {
  return createPublicKey(receiptPrivateKey(key))
    .export({ format: "der", type: "spki" })
    .toString("base64");
}
export function receiptSignature(payload, key) {
  return sign(
    null,
    Buffer.from("mindos-recovery-receipt-v1:" + JSON.stringify(payload)),
    receiptPrivateKey(key)
  ).toString("hex");
}
