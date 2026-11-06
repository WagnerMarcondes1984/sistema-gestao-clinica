import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT, decodeJwt } from "jose";
import { ENV } from "./_core/env";
import { sdk } from "./_core/sdk";

describe("sessão Manus", () => {
  const original = { cookieSecret: ENV.cookieSecret, appId: ENV.appId };
  beforeEach(() => {
    ENV.cookieSecret = "x".repeat(48);
    ENV.appId = "mindos-test";
    vi.stubEnv("SESSION_TTL_HOURS", "8");
  });
  afterEach(() => {
    Object.assign(ENV, original);
    vi.unstubAllEnvs();
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
    const expired = await new SignJWT({
      openId: "demo-owner",
      appId: ENV.appId,
      name: "Demo",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(ENV.cookieSecret));
    expect(await sdk.verifySession(expired)).toBeNull();
    ENV.cookieSecret = "";
    await expect(
      sdk.createSessionToken("demo-owner", { name: "Demo" })
    ).rejects.toThrow("JWT_SECRET");
  });
  it("usa oito horas por padrão e respeita o prazo menor configurado", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await sdk.createSessionToken("demo-owner", { name: "Demo" });
    expect(decodeJwt(token).exp! - now).toBeGreaterThanOrEqual(8 * 3600 - 1);
    expect(decodeJwt(token).exp! - now).toBeLessThanOrEqual(8 * 3600 + 1);
    vi.stubEnv("SESSION_TTL_HOURS", "1");
    expect(await sdk.verifySession(token)).toBeNull();
    const short = await sdk.createSessionToken("demo-owner", { name: "Demo" });
    expect(
      decodeJwt(short).exp! - Math.floor(Date.now() / 1000)
    ).toBeLessThanOrEqual(3600);
    expect(await sdk.verifySession(short)).not.toBeNull();
  });
  it("recusa token sem expiração ou com validade além do limite", async () => {
    const base = () =>
      new SignJWT({
        openId: "demo-owner",
        appId: ENV.appId,
        name: "Demo",
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt();
    const secret = new TextEncoder().encode(ENV.cookieSecret);
    expect(await sdk.verifySession(await base().sign(secret))).toBeNull();
    expect(
      await sdk.verifySession(
        await base().setExpirationTime("365d").sign(secret)
      )
    ).toBeNull();
    for (const expiresInMs of [0, -1, NaN, Infinity, 365 * 86400000])
      await expect(
        sdk.createSessionToken("demo-owner", { name: "Demo", expiresInMs })
      ).rejects.toThrow("Prazo da sessão");
  });
  it("recusa emissão ausente, futura e duração original excessiva mesmo perto da expiração", async () => {
    const now = Math.floor(Date.now() / 1000);
    const sign = (claims: Record<string, unknown>) =>
      new SignJWT({
        openId: "demo-owner",
        appId: ENV.appId,
        name: "Demo",
        ...claims,
      })
        .setProtectedHeader({ alg: "HS256" })
        .sign(new TextEncoder().encode(ENV.cookieSecret));
    for (const claims of [
      { exp: now + 3600 },
      { iat: now + 300, exp: now + 3600 },
      { iat: now - 86400, exp: now + 60 },
      { iat: now + 1, exp: now + 1 },
    ])
      expect(await sdk.verifySession(await sign(claims))).toBeNull();
  });
  it("recusa política inválida ao criar ou conferir uma sessão", async () => {
    const token = await sdk.createSessionToken("demo-owner", { name: "Demo" });
    for (const value of ["0", "25", "NaN"]) {
      vi.stubEnv("SESSION_TTL_HOURS", value);
      await expect(
        sdk.createSessionToken("demo-owner", { name: "Demo" })
      ).rejects.toThrow("SESSION_TTL_HOURS");
      expect(await sdk.verifySession(token)).toBeNull();
    }
  });
});
