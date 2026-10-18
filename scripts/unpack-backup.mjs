import "dotenv/config";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  OperationalError,
  privateDirectory,
  unpackAuthenticated,
} from "./lib/backup.mjs";
try {
  if (!process.env.RESTORE_BACKUP_FILE) throw new OperationalError();
  const root = await privateDirectory(
    process.env.RESTORE_ROOT || ".mindos-private/recovery-manual"
  );
  const target = path.join(root, "restored-" + randomUUID());
  const manifest = await unpackAuthenticated(
    process.env.RESTORE_BACKUP_FILE,
    target,
    process.env.BACKUP_ENCRYPTION_KEY
  );
  console.log(
    JSON.stringify({
      status: "authenticated_not_imported",
      directory: target,
      tables: Object.keys(manifest.tables).length,
      files: manifest.files.length,
    })
  );
} catch {
  console.error(
    "Extração não concluída; confira o arquivo, a chave e o diretório privado. Nenhum banco foi importado."
  );
  process.exitCode = 1;
}
