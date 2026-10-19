import { readFile, access, lstat, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import mysql from "mysql2/promise";
import type { Express } from "express";
export async function operationalChecks() {
  let database = false,
    migrations = false,
    privateStorage = false;
  let c: mysql.Connection | undefined;
  try {
    c = await mysql.createConnection({
      uri: process.env.DATABASE_URL,
      connectTimeout: 3000,
    });
    await c.query({ sql: "SELECT 1", timeout: 3000 });
    database = true;
    const journal = JSON.parse(
      await readFile(path.resolve("drizzle/meta/_journal.json"), "utf8")
    );
    const [rows] = await c.query<mysql.RowDataPacket[]>({
      sql: "SELECT hash FROM __drizzle_migrations ORDER BY created_at,id",
      timeout: 3000,
    });
    const expected = await Promise.all(
      journal.entries.map(async (e: { tag: string }) =>
        createHash("sha256")
          .update(await readFile(path.resolve("drizzle", e.tag + ".sql")))
          .digest("hex")
      )
    );
    migrations =
      expected.length > 0 &&
      rows.length === expected.length &&
      rows.every((r, i) => r.hash === expected[i]);
  } catch {
  } finally {
    if (c) await c.end().catch(() => {});
  }
  try {
    const root = path.resolve(
      process.env.PRIVATE_DOCUMENT_ROOT || ".mindos-private/documents"
    );
    const stat = await lstat(root);
    const real = await realpath(root);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (stat.mode & 0o077) !== 0
    )
      throw new Error();
    for (const pub of ["client", "dist/public"]) {
      const p = path.resolve(pub);
      if (real === p || real.startsWith(p + path.sep)) throw new Error();
    }
    await access(root, constants.R_OK | constants.W_OK);
    privateStorage = true;
  } catch {}
  return { database, migrations, privateStorage };
}
export function registerHealth(app: Express) {
  app.get("/health/live", (_req, res) =>
    res.set("Cache-Control", "no-store").json({ status: "alive" })
  );
  app.get("/health/ready", async (_req, res) => {
    const c = await operationalChecks();
    const ready = Object.values(c).every(Boolean);
    res
      .set("Cache-Control", "no-store")
      .status(ready ? 200 : 503)
      .json({ status: ready ? "ready" : "not_ready" });
  });
}
