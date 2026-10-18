import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign as cryptoSign } from "node:crypto";
import { verifyRecoveryReceipt } from "./operations";
const pair = generateKeyPairSync("ed25519"),
  key = pair.publicKey
    .export({ format: "der", type: "spki" })
    .toString("base64");
const payload = {
  format: 1,
  result: "PASS",
  scope: "LOCAL_RESTORE_DRILL",
  finishedAt: new Date().toISOString(),
  durationMs: 100,
  backupSha256: "a".repeat(64),
  tablesVerified: 40,
  rowsVerified: 0,
  filesVerified: 0,
  documentsVerified: 0,
  clinicalVersionsVerified: 0,
  targetRemoved: true,
};
const sign = (p: unknown) =>
  JSON.stringify({
    algorithm: "Ed25519-v1",
    payload: p,
    signature: cryptoSign(
      null,
      Buffer.from("mindos-recovery-receipt-v1:" + JSON.stringify(p)),
      pair.privateKey
    ).toString("hex"),
  });
describe("evidência de recuperação local", () => {
  it("aceita somente recibo autenticado e informa vencimento", () => {
    expect(verifyRecoveryReceipt(sign(payload), key)?.stale).toBe(false);
    expect(
      verifyRecoveryReceipt(sign(payload), key, Date.now() + 8 * 86400000)
        ?.stale
    ).toBe(true);
  });
  it("recusa assinatura alterada, chave incorreta, escopo diferente e limpeza incompleta", () => {
    expect(
      verifyRecoveryReceipt(
        sign(payload).replace('"tablesVerified":40', '"tablesVerified":41'),
        key
      )
    ).toBeNull();
    expect(
      verifyRecoveryReceipt(
        sign(payload),
        generateKeyPairSync("ed25519")
          .publicKey.export({ format: "der", type: "spki" })
          .toString("base64")
      )
    ).toBeNull();
    expect(
      verifyRecoveryReceipt(sign({ ...payload, scope: "PRODUCTION" }), key)
    ).toBeNull();
    expect(
      verifyRecoveryReceipt(sign({ ...payload, targetRemoved: false }), key)
    ).toBeNull();
    expect(
      verifyRecoveryReceipt(
        sign({
          ...payload,
          finishedAt: new Date(Date.now() + 3600000).toISOString(),
        }),
        key
      )
    ).toBeNull();
  });
});
