import { db } from "../lib/db.js";
import { writeTransaction } from "../lib/write-transaction.js";
import { HttpError } from "../lib/errors.js";
export async function enqueue(type, payload) {
  return writeTransaction(async (tx) => {
    if (
      (await tx.job.count({
        where: { status: { in: ["QUEUED", "RUNNING"] } },
      })) >= 20
    )
      throw new HttpError(
        429,
        "Очередь заполнена, дождитесь завершения заданий",
      );
    return tx.job.create({ data: { type, payload } });
  });
}
export async function claimJob() {
  return writeTransaction(async (tx) => {
    const job = await tx.job.findFirst({
      where: { status: "QUEUED", cancelRequested: false },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (!job) return null;
    return tx.job.update({
      where: { id: job.id },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
        heartbeatAt: new Date(),
      },
    });
  });
}
