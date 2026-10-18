import "dotenv/config";
import { OperationalError, createBackup } from "./lib/backup.mjs";
try {
  const r = await createBackup({
    databaseUrl: process.env.BACKUP_DATABASE_URL || process.env.DATABASE_URL,
    container:
      process.env.BACKUP_SOURCE_CONTAINER || "mindos-development-mysql-1",
    documentsRoot:
      process.env.PRIVATE_DOCUMENT_ROOT || ".mindos-private/documents",
    backupRoot: process.env.BACKUP_ROOT || ".mindos-private/backups",
    key: process.env.BACKUP_ENCRYPTION_KEY,
    clinicalSecret: process.env.CLINICAL_INTEGRITY_SECRET,
    documentSecret: process.env.DOCUMENT_ENCRYPTION_SECRET,
    appContainer: process.env.BACKUP_APP_CONTAINER,
    production:
      process.env.APP_ENV === "production" ||
      (!process.env.APP_ENV && process.env.NODE_ENV === "production"),
  });
  console.log(
    JSON.stringify({
      status: "created_not_restored",
      path: r.path,
      sha256: r.sha256,
      createdAt: r.createdAt,
    })
  );
} catch (e) {
  console.error(
    "Backup não concluído:",
    e instanceof OperationalError
      ? e.message
      : "Falha operacional; detalhes sensíveis omitidos"
  );
  process.exitCode = 1;
}
