import { db } from "./db.js";

// SQLite does not support pg_advisory_xact_lock or SKIP LOCKED. A tiny UPDATE
// acquires SQLite's one-writer lock before reads used to choose/create a job or
// a company. Retry whole transactions in the rare event of SQLITE_BUSY.
export async function writeTransaction(fn) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        await tx.$executeRaw`UPDATE "_WriteLock" SET "revision" = "revision" + 1 WHERE "id" = 1`;
        return fn(tx);
      }, { timeout: 15000, maxWait: 15000 });
    } catch (error) {
      const info = `${error.code || ""} ${error.message || ""}`;
      if (!/(SQLITE_BUSY|database is locked|P2034|P1008|P2028)/i.test(info) || attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 80 * (attempt + 1)));
    }
  }
}
