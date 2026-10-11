import { z } from "zod";
import { db } from "../lib/db.js";
import { companySchema, patchSchema, statuses } from "../validators/company.js";
import {
  listQuery,
  ingestCompany,
  editCompany,
  mergeCompanies,
} from "../services/companies.js";
import { HttpError } from "../lib/errors.js";
import { csvCell } from "../services/imports.js";
const filterSchema = z.object({
  q: z.string().max(200).optional(),
  city: z.string().max(120).optional(),
  niche: z.string().max(150).optional(),
  crmStatus: z.enum(statuses).optional(),
  websiteStatus: z
    .enum([
      "NOT_FOUND",
      "UNCHECKED",
      "AVAILABLE",
      "ISSUES",
      "UNAVAILABLE",
      "BLOCKED",
    ])
    .optional(),
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  sort: z.enum(["name", "score", "createdAt", "updatedAt", "city"]).optional(),
  direction: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export async function list(req, res) {
  const q = filterSchema.parse(req.query),
    query = listQuery(q);
  const [items, total] = await db.$transaction([
    db.company.findMany({
      ...query,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        sources: { take: 1 },
        tasks: { where: { done: false }, orderBy: { dueAt: "asc" }, take: 1 },
      },
    }),
    db.company.count({ where: query.where }),
  ]);
  res.json({ items, total, page: q.page, pageSize: q.pageSize });
}
export async function detail(req, res) {
  const c = await db.company.findUnique({
    where: { id: req.params.id },
    include: {
      sources: true,
      audits: { orderBy: { createdAt: "desc" }, take: 10 },
      notes: { orderBy: { createdAt: "desc" }, take: 100 },
      tasks: { orderBy: { dueAt: "asc" }, take: 100 },
      history: { orderBy: { createdAt: "desc" }, take: 100 },
      duplicates: { include: { matched: true } },
      matchedDuplicates: { include: { company: true } },
    },
  });
  if (!c) throw new HttpError(404, "Компания не найдена");
  res.json(c);
}
export async function create(req, res) {
  res.status(201).json(await ingestCompany(companySchema.parse(req.body)));
}
export async function update(req, res) {
  const input = patchSchema.parse(req.body);
  res.json(await editCompany(req.params.id, input.data, input.revision));
}
export async function merge(req, res) {
  const input = z
    .object({ fromId: z.string().min(1), confirm: z.literal(true) })
    .parse(req.body);
  res.json(await mergeCompanies(req.params.id, input.fromId));
}
export async function exportCsv(req, res) {
  const q = filterSchema.parse(req.query);
  const rows = await db.company.findMany({
    ...listQuery(q),
    take: 10000,
    include: { sources: true },
  });
  const columns = [
    "name",
    "city",
    "region",
    "niche",
    "website",
    "websiteStatus",
    "score",
    "phone",
    "email",
    "inn",
    "ogrn",
    "crmStatus",
    "contactBasis",
    "sourceUrl",
    "license",
    "createdAt",
  ];
  const output =
    "\uFEFF" +
    [
      columns.map(csvCell).join(";"),
      ...rows.map((r) =>
        columns
          .map((k) =>
            csvCell(
              k === "sourceUrl"
                ? r.sources.map((s) => s.sourceUrl).join(" | ")
                : k === "license"
                  ? r.sources.map((s) => s.license).join(" | ")
                  : r[k],
            ),
          )
          .join(";"),
      ),
    ].join("\r\n");
  res
    .set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="shumdev-leads.csv"',
      "X-Export-Limit": "10000",
    })
    .send(output);
}
