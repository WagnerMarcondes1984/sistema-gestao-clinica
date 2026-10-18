import { createPublicKey, verify } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { operationalChecks } from "./health";
import { liveDeployment } from "./runtime-config";
import { withClinic } from "./scheduling";
import type { User } from "../drizzle/schema";

const receiptPayload = z
  .object({
    format: z.literal(1),
    result: z.literal("PASS"),
    scope: z.literal("LOCAL_RESTORE_DRILL"),
    finishedAt: z.iso.datetime(),
    durationMs: z.number().int().nonnegative(),
    backupSha256: z.string().regex(/^[a-f0-9]{64}$/),
    tablesVerified: z.number().int().positive(),
    rowsVerified: z.number().int().nonnegative(),
    filesVerified: z.number().int().nonnegative(),
    documentsVerified: z.number().int().nonnegative(),
    clinicalVersionsVerified: z.number().int().nonnegative(),
    targetRemoved: z.literal(true),
  })
  .strict();
export function verifyRecoveryReceipt(
  raw: string,
  key: string | undefined,
  now = Date.now()
) {
  if (!key || raw.length > 16384) return null;
  try {
    const envelope = JSON.parse(raw);
    if (
      envelope.algorithm !== "Ed25519-v1" ||
      !/^[a-f0-9]{128}$/.test(envelope.signature)
    )
      return null;
    const publicKey = createPublicKey({
      key: Buffer.from(key, "base64"),
      format: "der",
      type: "spki",
    });
    if (publicKey.asymmetricKeyType !== "ed25519") return null;
    if (
      !verify(
        null,
        Buffer.from(
          "mindos-recovery-receipt-v1:" + JSON.stringify(envelope.payload)
        ),
        publicKey,
        Buffer.from(envelope.signature, "hex")
      )
    )
      return null;
    const parsed = receiptPayload.parse(envelope.payload);
    if (Date.parse(parsed.finishedAt) > now + 60000) return null;
    return {
      finishedAt: parsed.finishedAt,
      durationMs: parsed.durationMs,
      stale: now - Date.parse(parsed.finishedAt) > 7 * 86400000,
    };
  } catch {
    return null;
  }
}
async function recoveryReceipt() {
  try {
    const file = path.resolve(
      ".mindos-private/operations/recovery-latest.json"
    );
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384)
      return null;
    return verifyRecoveryReceipt(
      await readFile(file, "utf8"),
      process.env.RECOVERY_RECEIPT_PUBLIC_KEY
    );
  } catch {
    return null;
  }
}
export async function operationsStatus(user: User) {
  const clinic = await withClinic(user, "MANAGE_TEAM", async (_tx, c) => ({
    name: c.name,
    timezone: c.timezone,
  }));
  const [checks, recovery] = await Promise.all([
    operationalChecks(),
    recoveryReceipt(),
  ]);
  return {
    clinic,
    checkedAt: new Date().toISOString(),
    environment: liveDeployment()
      ? ("production" as const)
      : ("local" as const),
    checks,
    recovery,
    productionApproved: false as const,
  };
}
