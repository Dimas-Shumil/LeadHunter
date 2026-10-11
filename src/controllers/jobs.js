import { z } from "zod";
import { db } from "../lib/db.js";
import { enqueue } from "../services/jobs.js";
import { parseImport } from "../services/import-parser.js";
import { getProvider, niches, sourceStatus } from "../providers/index.js";
import { HttpError } from "../lib/errors.js";
import { preview2gis } from "../providers/2gis-preview.js";
import { previewYandex } from "../providers/yandex-preview.js";
import { searchTerms } from "../providers/niche-catalog.js";
import { ingestCompany } from "../services/companies.js";
import { companySchema } from "../validators/company.js";
import { inspectPhone } from "../services/phone.js";
const searchSchema = z.object({
  region: z.string().trim().min(2).max(150),
  city: z.string().trim().min(2).max(120),
  niches: z
    .array(z.enum(Object.keys(niches)))
    .max(12)
    .default([]),
  query: z.string().trim().max(100).default(""),
  provider: z.string().max(20),
  website: z.enum(["any", "found", "not_found"]).default("any"),
  limit: z.number().int().min(1).max(200).default(50),
  audit: z.boolean().default(false),
}).refine(data => data.niches.length > 0 || data.query.length >= 2, { message: "Выберите нишу или укажите запрос от двух символов" });
export async function search(req, res) {
  const input = searchSchema.parse(req.body);
  if (input.query && input.query.length < 2) throw new HttpError(400, "Свободный запрос должен содержать хотя бы два символа");
  if (input.query && input.provider === "osm") throw new HttpError(400, "Свободный запрос поддерживается только через 2ГИС и Яндекс API");
  if (input.provider === "osm" && input.niches.some(n => !niches[n]?.length)) throw new HttpError(400, "Некоторые выбранные ниши пока не представлены точными тегами OSM; используйте 2ГИС или Яндекс");
  if (input.provider === "auto" && sourceStatus().filter(s => s.status === "READY" && s.id !== "auto").every(s => s.id === "osm") && (input.limit > 50 || input.niches.length > 3) && process.env.OVERPASS_URL?.includes("overpass-api.de"))
    throw new HttpError(400, "Пробный бесплатный поиск: максимум 50 организаций и 3 ниши");
  if (getProvider(input.provider).status() !== "READY")
    throw new HttpError(400, "Источник не готов: проверьте API-ключ и права в .env или выберите Автопоиск / OSM");
  res.status(202).json(await enqueue("SEARCH", input));
}
// Online preview. Optional permission-gated import of the returned page into CRM.
const previewSchema = z.object({
  source: z.enum(["2gis", "yandex"]).default("2gis"),
  region: z.string().trim().min(2).max(150),
  city: z.string().trim().min(2).max(120),
  query: z.string().trim().max(100).default(""),
  niche: z.string().trim().max(150).default(""),
  page: z.number().int().min(1).max(5).default(1),
  website: z.enum(["any", "found", "not_found"]).default("any"),
  save: z.boolean().default(false),
  audit: z.boolean().default(false),
});
export async function preview(req, res) {
  const input = previewSchema.parse(req.body);
  const term = input.query || searchTerms[input.niche]?.[0];
  if (!term) throw new HttpError(400, "Введите название компании/услуги или выберите категорию");
  // Never persist licensed map data unless a separate permission has been configured.
  if (input.save && getProvider(input.source).status() !== "READY")
    throw new HttpError(403, "Сохранение этого источника отключено: отсутствует разрешение на хранение данных");
  const result = await (input.source === "yandex" ? previewYandex({ ...input, query: term }) : preview2gis({ ...input, query: term }));
  if (!input.save) return res.json(result);
  const saved = { new: 0, duplicates: 0, errors: 0, auditsQueued: 0 };
  for (const row of result.items) {
    try {
      const contact = inspectPhone(row.phone);
      const phone = contact.state === "format_ok" ? contact.value : null;
      const url = input.source === "2gis" ? "https://2gis.ru/firm/" + encodeURIComponent(row.id)
        : "https://yandex.ru/maps/org/" + encodeURIComponent(row.id) + "/";
      const company = companySchema.parse({
        name: row.name, city: input.city, region: input.region, niche: input.niche || `Поиск: ${term}`,
        address: row.address || "", website: row.website, phone,
        contactBasis: phone ? `Деловой контакт из разрешённого каталога: ${url}` : "",
      });
      const resultRow = await ingestCompany(company, {
        provider: input.source, externalId: row.id, sourceUrl: url,
        license: `Подтверждённое разрешение владельца ключа на хранение ${input.source}`,
      });
      saved[resultRow.duplicate ? "duplicates" : "new"]++;
      if (input.audit && company.website && !resultRow.duplicate) {
        await enqueue("AUDIT", { companyId: resultRow.company.id });
        saved.auditsQueued++;
      }
    } catch (error) {
      saved.errors++;
    }
  }
  res.json({ ...result, storage: true, saved,
    disclaimer: `Результаты страницы обработаны для CRM: новых ${saved.new}, дубликатов ${saved.duplicates}, ошибок ${saved.errors}, проверок сайта в очереди ${saved.auditsQueued}.` });
}

export async function importFile(req, res) {
  if (!req.file) throw new HttpError(400, "Выберите файл");
  const input = z
    .object({
      contactBasis: z.string().trim().min(5).max(1000),
      license: z.string().trim().min(5).max(1000),
      niche: z.string().max(150).default("Не указана"),
      city: z.string().max(120).default(""),
      audit: z.enum(["true", "false"]).default("false"),
    })
    .parse(req.body);
  const parsed = await parseImport(req.file.buffer, req.file.originalname, {
    contactBasis: input.contactBasis,
    niche: input.niche,
    city: input.city,
  });
  if (!parsed.valid.length)
    throw new HttpError(
      400,
      `Нет валидных строк. ${JSON.stringify(parsed.errors.slice(0, 5))}`,
    );
  res.status(202).json(
    await enqueue("IMPORT", {
      rows: parsed.valid,
      errors: parsed.errors.slice(0, 100),
      total: parsed.total,
      license: input.license,
      audit: input.audit === "true",
    }),
  );
}
export async function audit(req, res) {
  const c = await db.company.findUnique({ where: { id: req.params.id } });
  if (!c?.website) throw new HttpError(400, "Укажите сайт компании");
  const existing = await db.job.findFirst({
    where: {
      type: "AUDIT",
      status: { in: ["QUEUED", "RUNNING"] },
      payload: { path: ["companyId"], equals: c.id },
    },
  });
  res
    .status(202)
    .json(existing || (await enqueue("AUDIT", { companyId: c.id })));
}
export async function jobs(req, res) {
  res.json(
    await db.job.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        type: true,
        status: true,
        progress: true,
        error: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
        heartbeatAt: true,
        cancelRequested: true,
      },
    }),
  );
}
export async function cancel(req, res) {
  const result = await db.job.updateMany({
    where: { id: req.params.id, status: { in: ["QUEUED", "RUNNING"] } },
    data: { cancelRequested: true },
  });
  await db.job.updateMany({
    where: { id: req.params.id, status: "QUEUED" },
    data: {
      status: "CANCELLED",
      finishedAt: new Date(),
      payload: { summary: "Cancelled" },
    },
  });
  res.json({ ok: result.count > 0 });
}
