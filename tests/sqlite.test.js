import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { sqliteUrl } from "../src/lib/sqlite-path.js";

// Both Prisma Migrate and PrismaBetterSqlite3 must use the same DATABASE_URL.
test("Prisma CLI config and runtime adapter use identical DATABASE_URL", () => {
  const cliConfig = readFileSync(new URL("../prisma.config.ts", import.meta.url), "utf8");
  const runtime = readFileSync(new URL("../src/lib/db.js", import.meta.url), "utf8");
  assert.match(cliConfig, /datasource:\s*\{\s*url:\s*env\("DATABASE_URL"\)\s*\}/);
  assert.match(runtime, /new PrismaBetterSqlite3\(\{\s*url:\s*env\.DATABASE_URL\s*\}\)/);
});

test("SQLite backup helper resolves path from project root", () => {
  const root = resolve("/tmp", "Павел.DESKTOP-JFFFGLC", "Work", "LeadHunter");
  assert.equal(fileURLToPath(sqliteUrl("file:./prisma/dev.db", root)), resolve(root, "prisma/dev.db"));
});

test("SQLite URL rejects non-SQLite and invalid URL variants", () => {
  for (const value of ["postgresql://localhost/db", "file:", "file:./dev.db?mode=ro", "file:./dev.db#fragment"])
    assert.throws(() => sqliteUrl(value));
});
