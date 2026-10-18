import "dotenv/config";
import assert from "node:assert/strict";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { getTableConfig } from "drizzle-orm/mysql-core";
import * as schema from "../drizzle/schema";

if (!process.env.DATABASE_URL)
  throw new Error("Defina DATABASE_URL antes da verificação.");
const connection = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const [rows] = await connection.query<RowDataPacket[]>(
    "SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()"
  );
  let columns = 0;
  for (const table of Object.values(schema)) {
    const config = getTableConfig(table);
    const actual = rows
      .filter(row => row.TABLE_NAME === config.name)
      .map(row => row.COLUMN_NAME)
      .sort();
    const expected = config.columns.map(column => column.name).sort();
    assert.deepEqual(
      actual,
      expected,
      `Colunas divergentes na tabela ${config.name}`
    );
    columns += expected.length;
  }
  console.log(
    `Schema conferido: ${Object.keys(schema).length} tabelas e ${columns} colunas correspondem ao código.`
  );
} finally {
  await connection.end();
}
