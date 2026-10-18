export function assertDemoSeedAllowed(env) {
  if (env.NODE_ENV === "production" || env.ALLOW_DEMO_SEED !== "true") {
    throw new Error(
      "Seed demonstrativo desativado. Use ALLOW_DEMO_SEED=true apenas no desenvolvimento."
    );
  }
  const url = new URL(env.DATABASE_URL ?? "");
  if (
    !["mysql:", "mysql2:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !["/mindos_dev", "/mindos_test"].includes(url.pathname)
  ) {
    throw new Error(
      "O seed exige banco local chamado mindos_dev ou mindos_test."
    );
  }
}
