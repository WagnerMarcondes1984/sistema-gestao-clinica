import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";

describe("sessão Manus", () => {
  const original = { cookieSecret: ENV.cookieSecret, appId: ENV.appId };
  beforeEach(() => {
    ENV.cookieSecret = "x".repeat(48);
    ENV.appId = "mindos-test";
  });
  afterEach(() => {
    Object.assign(ENV, original);
  });
  it("aceita token válido apenas para o app configurado", async () => {
    const token = await sdk.createSessionToken("demo-owner", { name: "Demo" });
    expect(await sdk.verifySession(token)).toMatchObject({
      openId: "demo-owner",
      appId: "mindos-test",
    });
    ENV.appId = "outro-app";
    expect(await sdk.verifySession(token)).toBeNull();
  });
  it("recusa segredo vazio e token expirado", async () => {
    const expired = await sdk.createSessionToken("demo-owner", {
      name: "Demo",
      expiresInMs: -60_000,
    });
    expect(await sdk.verifySession(expired)).toBeNull();
    ENV.cookieSecret = "";
    await expect(
      sdk.createSessionToken("demo-owner", { name: "Demo" })
    ).rejects.toThrow("JWT_SECRET");
  });
});
