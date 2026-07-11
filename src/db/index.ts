/**
 * Single shared SQLite connection.
 *
 * The database is opened in WAL mode with a busy timeout so the request path
 * and the expiry sweep can write concurrently without tripping over each other.
 * The schema is applied on open, so `import { db }` is enough to get a ready
 * database in dev; `npm run migrate` exists for explicit/CI use.
 */

import Database, { type Database as DatabaseInstance } from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

const schemaPath = fileURLToPath(new URL("./schema.sql", import.meta.url));

function open(): DatabaseInstance {
  // Ensure the parent directory exists (e.g. ./data) before opening.
  if (config.databasePath !== ":memory:") {
    mkdirSync(dirname(config.databasePath), { recursive: true });
  }

  const connection = new Database(config.databasePath);
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
  connection.pragma("busy_timeout = 5000");

  const schema = readFileSync(schemaPath, "utf8");
  connection.exec(schema);

  return connection;
}

export const db: DatabaseInstance = open();

/** Current UTC time in the same textual format SQLite's datetime('now') uses. */
export function nowSql(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

/** UTC time `hours` from now, in SQLite text format. */
export function hoursFromNowSql(hours: number): string {
  const t = new Date(Date.now() + hours * 3600_000);
  return t.toISOString().replace("T", " ").slice(0, 19);
}
