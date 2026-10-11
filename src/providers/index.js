import { osmProvider, niches, isPublicPilot } from "./osm.js";
import { dgisProvider } from "./2gis.js";
import { HttpError } from "../lib/errors.js";

// Order matters: paid map sources are first, OSM is the free fallback.
export const providers = [dgisProvider, osmProvider];
const autoProvider = {
  id: "auto",
  name: "Автопоиск (2ГИС → OSM)",
  status: () => providers.some(p => p.status() === "READY") ? "READY" : "NOT_CONFIGURED",
  note: () => "Поиск по доступным источникам в порядке приоритета. Если ключей нет, используется бесплатный OSM.",
  async search(input) {
    if (input.query && !providers.some(p => p.id !== "osm" && p.status() === "READY"))
      throw new HttpError(400, "Свободный запрос требует подключённого 2ГИС API с правом работы в CRM");
    const results = [];
    const errors = [];
    let used = 0;
    for (const p of providers.filter(p => p.status() === "READY")) {
      if (results.length >= input.limit) break;
      if (p.id === "osm" && input.query) continue;
      if (p.id === "osm" && isPublicPilot() && input.niches.length > 3) {
        errors.push("OSM: для публичного сервера выберите максимум 3 ниши");
        continue;
      }
      try {
        const rows = await p.search({ ...input, limit: p.id === "osm" && isPublicPilot() ? Math.min(50, input.limit - results.length) : input.limit - results.length });
        results.push(...rows);
        used++;
      } catch (e) {
        errors.push(`${p.name}: ${e.message}`);
      }
    }
    if (!used) throw new Error("Не удалось выполнить поиск: " + errors.join("; "));
    return results.slice(0, input.limit);
  },
};
export function getProvider(id) {
  const p = [autoProvider, ...providers].find(p => p.id === id);
  if (!p) throw new HttpError(400, "Неизвестный источник поиска");
  return p;
}
export function sourceStatus() {
  return [autoProvider, ...providers].map(p => ({
    id: p.id, name: p.name, status: p.status(), note: p.note(),
  }));
}
export { niches, nicheGroupsForUI } from "./niche-catalog.js";
