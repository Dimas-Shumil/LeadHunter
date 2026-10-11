import { safeRequest } from "../audit/network.js";
import { buildOsmQuery } from "./osm-query.js";
import { companySchema } from "../validators/company.js";
import { HttpError } from "../lib/errors.js";
import { niches } from "./niche-catalog.js";
export { niches } from "./niche-catalog.js";
// Тестовый публичный сервер предназначен только для небольших запросов вручную.
// Массовый и плановый поиск требует собственного/договорного endpoint.
export const PUBLIC_OVERPASS_URL = "https://overpass-api.de/api/interpreter";
export function isPublicPilot(url = process.env.OVERPASS_URL) {
  try {
    return new URL(url).hostname === "overpass-api.de";
  } catch {
    return false;
  }
}
const keywords = {
  Эвакуаторы: /эвакуат|tow/i,
  Автодетейлинг: /детейл|detail/i,
  "Химчистка автомобилей": /химчист|clean/i,
  "Мебель на заказ": /заказ|custom|carpenter/i,
};
export { pilotBboxes } from "./osm-query.js";
export function buildQuery(input) {
  try {
    return buildOsmQuery(input, niches);
  } catch (error) {
    throw new HttpError(400, error.message);
  }
}
export function mapOsm(element, search) {
  const t = element.tags || {};
  const niche = search.niches.find(
    (n) =>
      (niches[n] || []).some((tag) => {
        const [k, v] = tag.split("=");
        return t[k] === v;
      }) &&
      (!keywords[n] ||
        keywords[n].test(
          [t.name, t.description, t.craft, t.service].filter(Boolean).join(" "),
        )),
  );
  if (!niche || !t.name) return null;
  const url = `https://www.openstreetmap.org/${element.type}/${element.id}`;
  const raw = {
    name: t.name,
    city: search.city,
    region: search.region,
    niche,
    address: [t["addr:street"], t["addr:housenumber"]]
      .filter(Boolean)
      .join(", "),
    website: t["contact:website"] || t.website || null,
    phone: t["contact:phone"] || t.phone || null,
    email: t["contact:email"] || t.email || null,
    contactBasis:
      t["contact:phone"] || t.phone || t["contact:email"] || t.email
        ? `Публичный деловой контакт из OSM: ${url}`
        : "",
  };
  const parsed = companySchema.safeParse(raw);
  return parsed.success
    ? {
        data: parsed.data,
        source: {
          provider: "osm",
          externalId: `${element.type}/${element.id}`,
          sourceUrl: url,
          license: "ODbL 1.0 — © OpenStreetMap contributors",
        },
      }
    : null;
}
export const osmProvider = {
  id: "osm",
  name: "OpenStreetMap / Overpass",
  status: () => (process.env.OVERPASS_URL ? "READY" : "NOT_CONFIGURED"),
  note: () => isPublicPilot()
    ? "Пробный ручной поиск без ключа: до 50 организаций и 3 ниш. Неполное покрытие. © OpenStreetMap contributors, ODbL 1.0. Для регулярного поиска нужен свой сервер или договорной источник."
    : "Поиск из собственного/договорного Overpass. Данные ODbL 1.0; неполное покрытие ниш.",
  async search(input) {
    if (!process.env.OVERPASS_URL)
      throw new HttpError(400, "Overpass endpoint не настроен в .env");
    if (!input.niches?.length || input.niches.some(n => !niches[n]?.length))
      throw new HttpError(400, "Для OSM выберите поддерживаемые категории; для остальных используйте 2ГИС или Яндекс");
    if (isPublicPilot() && (input.limit > 50 || input.niches.length > 3))
      throw new HttpError(400, "Для пробного публичного Overpass выберите до 50 компаний и 3 ниш. Для большего объёма нужен собственный endpoint.");
    const response = await safeRequest(process.env.OVERPASS_URL, {
      method: "POST",
      body: new URLSearchParams({ data: buildQuery(input) }).toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      timeout: 45000,
      maxBytes: 8 * 1024 * 1024,
    });
    if (response.status === 429 || response.status === 504)
      throw new Error(`Overpass перегружен или ограничил запрос (HTTP ${response.status}). Повторите позже либо используйте другой разрешённый источник.`);
    if (response.status !== 200)
      throw new Error(`Overpass: HTTP ${response.status}`);
    const data = JSON.parse(response.body);
    if (data.remark)
      throw new Error(`Overpass: ${String(data.remark).slice(0, 250)}`);
    return (data.elements || [])
      .map((e) => mapOsm(e, input))
      .filter(Boolean)
      .filter(
        (r) =>
          input.website === "any" ||
          (input.website === "found") === !!r.data.website,
      )
      .slice(0, input.limit);
  },
};
