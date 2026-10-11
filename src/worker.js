import { db } from "./lib/db.js";
import { claimJob } from "./services/jobs.js";
import { executeJob } from "./services/execute-job.js";
let stopping = false;
process.on("SIGINT", () => (stopping = true));
process.on("SIGTERM", () => (stopping = true));
console.log("Lead Hunter worker: 1 задание одновременно");
while (!stopping) {
  try {
    await db.job.updateMany({
      where: {
        status: "RUNNING",
        heartbeatAt: { lt: new Date(Date.now() - 3 * 60 * 1000) },
      },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error:
          "Worker остановился. Создайте новое задание: уже сохранённые компании не потеряны.",
        payload: { summary: "Interrupted" },
      },
    });
    const job = await claimJob();
    if (job) await executeJob(job, () => stopping);
    else await new Promise((r) => setTimeout(r, 1500));
  } catch (e) {
    console.error(
      JSON.stringify({ event: "worker_error", message: e.message }),
    );
    await new Promise((r) => setTimeout(r, 3000));
  }
}
await db.$disconnect();
