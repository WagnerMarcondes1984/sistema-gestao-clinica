import "dotenv/config";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { appRouter } from "../server/routers";
import type { TrpcContext } from "../server/_core/context";
import { getTableConfig } from "drizzle-orm/mysql-core";
import * as schema from "../drizzle/schema";
// @ts-expect-error O guard é compartilhado com o seed JavaScript.
import { assertDemoSeedAllowed } from "../server/seed-safety.mjs";

assertDemoSeedAllowed({ ...process.env, ALLOW_DEMO_SEED: "true" });
const connection = await mysql.createConnection(process.env.DATABASE_URL!);
try {
  const [[owner]] = await connection.query<RowDataPacket[]>(
    "SELECT * FROM users WHERE openId = 'mindos-demo-owner'"
  );
  assert.ok(
    owner,
    "Execute o seed demonstrativo em banco vazio antes desta verificação."
  );
  const context: TrpcContext = {
    user: owner as TrpcContext["user"],
    req: { protocol: "http", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
  const caller = appRouter.createCaller(context);
  const dashboard = await caller.mindos.dashboard();
  assert.equal(dashboard.patients.length, 4);
  assert.equal(dashboard.appointments.length, 4);
  assert.ok(
    dashboard.patients.every(
      patient => patient.tenantId === dashboard.tenant.id
    )
  );
  const appointments = await caller.mindos.appointments();
  assert.ok(appointments.every(appointment => appointment.patient !== null));
  assert.equal((await caller.publicMindos.serviceAreas()).length, 3);
  console.log(
    "API → banco → resposta: dashboard, pacientes, agenda e áreas públicas conferidos."
  );

  async function counts() {
    const result: Record<string, number> = {};
    for (const table of Object.values(schema)) {
      const name = getTableConfig(table).name;
      const [[row]] = await connection.query<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM `" + name + "`"
      );
      result[name] = Number(row.total);
    }
    return result;
  }
  const before = await counts();
  const repeated = spawnSync(process.execPath, ["server/seed-db.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30_000,
    env: { ...process.env, ALLOW_DEMO_SEED: "true" },
  });
  assert.equal(repeated.status, 1, "O seed repetido deve ser recusado.");
  assert.match(repeated.stderr, /banco contém dados/);
  assert.deepEqual(
    await counts(),
    before,
    "O seed repetido não pode alterar as contagens."
  );
  console.log(
    "Seed repetido recusado: contagens de todas as tabelas preservadas."
  );
} finally {
  await connection.end();
}
// getDb usa pool interno no backend; encerrar após a verificação standalone.
process.exit(0);
