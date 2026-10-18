import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("migrações de uma instalação nova", () => {
  it("inclui todos os arquivos referenciados pelo journal e cria usuários antes das demais tabelas", () => {
    const root = resolve(import.meta.dirname, "../drizzle");
    const journal = JSON.parse(
      readFileSync(resolve(root, "meta/_journal.json"), "utf8")
    );
    for (const entry of journal.entries) {
      expect(existsSync(resolve(root, `${entry.tag}.sql`)), entry.tag).toBe(
        true
      );
    }
    const initial = readFileSync(
      resolve(root, `${journal.entries[0].tag}.sql`),
      "utf8"
    );
    expect(initial).toContain("CREATE TABLE `users`");
    expect(initial).toContain("`users_openId_unique`");
  });
});
