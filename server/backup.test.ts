import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile, rm, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
// @ts-expect-error Biblioteca operacional compartilhada com os CLIs Node.
import {
  encryptArchive,
  decryptArchive,
  validateArchiveNames,
  identifier,
  backupKey,
} from "../scripts/lib/backup.mjs";
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(p => rm(p, { recursive: true, force: true }))
  );
});
async function files() {
  const root = await mkdtemp(path.join(tmpdir(), "mindos-backup-test-"));
  directories.push(root);
  return {
    input: path.join(root, "input"),
    encrypted: path.join(root, "encrypted"),
    output: path.join(root, "output"),
    key: randomBytes(32).toString("base64"),
  };
}
describe("backup autenticado e extração restrita", () => {
  it("recupera o conteúdo exato e mantém permissões privadas", async () => {
    const f = await files();
    const data = randomBytes(256 * 1024);
    await writeFile(f.input, data);
    await encryptArchive(f.input, f.encrypted, f.key);
    await decryptArchive(f.encrypted, f.output, f.key);
    expect(await readFile(f.output)).toEqual(data);
    expect((await lstat(f.encrypted)).mode & 0o777).toBe(0o600);
    expect((await lstat(f.output)).mode & 0o777).toBe(0o600);
  });
  it.each(["wrong-key", "tamper"])(
    "recusa %s e remove sua saída parcial",
    async reason => {
      const f = await files();
      await writeFile(f.input, "conteúdo fictício para teste");
      await encryptArchive(f.input, f.encrypted, f.key);
      if (reason === "tamper") {
        const b = await readFile(f.encrypted);
        b[b.length - 17] ^= 1;
        await writeFile(f.encrypted, b);
      }
      await expect(
        decryptArchive(
          f.encrypted,
          f.output,
          reason === "wrong-key" ? randomBytes(32).toString("base64") : f.key
        )
      ).rejects.toThrow("não autenticado");
      await expect(lstat(f.output)).rejects.toMatchObject({ code: "ENOENT" });
    }
  );
  it("preserva arquivo preexistente ao recusar sobrescrita", async () => {
    const f = await files();
    await writeFile(f.input, "novo");
    await encryptArchive(f.input, f.encrypted, f.key);
    await writeFile(f.output, "preservar");
    await expect(
      decryptArchive(f.encrypted, f.output, f.key)
    ).rejects.toThrow();
    expect(await readFile(f.output, "utf8")).toBe("preservar");
  });
  it("recusa travessia, links, entradas duplicadas e identificador SQL", () => {
    const base = "database.sql\nmanifest.json\nkeys.json\ndocuments/\n",
      modes = "- file\n- file\n- file\nd dir\n";
    expect(validateArchiveNames(base, modes)).toHaveLength(4);
    expect(() =>
      validateArchiveNames(base + "../secret\n", modes + "- file\n")
    ).toThrow();
    expect(() =>
      validateArchiveNames(base, modes.replace("- file", "l link"))
    ).toThrow();
    expect(() =>
      validateArchiveNames(base + "database.sql\n", modes + "- file\n")
    ).toThrow();
    expect(() => identifier("db;DROP")).toThrow();
    expect(() => backupKey("short")).toThrow();
  });
});
