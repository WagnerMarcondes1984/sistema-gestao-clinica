import "dotenv/config";
import { defineConfig } from "vitest/config";
import base from "./vitest.config";

export default defineConfig({
  ...base,
  test: {
    environment: "node",
    include: ["server/**/*.integration.test.ts"],
    testTimeout: 30_000,
    // Fixtures de agenda gravam várias disponibilidades em transações duráveis.
    // Preparação e limpeza precisam terminar também em discos locais lentos.
    hookTimeout: 120_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
