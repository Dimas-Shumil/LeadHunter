import { fork } from "node:child_process";
import { db } from "../lib/db.js";
import { env } from "../config/env.js";
import { scoreCompany } from "./scoring.js";
export function isolatedAudit(website) {
  return new Promise((resolve, reject) => {
    const child = fork(new URL("../audit/child.js", import.meta.url), [], {
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        USERPROFILE: process.env.USERPROFILE,
        LOCALAPPDATA: process.env.LOCALAPPDATA,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH,
        AUDIT_BROWSER_ENABLED: process.env.AUDIT_BROWSER_ENABLED,
      },
      execArgv: ["--max-old-space-size=384"],
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      detached: process.platform !== "win32",
    });
    let settled = false;
    const stop = () => {
      if (process.platform !== "win32") {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      } else {
        import("node:child_process").then(({ execFile }) =>
          execFile(
            "taskkill",
            ["/PID", String(child.pid), "/T", "/F"],
            () => {},
          ),
        );
      }
    };
    const timer = setTimeout(() => {
      stop();
      done(new Error("Аудит превысил лимит времени"));
    }, env.AUDIT_TIMEOUT_MS);
    function done(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stop();
      error ? reject(error) : resolve(result);
    }
    child.on("message", (m) =>
      done(m.error ? new Error(m.error) : null, m.result),
    );
    child.on("error", (e) => done(e));
    child.on("exit", (code) => {
      if (!settled) done(new Error(`Процесс аудита завершился: ${code}`));
    });
    child.send({ website });
  });
}
export async function auditCompany(id) {
  const company = await db.company.findUnique({ where: { id } });
  if (!company?.website) throw new Error("У компании нет URL для проверки");
  const result = await isolatedAudit(company.website);
  return db.$transaction(async (tx) => {
    const current = await tx.company.findUnique({ where: { id } });
    if (!current) return null;
    await tx.websiteAudit.create({
      data: { companyId: id, website: company.website, ...result },
    });
    if (current.website !== company.website) return null;
    // Enrich only from a single syntactically valid tel: link on the company's own website.
    // Never overwrite existing contact data or claim the number was called/verified.
    const found = Array.isArray(result.metrics?.phoneCandidates) ? result.metrics.phoneCandidates : [];
    const phoneFromSite = !current.phone && found.length === 1 ? found[0] : null;
    const changed = phoneFromSite ? {
      ...current, phone: phoneFromSite,
      contactBasis: `Телефон из tel: ссылки официального сайта ${current.website}; доступность не проверялась`,
    } : current;
    await tx.company.update({
      where: { id },
      data: {
        ...(phoneFromSite ? { phone: changed.phone, contactBasis: changed.contactBasis } : {}),
        websiteStatus: result.status,
        ...scoreCompany(changed, result),
        revision: { increment: 1 },
      },
    });
    await tx.activity.create({
      data: {
        companyId: id,
        type: "AUDITED",
        details: { status: result.status, website: company.website },
      },
    });
    return result;
  });
}
