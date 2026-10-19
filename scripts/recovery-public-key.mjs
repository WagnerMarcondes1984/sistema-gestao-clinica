// Imprime somente a chave pública; a chave de abertura dos backups não é exibida.
import "dotenv/config";
import { receiptPublicKey } from "./lib/backup.mjs";
try {
  console.log(
    "RECOVERY_RECEIPT_PUBLIC_KEY=" +
      receiptPublicKey(process.env.BACKUP_ENCRYPTION_KEY)
  );
} catch {
  console.error(
    "Configure a chave operacional de backup antes de gerar a chave pública."
  );
  process.exitCode = 1;
}
