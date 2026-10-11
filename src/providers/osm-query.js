// Bounded pilot searches: city-level bounding boxes avoid costly nested
// Russia -> region -> city administrative-area traversal on public Overpass.
// [south, west, north, east] approximate, not official city boundaries.
export const pilotBboxes = {
  "Абакан": [53.60, 91.24, 53.85, 91.61],
  "Черногорск": [53.74, 91.17, 53.93, 91.42],
  "Саяногорск": [53.02, 91.31, 53.18, 91.59],
  "Минусинск": [53.62, 91.51, 53.80, 91.83],
  "Красноярск": [55.89, 92.57, 56.17, 93.24],
  "Новосибирск": [54.86, 82.72, 55.20, 83.22],
  "Иркутск": [52.18, 103.96, 52.41, 104.48],
  "Кемерово": [55.23, 85.86, 55.48, 86.32],
};
export function buildOsmQuery({ city, niches: selected, limit }, nicheTags) {
  const bbox = pilotBboxes[city];
  if (!bbox) throw new Error(`OSM: город «${city}» пока не поддержан для облегчённого поиска; используйте другой источник`);
  const q = JSON.stringify;
  const expressions = selected.flatMap(n => (nicheTags[n] || []).map(tag => {
    const [k, v] = tag.split("=");
    return `nwr[${q(k)}=${q(v)}][name](${bbox.join(",")});`;
  }));
  if (!expressions.length) throw new Error("Выберите поддерживаемую нишу");
  // No world-scale area traversal; memory ceiling is large enough for a small bbox.
  const sourceLimit = Math.min(350, Math.max(60, limit * 4));
  return `[out:json][timeout:25][maxsize:134217728];(${expressions.join("")});out tags ${sourceLimit};`;
}
