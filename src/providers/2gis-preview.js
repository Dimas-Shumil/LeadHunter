import { trustedApiRequest } from "./trusted-api-request.js";
import { HttpError } from "../lib/errors.js";
import { mapContacts } from "./maps-utils.js";
import { inspectPhone } from "../services/phone.js";

// Temporary, non-persistent preview of the official Places API response.
// Never write the returned records to SQLite, files, logs, or caches.
const API = "https://catalog.api.2gis.com/3.0/items";
const CITY_LIMIT = 8;
const PAGE_SIZE = 10; // Demo API maximum
const MAX_DEMO_PAGE = 5;

function tidy(value) {
  return String(value || "").trim().toLocaleLowerCase("ru").replace(/\s+/g, " ");
}

async function request2gis(params) {
  const url = new URL(API);
  const key = process.env.DGIS_API_KEY;
  if (!key) throw new HttpError(400, "В .env отсутствует DGIS_API_KEY");
  url.search = new URLSearchParams({ key, locale: "ru_RU", ...params }).toString();
  let response;
  try {
    response = await trustedApiRequest(url.toString(), { timeout: 16000, maxBytes: 2 * 1024 * 1024 });
  } catch (e) {
    throw new HttpError(502, `2ГИС недоступен: ${e.message}`);
  }
  if ([401, 403].includes(response.status)) throw new HttpError(403, "2ГИС: ключ не принят или у него нет доступа к Places API");
  if (response.status === 429) throw new HttpError(429, "2ГИС: лимит API исчерпан");
  if (response.status !== 200) throw new HttpError(502, `2ГИС: HTTP ${response.status}`);
  let body;
  try { body = JSON.parse(response.body); } catch { throw new HttpError(502, "2ГИС: повреждённый JSON-ответ"); }
  if (body.meta?.code !== 200) {
    throw new HttpError(502, `2ГИС: код ${String(body.meta?.code || "неизвестен")}`);
  }
  if (!Array.isArray(body.result?.items)) throw new HttpError(502, "2ГИС: неверный формат результата");
  return body.result;
}

// Query city ID using the documented adm_div.city search.
// Returns null when a reliably matching city could not be found.
export async function findCityId(city, region) {
  const result = await request2gis({ q: city, type: "adm_div.city", page_size: String(CITY_LIMIT) });
  const matches = result.items.filter(x =>
    x.type === "adm_div" && x.subtype === "city" && tidy(x.name) === tidy(city)
  );
  if (!matches.length) return null;
  if (matches.length === 1) return String(matches[0].id);
  const selected = matches.find(x => tidy(x.full_name).includes(tidy(region)));
  return selected ? String(selected.id) : null;
}

export async function preview2gis({ city, region, query, page = 1, website = "any" }) {
  if (!process.env.DGIS_API_KEY) throw new HttpError(400, "Укажите DGIS_API_KEY в .env");
  if (!Number.isInteger(page) || page < 1 || page > MAX_DEMO_PAGE)
    throw new HttpError(400, `Для демо-ключа поддерживаются страницы 1–${MAX_DEMO_PAGE}`);
  const term = String(query || "").trim();
  if (term.length < 2 || term.length > 100) throw new HttpError(400, "Запрос должен содержать 2–100 символов");

  let cityId = null;
  let geoNote = "Город указан в поисковой фразе (строгое ограничение не подтверждено)";
  try {
    cityId = await findCityId(city, region);
  } catch (e) {
    geoNote = `Не удалось определить ID города: ${e.message}`;
  }
  const params = {
    type: "branch",
    q: cityId ? term : `${term} ${city}`,
    ...(cityId ? { city_id: cityId } : {}),
    page: String(page),
    page_size: String(PAGE_SIZE),
    fields: process.env.DGIS_CONTACTS_ALLOWED === "true"
      ? "items.rubrics,items.full_address_name,items.contact_groups"
      : "items.rubrics,items.full_address_name",
  };
  if (website === "found") params.has_site = "true";
  if (website === "not_found") params.has_site = "false";
  const result = await request2gis(params);
  const items = result.items.filter(x => x.type === "branch" && x.id && x.name).map(x => {
    const contacts = mapContacts(x.contact_groups);
    return {
      id: String(x.id),
      name: String(x.name).slice(0, 250),
      address: String(x.full_address_name || x.address_name || "").slice(0, 500),
      link: `https://2gis.ru/firm/${encodeURIComponent(String(x.id))}`,
      // Only exposed when key explicitly has items.contact_groups access.
      website: process.env.DGIS_CONTACTS_ALLOWED === "true" ? contacts.website : null,
      phone: process.env.DGIS_CONTACTS_ALLOWED === "true" ? inspectPhone(contacts.phone).value : null,
      phoneStatus: process.env.DGIS_CONTACTS_ALLOWED !== "true"
        ? "Нужно разрешение 2ГИС на items.contact_groups"
        : inspectPhone(contacts.phone).label,
    };
  });
  return {
    items, total: Number(result.total || 0), page,
    pageSize: PAGE_SIZE, maxPage: MAX_DEMO_PAGE,
    geoMode: cityId ? "city_id" : "text",
    geoNote: cityId ? "Результаты ограничены выбранным городом через city_id" : geoNote,
    query: term,
    websiteFilter: website,
    contactsAvailable: process.env.DGIS_CONTACTS_ALLOWED === "true",
    storage: false,
    disclaimer: "Предпросмотр ответа 2ГИС без сохранения организаций в SQLite. Контакты доступны только с отдельным разрешением API.",
  };
}
