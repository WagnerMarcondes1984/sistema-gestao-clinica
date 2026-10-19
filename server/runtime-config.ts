import path from "node:path";
import { isIP } from "node:net";
import { createPublicKey } from "node:crypto";
export class RuntimeConfigurationError extends Error {}
export type RuntimeConfig = {
  production: boolean;
  host: string;
  port: number;
  origin: string;
  trustProxy: false | string[];
  sessionTtlMs: number;
};
export function runtimeConfig(
  env: NodeJS.ProcessEnv = process.env
): RuntimeConfig {
  const production = env.APP_ENV
    ? env.APP_ENV === "production"
    : env.NODE_ENV === "production";
  const errors: string[] = [];
  if (env.APP_ENV && !["local", "production"].includes(env.APP_ENV))
    errors.push("APP_ENV inválido");
  const host = env.HOST || "127.0.0.1",
    port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    errors.push("PORT inválido");
  const secretNames = [
    "JWT_SECRET",
    "CLINICAL_INTEGRITY_SECRET",
    "DOCUMENT_ENCRYPTION_SECRET",
  ];
  if (production) {
    for (const n of secretNames) {
      const s = env[n] || "";
      if (
        s.length < 32 ||
        new Set(s).size < 8 ||
        /SUBSTITUA|CHANGE.?ME|EXAMPLE|PLACEHOLDER/i.test(s)
      )
        errors.push(`${n} precisa de segredo próprio`);
    }
    if (new Set(secretNames.map(n => env[n])).size !== secretNames.length)
      errors.push("Segredos precisam ser independentes");
    try {
      const publicKey = createPublicKey({
        key: Buffer.from(env.RECOVERY_RECEIPT_PUBLIC_KEY || "", "base64"),
        format: "der",
        type: "spki",
      });
      if (publicKey.asymmetricKeyType !== "ed25519") throw new Error();
    } catch {
      errors.push("RECOVERY_RECEIPT_PUBLIC_KEY inválida");
    }
    for (const n of [
      "VITE_APP_ID",
      "OAUTH_SERVER_URL",
      "VITE_OAUTH_PORTAL_URL",
    ])
      if (!env[n]) errors.push(`${n} não configurado`);
    for (const n of [
      "APP_ORIGIN",
      "OAUTH_SERVER_URL",
      "VITE_OAUTH_PORTAL_URL",
    ]) {
      try {
        const u = new URL(env[n] || "");
        if (
          u.protocol !== "https:" ||
          u.username ||
          u.password ||
          ["localhost", "127.0.0.1", "::1"].includes(u.hostname) ||
          u.hostname.endsWith(".example.com")
        )
          throw new Error();
        if (n === "APP_ORIGIN" && (u.pathname !== "/" || u.search || u.hash))
          throw new Error();
      } catch {
        errors.push(`${n} precisa de URL HTTPS válida`);
      }
    }
    if (env.ENABLE_MANUS_DEBUG === "true" || env.ALLOW_DEMO_SEED === "true")
      errors.push("Diagnóstico sensível e seed devem ficar desativados");
    if (
      !env.PRIVATE_DOCUMENT_ROOT ||
      !path.isAbsolute(env.PRIVATE_DOCUMENT_ROOT)
    )
      errors.push("PRIVATE_DOCUMENT_ROOT deve ser absoluto e persistente");
  }
  let db: URL | undefined;
  try {
    db = new URL(env.DATABASE_URL || "");
    if (
      db.protocol !== "mysql:" ||
      !db.username ||
      !db.password ||
      !/^\/[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(db.pathname)
    )
      throw new Error();
  } catch {
    errors.push("DATABASE_URL inválida");
  }
  if (
    production &&
    db &&
    (decodeURIComponent(db.password).length < 20 ||
      /SUBSTITUA|CHANGE.?ME|EXAMPLE/i.test(decodeURIComponent(db.password)) ||
      db.username === "root")
  )
    errors.push("Banco exige usuário próprio e senha forte");
  if (production && db && ["/mindos_dev", "/mindos_test"].includes(db.pathname))
    errors.push("Produção exige banco próprio");
  if (
    !production &&
    env.NODE_ENV === "production" &&
    (!["127.0.0.1", "::1", "localhost"].includes(host) ||
      !db ||
      !["localhost", "127.0.0.1", "[::1]"].includes(db.hostname) ||
      !["/mindos_dev", "/mindos_test"].includes(db.pathname))
  )
    errors.push("Revisão local exige loopback e banco de desenvolvimento");
  const proxy = (env.TRUST_PROXY_CIDRS || "")
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
  for (const cidr of proxy) {
    const [ip, bits] = cidr.split("/");
    const v = isIP(ip);
    if (
      cidr.split("/").length > 2 ||
      !v ||
      (bits !== undefined &&
        (!/^\d+$/.test(bits) ||
          Number(bits) < (v === 4 ? 24 : 64) ||
          Number(bits) > (v === 4 ? 32 : 128))) ||
      ip === "0.0.0.0" ||
      ip === "::"
    )
      errors.push("TRUST_PROXY_CIDRS inválido ou irrestrito");
  }
  if (production && !proxy.length)
    errors.push("Configure o proxy HTTPS confiável explicitamente");
  const hours = Number(env.SESSION_TTL_HOURS || 8);
  if (!Number.isFinite(hours) || hours < 1 || hours > 24)
    errors.push("SESSION_TTL_HOURS deve estar entre 1 e 24");
  if (errors.length) throw new RuntimeConfigurationError(errors.join("; "));
  return {
    production,
    host,
    port,
    origin: production ? new URL(env.APP_ORIGIN!).origin : "",
    trustProxy: proxy.length ? proxy : false,
    sessionTtlMs: hours * 3600000,
  };
}
export function liveDeployment(env: NodeJS.ProcessEnv = process.env) {
  return (
    env.APP_ENV === "production" ||
    (!env.APP_ENV && env.NODE_ENV === "production")
  );
}
