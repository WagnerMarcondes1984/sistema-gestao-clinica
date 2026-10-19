import { describe, expect, it } from "vitest";
import { randomBytes, generateKeyPairSync } from "node:crypto";
import { runtimeConfig } from "./runtime-config";

const production = (): NodeJS.ProcessEnv => ({
  APP_ENV: "production",
  NODE_ENV: "production",
  HOST: "0.0.0.0",
  DATABASE_URL: "mysql://mindos:independentDatabasePassword123@mysql/mindos",
  JWT_SECRET: randomBytes(32).toString("hex"),
  CLINICAL_INTEGRITY_SECRET: randomBytes(32).toString("hex"),
  DOCUMENT_ENCRYPTION_SECRET: randomBytes(32).toString("hex"),
  RECOVERY_RECEIPT_PUBLIC_KEY: generateKeyPairSync("ed25519")
    .publicKey.export({ format: "der", type: "spki" })
    .toString("base64"),
  VITE_APP_ID: "clinic-app",
  APP_ORIGIN: "https://clinica.test",
  OAUTH_SERVER_URL: "https://auth.test",
  VITE_OAUTH_PORTAL_URL: "https://login.test",
  PRIVATE_DOCUMENT_ROOT: "/var/lib/mindos/documents",
  TRUST_PROXY_CIDRS: "172.30.77.1/32",
});
describe("configuração explícita de produção", () => {
  it("aceita segredos independentes e proxy restrito", () => {
    expect(runtimeConfig(production())).toMatchObject({
      production: true,
      host: "0.0.0.0",
      sessionTtlMs: 28800000,
    });
  });
  it.each([
    "JWT_SECRET",
    "CLINICAL_INTEGRITY_SECRET",
    "DOCUMENT_ENCRYPTION_SECRET",
    "RECOVERY_RECEIPT_PUBLIC_KEY",
    "APP_ORIGIN",
    "TRUST_PROXY_CIDRS",
  ])("recusa ausência de %s sem expor valores", name => {
    const env = production();
    delete env[name];
    expect(() => runtimeConfig(env)).toThrow();
    try {
      runtimeConfig(env);
    } catch (e) {
      expect(String(e)).not.toContain(env.DATABASE_URL);
    }
  });
  it.each(["0.0.0.0/0", "::/0", "true", "127.0.0.1/8", "172.30.77.1/32/0"])(
    "recusa proxy irrestrito ou inválido %s",
    proxy => {
      expect(() =>
        runtimeConfig({ ...production(), TRUST_PROXY_CIDRS: proxy })
      ).toThrow();
    }
  );
  it("recusa reutilização e URLs inseguras", () => {
    const env = production();
    env.DOCUMENT_ENCRYPTION_SECRET = env.JWT_SECRET;
    expect(() => runtimeConfig(env)).toThrow("independentes");
    expect(() =>
      runtimeConfig({ ...production(), APP_ORIGIN: "http://clinica.test" })
    ).toThrow();
    expect(() =>
      runtimeConfig({
        ...production(),
        APP_ORIGIN: "https://clinica.test/path",
      })
    ).toThrow();
    expect(() =>
      runtimeConfig({
        ...production(),
        DATABASE_URL: "mysql://root:password@mysql/mindos",
      })
    ).toThrow();
  });
  it("limita o bundle de revisão ao loopback e banco local", () => {
    const local = {
      NODE_ENV: "production",
      APP_ENV: "local",
      DATABASE_URL: "mysql://demo:password@127.0.0.1:3307/mindos_dev",
    };
    expect(runtimeConfig(local).production).toBe(false);
    expect(() => runtimeConfig({ ...local, HOST: "0.0.0.0" })).toThrow();
    expect(() =>
      runtimeConfig({
        ...local,
        DATABASE_URL: "mysql://demo:password@127.0.0.1/mindos",
      })
    ).toThrow();
  });
});
