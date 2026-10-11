import { Router } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import * as auth from "../controllers/auth.js";
import * as companies from "../controllers/companies.js";
import * as crm from "../controllers/crm.js";
import * as jobs from "../controllers/jobs.js";
import { requireOwner, originGuard } from "../middleware/auth.js";
import { sourceStatus, niches, nicheGroupsForUI } from "../providers/index.js";
import { db } from "../lib/db.js";
const r = Router();
r.use(originGuard);
r.post(
  "/auth/login",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
  auth.login,
);
r.use(requireOwner);
r.get("/auth/me", (req, res) =>
  res.json({ email: req.owner.email, csrf: req.session.csrf }),
);
r.post("/auth/logout", auth.logout);
r.get("/overview", async (req, res) => {
  const [total, high, needsReview, clients, tasks, group] =
    await db.$transaction([
      db.company.count(),
      db.company.count({ where: { score: { gte: 75 } } }),
      db.company.count({ where: { crmStatus: { in: ["NEW", "REVIEW"] } } }),
      db.company.count({ where: { crmStatus: "CLIENT" } }),
      db.task.count({ where: { done: false, dueAt: { lte: new Date() } } }),
      db.company.groupBy({ by: ["crmStatus"], _count: { id: true } }),
    ]);
  res.json({
    total,
    high,
    needsReview,
    clients,
    overdue: tasks,
    statuses: group,
  });
});
r.get("/settings", (_req, res) =>
  res.json({
    sources: sourceStatus(),
    niches: Object.keys(niches),
    nicheGroups: nicheGroupsForUI,
    weights: {
      website: 25,
      active: 20,
      highTicket: 20,
      automation: 15,
      contact: 10,
      productFit: 10,
    },
    browserEnabled: process.env.AUDIT_BROWSER_ENABLED === "true",
  }),
);
r.get("/companies/export", companies.exportCsv);
r.get("/companies", companies.list);
r.post("/companies", companies.create);
r.get("/companies/:id", companies.detail);
r.put("/companies/:id", companies.update);
r.post("/companies/:id/merge", companies.merge);
r.post("/companies/:id/notes", crm.addNote);
r.post("/companies/:id/tasks", crm.addTask);
r.post("/companies/:id/audit", jobs.audit);
r.get("/tasks", crm.tasks);
r.patch("/tasks/:id", crm.completeTask);
r.get("/jobs", jobs.jobs);
r.post("/jobs/:id/cancel", jobs.cancel);
r.post("/search", rateLimit({ windowMs: 60000, limit: 2 }), jobs.search);
r.post("/search/preview", rateLimit({ windowMs: 60000, limit: 12 }), jobs.preview);
r.post(
  "/imports",
  rateLimit({ windowMs: 60000, limit: 3 }),
  multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1,
      fields: 10,
      fieldSize: 2000,
    },
  }).single("file"),
  jobs.importFile,
);
export default r;
