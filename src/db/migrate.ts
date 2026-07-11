/**
 * Explicit migration entrypoint: `npm run migrate`.
 *
 * Importing ../db already applies schema.sql on open (the statements are all
 * IF NOT EXISTS), so this is really "open the DB, confirm the schema is there,
 * and exit non-zero if anything blew up." Handy in CI and first-time setup.
 */

import { db } from "./index.js";

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all() as { name: string }[];

console.log("Rollcall schema applied. Tables:");
for (const { name } of tables) {
  console.log(`  - ${name}`);
}
