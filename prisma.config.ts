import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// IMPORTANT: Prisma Migrate and the better-sqlite3 driver adapter must open
// the SAME SQLite file. Both resolve DATABASE_URL from the project root.
// Do not rewrite file:./prisma/dev.db to file:./dev.db and do not convert
// the URL to file:///C:/... (breaks on Windows paths containing Cyrillic).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
