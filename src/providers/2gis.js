import { trustedApiRequest } from "./trusted-api-request.js";
import { HttpError } from "../lib/errors.js";
import { companySchema } from "../validators/company.js";
import { map2gisItem, searchPhrases, uniqueRows } from "./maps-utils.js";

export const dgisProvider = {
  id: "2gis",
  name: "2ГИС — поиск организаций",
  status: () => !process.env.DGIS_API_KEY ? "NOT_CONFIGURED" :
    process.env.DGIS_STORAGE_ALLOWED === "true" ? "READY" : "NEEDS_RIGHTS",
  note: () => !process.env.DGIS_API_KEY ?
    "Приоритетный источник. Нужен DGIS_API_KEY. Для накопления CRM — разрешение на хранение данных." :
    process.env.DGIS_STORAGE_ALLOWED !== "true" ?
    "Ключ задан, но хранение не подтверждено (DGIS_STORAGE_ALLOWED). Поиск не включён." :
    `Поиск по нишам и городам; ${process.env.DGIS_CONTACTS_ALLOWED === "true" ? "доступ к контактам запрошен" : "контакты и URL могут отсутствовать без прав к items.contact_groups"}.`,
  async search(input) {
    if (dgisProvider.status() !== "READY") throw new HttpError(400, "Для 2ГИС настройте API-ключ и разрешение на хранение");
    const output = [];
    const phrases = searchPhrases(input.niches, input.query);
    let requests = 0;
    for (const { niche, term } of phrases) {
      for (let page = 1; page <= 5; page++) {
        if (uniqueRows(output).length >= input.limit || requests >= 12) return uniqueRows(output).slice(0, input.limit);
        requests++;
        const params = new URLSearchParams({
          key: process.env.DGIS_API_KEY,
          q: `${term} ${input.city}, ${input.region}`,
          type: "branch",
          locale: "ru_RU",
          page: String(page),
          page_size: "10", // Compatible with demo keys; max five pages in demo.
          fields: process.env.DGIS_CONTACTS_ALLOWED === "true"
            ? "items.rubrics,items.full_address_name,items.contact_groups"
            : "items.rubrics,items.full_address_name",
        });
        if (input.website === "found") params.set("has_site", "true");
        if (input.website === "not_found") params.set("has_site", "false");
        const response = await trustedApiRequest(`https://catalog.api.2gis.com/3.0/items?${params}`, {
          timeout: 18000, maxBytes: 3 * 1024 * 1024,
        });
        if (response.status === 401 || response.status === 403) throw new Error("2ГИС: нет доступа или неверный API-ключ / права полей");
        if (response.status === 429) throw new Error("2ГИС: исчерпан лимит API, попробуйте позднее");
        if (response.status !== 200) throw new Error(`2ГИС: HTTP ${response.status}`);
        const result = JSON.parse(response.body);
        if (result.meta?.code && result.meta.code !== 200) throw new Error(`2ГИС: код ответа ${result.meta.code}`);
        const items = result.result?.items || [];
        if (!Array.isArray(items)) throw new Error("2ГИС: неожиданный формат ответа");
        for (const item of items) {
          const row = map2gisItem(item, input, niche);
          if (row) {
            const parsed = companySchema.safeParse(row.data);
            if (parsed.success) output.push({ ...row, data: parsed.data });
          }
        }
        if (items.length < 10) break;
      }
    }
    return uniqueRows(output).slice(0, input.limit);
  },
};
