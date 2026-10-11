import { trustedApiRequest } from "./trusted-api-request.js";
import { HttpError } from "../lib/errors.js";
import { inspectPhone } from "../services/phone.js";

const PAGE_SIZE = 10;
const MAX_PAGE = 5;
export async function previewYandex({ city, region, query, page = 1, website = "any" }) {
  if (!process.env.YANDEX_MAPS_API_KEY) throw new HttpError(400, "В .env отсутствует YANDEX_MAPS_API_KEY");
  if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) throw new HttpError(400, "Страница вне разрешённого диапазона");
  const params = new URLSearchParams({
    apikey: process.env.YANDEX_MAPS_API_KEY,
    text: `${query} ${city}, ${region}`,
    type: "biz", lang: "ru_RU", results: String(PAGE_SIZE), skip: String((page - 1) * PAGE_SIZE),
  });
  let response;
  try {
    response = await trustedApiRequest(`https://search-maps.yandex.ru/v1/?${params}`, { timeout: 16000 });
  } catch (e) {
    throw new HttpError(502, `Яндекс недоступен: ${e.message}`);
  }
  if ([401,403].includes(response.status)) throw new HttpError(403, "Яндекс: проверь ключ и подключение API Поиска по организациям");
  if (response.status === 429) throw new HttpError(429, "Яндекс: лимит запросов исчерпан");
  if (response.status !== 200) throw new HttpError(502, `Яндекс: HTTP ${response.status}`);
  let body;
  try { body = JSON.parse(response.body); } catch { throw new HttpError(502, "Яндекс: повреждённый JSON-ответ"); }
  if (!Array.isArray(body.features)) throw new HttpError(502, "Яндекс: неожиданный формат ответа");
  const rows = body.features.flatMap(feature => {
    const m = feature.properties?.CompanyMetaData;
    if (!m?.id || !m?.name) return [];
    // A missing website value is not proof a company has no website.
    if (website === "found" && !m.url) return [];
    if (website === "not_found" && m.url) return [];
    return [{
      id: String(m.id), name: String(m.name).slice(0,250),
      address: String(m.address || "").slice(0,500),
      link: `https://yandex.ru/maps/org/${encodeURIComponent(String(m.id))}/`,
      website: /^https?:\/\//i.test(m.url || "") ? String(m.url).slice(0,500) : null,
      phone: (Array.isArray(m.Phones) ? m.Phones : []).filter(p => p.type === "phone")
        .map(p => inspectPhone(p.formatted)).find(p => p.state === "format_ok")?.value || null,
      phoneStatus: (Array.isArray(m.Phones) ? m.Phones : []).some(p => p.type === "phone")
        ? "Телефон есть в каталоге, но формат не подтверждён" : "Не предоставлен Яндексом",
    }];
  });
  const found = Number(body.properties?.ResponseMetaData?.SearchResponse?.found);
  return {
    source: "yandex", items: rows,
    total: Number.isFinite(found) ? found : rows.length,
    page, pageSize: PAGE_SIZE, maxPage: MAX_PAGE,
    geoMode: "text", geoNote: "Город указан в запросе; Яндекс ранжирует результаты по релевантности, охват не гарантирован",
    query, websiteFilter: website, contactsAvailable: true,
    storage: false,
    disclaimer: "Временный просмотр ответа Яндекса без записи в CRM. Фильтр сайта основан только на возвращённом URL.",
  };
}
