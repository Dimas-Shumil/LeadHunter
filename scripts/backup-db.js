import "dotenv/config";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../src/lib/db.js";
import { sqliteUrl } from "../src/lib/sqlite-path.js";

const databasePath = fileURLToPath(sqliteUrl(process.env.DATABASE_URL));
const backupDir = join(dirname(databasePath), "backups");
await mkdir(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = resolve(backupDir, `lead-hunter-${stamp}.db`);
try {
  // SQLite online-consistent backup, including data not yet checkpointed from WAL.
  // The backup file must not already exist.
  await db.$executeRawUnsafe("VACUUM INTO ?", backupPath);
  console.log(`Копия SQLite создана: ${backupPath}`);
} finally {
  await db.$disconnect();
}
