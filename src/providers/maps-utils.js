// Pure functions for map-provider normalization. No network calls or database access.
export { searchTerms, searchPhrases } from "./niche-catalog.js";
export const regionsByCity = {
  "Абакан": "Республика Хакасия",
  "Черногорск": "Республика Хакасия",
  "Саяногорск": "Республика Хакасия",
  "Минусинск": "Красноярский край",
  "Красноярск": "Красноярский край",
  "Новосибирск": "Новосибирская область",
  "Иркутск": "Иркутская область",
  "Кемерово": "Кемеровская область",
};

export function mapContacts(contactGroups) {
  const contacts = (Array.isArray(contactGroups) ? contactGroups : [])
    .flatMap(group => Array.isArray(group.contacts) ? group.contacts : []);
  let website = null;
  let phone = null;
  let email = null;
  for (const c of contacts) {
    const type = String(c.type || "").toLowerCase();
    const value = String(c.value || c.url || "").trim();
    if (!website && /^(website|site|web|url)$/.test(type) && /^(https?:\/\/)?[\w.-]+\.[a-zа-я]{2,}/iu.test(value))
      website = value;
    if (!phone && /^(phone|fax)$/.test(type) && value) phone = value;
    if (!email && /^(email|mail)$/.test(type) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) email = value;
  }
  return { website, phone, email };
}

export function map2gisItem(item, input, niche) {
  if (!item || !item.name || !item.id || item.type !== "branch") return null;
  const contact = mapContacts(item.contact_groups);
  const url = `https://2gis.ru/firm/${encodeURIComponent(String(item.id))}`;
  const data = {
    name: String(item.name).slice(0, 250),
    city: input.city,
    region: input.region,
    niche,
    address: String(item.address_name || item.full_address_name || "").slice(0, 500),
    website: contact.website,
    phone: contact.phone,
    email: contact.email,
    contactBasis: contact.phone || contact.email ? `Публичный контакт 2ГИС: ${url}` : "",
  };
  return { data, source: { provider: "2gis", externalId: String(item.id), sourceUrl: url,
    license: "2ГИС Places API: использование по подключённому договору" } };
}

export function mapYandexFeature(feature, input, niche) {
  const meta = feature?.properties?.CompanyMetaData;
  if (!meta?.id || !meta?.name) return null;
  const url = `https://yandex.ru/maps/org/${encodeURIComponent(String(meta.id))}/`;
  const website = meta.url || null;
  const phone = (Array.isArray(meta.Phones) ? meta.Phones : []).find(p => p.type === "phone")?.formatted || null;
  const data = {
    name: String(meta.name).slice(0, 250),
    city: input.city,
    region: input.region,
    niche,
    address: String(meta.address || "").slice(0, 500),
    website,
    phone,
    email: null,
    contactBasis: phone ? `Публичный деловой контакт Яндекс Карт: ${url}` : "",
  };
  return { data, source: { provider: "yandex", externalId: String(meta.id), sourceUrl: url,
    license: "Яндекс API Поиска организаций: только при наличии отдельного разрешения на хранение" } };
}

// Rows from multiple phrases of the same provider may repeat; de-duplicate before ingestion.
export function uniqueRows(rows) {
  const ids = new Set();
  return rows.filter(row => {
    const k = `${row.source.provider}:${row.source.externalId}`;
    if (ids.has(k)) return false;
    ids.add(k);
    return true;
  });
}
