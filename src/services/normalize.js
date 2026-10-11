import { createHash } from "node:crypto";
import { bad } from "../lib/errors.js";
export const normalizeName = (s) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export function normalizeUrl(value) {
  if (!value) return null;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    bad("Некорректный URL");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    bad("URL должен быть HTTP/HTTPS без пароля и нестандартного порта");
  url.hash = "";
  return url.href;
}
export function normalizeCompany(c) {
  const website = normalizeUrl(c.website);
  return {
    ...c,
    website,
    domain: website ? new URL(website).hostname.replace(/^www\./, "") : null,
    normalizedName: normalizeName(c.name),
    city: c.city.trim(),
    lastContactAt: c.lastContactAt ? new Date(c.lastContactAt) : null,
    phone: c.phone ? c.phone.replace(/[^+\d;]/g, "") : null,
  };
}
export const digest = (s) => createHash("sha256").update(s).digest("hex");
