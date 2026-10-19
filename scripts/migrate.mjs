import "dotenv/config";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
let connection;
try {
  if (!process.env.DATABASE_URL) throw new Error();
  connection = await mysql.createConnection(process.env.DATABASE_URL);
  const [[lock]] = await connection.query(
    "SELECT GET_LOCK('mindos_schema_migrations',30) AS acquired"
  );
  if (Number(lock.acquired) !== 1) throw new Error();
  try {
    await migrate(drizzle(connection), { migrationsFolder: "drizzle" });
  } finally {
    await connection.query("SELECT RELEASE_LOCK('mindos_schema_migrations')");
  }
  console.log("Migrações aplicadas. Seed não executado.");
} catch {
  console.error(
    "Migração não concluída; mantenha a aplicação parada e confira o banco e o histórico."
  );
  process.exitCode = 1;
} finally {
  await connection?.end();
}
