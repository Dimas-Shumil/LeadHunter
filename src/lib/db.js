import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { env } from "../config/env.js";

// The adapter resolves this relative URL from the project's working directory.
// Do not pass pathToFileURL(): percent-encoded Cyrillic Windows paths are invalid.
export const db = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: env.DATABASE_URL }),
});
