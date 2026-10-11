import { trustedApiRequest } from "./trusted-api-request.js";
import { HttpError } from "../lib/errors.js";
import { companySchema } from "../validators/company.js";
import { mapYandexFeature, searchPhrases, uniqueRows } from "./maps-utils.js";

export const yandexProvider = {
  id: "yandex",
  name: "Яндекс Карты — организации",
  status: () => !process.env.YANDEX_MAPS_API_KEY ? "NOT_CONFIGURED" :
    process.env.YANDEX_STORAGE_ALLOWED === "true" ? "READY" : "NEEDS_RIGHTS",
  note: () => !process.env.YANDEX_MAPS_API_KEY ?
    "Для поиска нужен YANDEX_MAPS_API_KEY; обычная лицензия запрещает долгосрочное хранение данных в CRM." :
    process.env.YANDEX_STORAGE_ALLOWED !== "true" ?
    "Ключ задан; сохранение в CRM отключено: нужны отдельные договорные права на накопление." :
    "Поставщик разрешён для записи только согласно вашей отдельной договорённости о хранении данных.",
  async search(input) {
    if (yandexProvider.status() !== "READY") throw new HttpError(400, "Яндекс: нет ключа или отдельного права на сохранение данных");
    const output = [];
    let requests = 0;
    for (const { niche, term } of searchPhrases(input.niches, input.query)) {
      for (let page = 0; page < 4; page++) {
        if (uniqueRows(output).length >= input.limit || requests >= 12) return uniqueRows(output).slice(0, input.limit);
        requests++;
        const params = new URLSearchParams({
          apikey: process.env.YANDEX_MAPS_API_KEY,
          text: `${term} ${input.city}, ${input.region}`,
          type: "biz",
          lang: "ru_RU",
          results: "25",
          skip: String(page * 25),
        });
        const response = await trustedApiRequest(`https://search-maps.yandex.ru/v1/?${params}`, {
          timeout: 18000, maxBytes: 3 * 1024 * 1024,
        });
        if (response.status === 401 || response.status === 403) throw new Error("Яндекс: неверный ключ или нет прав на API поиска");
        if (response.status === 429) throw new Error("Яндекс: лимит запросов исчерпан");
        if (response.status !== 200) throw new Error(`Яндекс: HTTP ${response.status}`);
        const result = JSON.parse(response.body);
        if (!Array.isArray(result.features)) throw new Error("Яндекс: неожиданный ответ API");
        for (const item of result.features) {
          const row = mapYandexFeature(item, input, niche);
          if (!row) continue;
          if (input.website === "found" && !row.data.website) continue;
          if (input.website === "not_found" && row.data.website) continue;
          const parsed = companySchema.safeParse(row.data);
          if (parsed.success) output.push({ ...row, data: parsed.data });
        }
        if (result.features.length < 25) break;
      }
    }
    return uniqueRows(output).slice(0, input.limit);
  },
};
