import { db } from "../lib/db.js";
import { ingestCompany } from "./companies.js";
import { auditCompany } from "./audits.js";
import { getProvider } from "../providers/index.js";
export async function executeJob(job, shouldStop = () => false) {
  const progress = {
    found: 0,
    new: 0,
    duplicates: 0,
    checked: 0,
    failed: 0,
    errors: job.payload.errors || [],
  };
  const heartbeat = setInterval(
    () =>
      db.job
        .updateMany({
          where: { id: job.id, status: "RUNNING" },
          data: { heartbeatAt: new Date() },
        })
        .catch(() => {}),
    10000,
  );
  const save = () =>
    db.job.update({ where: { id: job.id }, data: { progress } });
  const cancelled = async () =>
    shouldStop() ||
    (
      await db.job.findUnique({
        where: { id: job.id },
        select: { cancelRequested: true },
      })
    )?.cancelRequested;
  try {
    if (job.type === "AUDIT") {
      if (await cancelled()) throw new Error("CANCELLED");
      await auditCompany(job.payload.companyId);
      progress.checked = 1;
    } else {
      let rows =
        job.type === "SEARCH"
          ? await getProvider(job.payload.provider).search(job.payload)
          : job.payload.rows.map((r) => ({
              ...r,
              source: {
                provider: "import",
                sourceUrl: r.sourceUrl,
                license: job.payload.license,
              },
            }));
      progress.found = rows.length;
      await save();
      for (const row of rows) {
        if (await cancelled()) throw new Error("CANCELLED");
        try {
          const result = await ingestCompany(row.data, row.source);
          result.duplicate ? progress.duplicates++ : progress.new++;
          if (row.data.website && job.payload.audit) {
            try {
              await auditCompany(result.company.id);
              progress.checked++;
            } catch (e) {
              progress.failed++;
              if (progress.errors.length < 100)
                progress.errors.push({
                  company: row.data.name,
                  error: e.message,
                });
            }
          }
        } catch (e) {
          progress.failed++;
          if (progress.errors.length < 100)
            progress.errors.push({ company: row.data.name, error: e.message });
        }
        await save();
      }
    }
    await db.job.update({
      where: { id: job.id },
      data: {
        status: (await cancelled()) ? "CANCELLED" : "COMPLETED",
        progress,
        finishedAt: new Date(),
        payload: { summary: "Payload очищен после обработки" },
      },
    });
  } catch (e) {
    await db.job.update({
      where: { id: job.id },
      data: {
        status: e.message === "CANCELLED" ? "CANCELLED" : "FAILED",
        error: e.message.slice(0, 500),
        progress,
        finishedAt: new Date(),
        payload: { summary: "Payload очищен после обработки" },
      },
    });
    console.error(
      JSON.stringify({
        event: "job_failed",
        jobId: job.id,
        message: e.message,
      }),
    );
  } finally {
    clearInterval(heartbeat);
  }
}
