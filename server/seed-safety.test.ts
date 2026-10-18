import { describe, expect, it } from "vitest";
import { assertDemoSeedAllowed } from "./seed-safety.mjs";

describe("proteção do seed demonstrativo", () => {
  const env = {
    NODE_ENV: "development",
    ALLOW_DEMO_SEED: "true",
    DATABASE_URL: "mysql://demo:example@127.0.0.1:3307/mindos_dev",
  };
  it("permite apenas desenvolvimento local explicitamente habilitado", () => {
    expect(() => assertDemoSeedAllowed(env)).not.toThrow();
  });
  it.each([
    { ALLOW_DEMO_SEED: "false" },
    { NODE_ENV: "production" },
    { DATABASE_URL: "mysql://demo:example@db.example.com/mindos_dev" },
    { DATABASE_URL: "mysql://demo:example@localhost/clinica_real" },
    { DATABASE_URL: "" },
  ])("recusa configuração insegura: %j", override => {
    expect(() => assertDemoSeedAllowed({ ...env, ...override })).toThrow();
  });
});
