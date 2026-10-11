import * as cheerio from "cheerio";
import { safeRequest, UnsafeUrlError } from "./network.js";
import { inspectPhone } from "../services/phone.js";
export async function auditWebsite(website) {
  const metrics = {
    browser: { state: "NOT_RUN", reason: "AUDIT_BROWSER_ENABLED=false" },
    lighthouse: { state: "NOT_RUN" },
    checkedUrl: website,
  };
  const issues = [];
  const add = (code, label, severity = "minor") =>
    issues.push({ code, label, severity });
  try {
    const response = await safeRequest(website);
    Object.assign(metrics, {
      statusCode: response.status,
      finalUrl: response.url,
      redirects: response.redirects,
      https: response.url.startsWith("https://"),
    });
    if (response.status < 200 || response.status >= 400)
      return {
        status: "UNAVAILABLE",
        metrics,
        issues: [
          {
            code: "HTTP_ERROR",
            label: `HTTP ${response.status}`,
            severity: "major",
          },
        ],
      };
    if (!String(response.headers["content-type"] || "").includes("text/html"))
      return {
        status: "BLOCKED",
        metrics,
        issues: [
          {
            code: "NOT_HTML",
            label: "Ответ не является HTML",
            severity: "minor",
          },
        ],
      };
    const $ = cheerio.load(response.body);
    // Inspect only the organization's own site; never scrape directory contacts.
    const phoneMap = new Map();
    const collect = (html, page) => {
      const root = cheerio.load(html);
      const found = [];
      root('a[href^="tel:"], [itemprop="telephone"], meta[property="business:contact_data:phone_number"], [class*="phone"], [class*="tel"]').each((_index, node) => {
        const value = root(node).attr("href") || root(node).attr("content") || root(node).attr("data-phone") || root(node).text();
        if (value && value.length < 120) found.push(value);
      });
      root('script[type="application/ld+json"]').each((_index, node) => {
        if (found.length > 70) return;
        try {
          const value = JSON.parse(root(node).html() || "null");
          const walk = (x, depth=0) => {
            if (!x || depth > 5 || found.length > 70) return;
            if (Array.isArray(x)) return x.forEach(item => walk(item,depth+1));
            if (typeof x === "object") {
              if (typeof x.telephone === "string") found.push(x.telephone);
              for (const [key,v] of Object.entries(x)) if (key !== "telephone") walk(v,depth+1);
            }
          };
          walk(value);
        } catch { /* Ignore invalid third-party JSON-LD */ }
      });
      for (const raw of found) {
        const result = inspectPhone(raw);
        if (result.state === "format_ok" && !phoneMap.has(result.value)) phoneMap.set(result.value, page);
      }
      return root;
    };
    const root = collect(response.body, response.url);
    // At most one additional public contact page on the same hostname.
    // SafeRequest performs DNS pinning, redirect and private-IP checks.
    let contactHref = null;
    root('a[href]').each((_i, a) => {
      if (contactHref) return;
      if (!/контакт|связаться|contacts?|reach.us/i.test(root(a).text() + " " + (root(a).attr("href") || ""))) return;
      try {
        const u = new URL(root(a).attr("href"), response.url);
        if (u.hostname === new URL(response.url).hostname && u.href !== response.url && !u.hash && !/\.(?:pdf|jpg|png|zip)$/i.test(u.pathname)) contactHref = u.href;
      } catch {}
    });
    if (contactHref && phoneMap.size < 2) {
      try {
        const contact = await safeRequest(contactHref,{timeout:9000,maxBytes:500000,maxRedirects:2});
        if (new URL(contact.url).hostname === new URL(response.url).hostname && contact.status === 200 && String(contact.headers["content-type"] || "").includes("text/html")) collect(contact.body,contact.url);
      } catch { /* An unavailable contacts page must not fail the whole audit */ }
    }
    const websitePhones = [...phoneMap.keys()].slice(0, 10);
    Object.assign(metrics, {
      phoneCandidates: websitePhones,
      phoneSources: Object.fromEntries([...phoneMap.entries()].slice(0, 10)),
      phoneCheck: websitePhones.length ? "Контакты найдены на сайте компании; доступность номеров не проверялась" : "Контакты на проверенных страницах сайта не обнаружены",
      title: $("title").text().trim(),
      description: $('meta[name="description"]').attr("content")?.trim() || "",
      h1Count: $("h1").length,
      viewport: $('meta[name="viewport"]').attr("content") || "",
      forms: $("form").length,
      contactElements: $('a[href^="tel:"], a[href^="mailto:"]').length,
    });
    if (!metrics.https) add("NO_HTTPS", "Сайт работает без HTTPS", "major");
    if (!metrics.viewport.includes("width=device-width"))
      add("NO_VIEWPORT", "Нет корректного мобильного viewport", "major");
    if (!metrics.title) add("NO_TITLE", "Отсутствует title");
    if (!metrics.description) add("NO_DESCRIPTION", "Отсутствует description");
    if (!metrics.h1Count) add("NO_H1", "Не найден H1");
    if (!metrics.forms)
      add("NO_FORM", "HTML-форма не обнаружена; требуется ручная проверка");
    if (!metrics.contactElements)
      add(
        "NO_CONTACT_LINKS",
        "Ссылки tel/mailto не обнаружены; это не доказывает отсутствие контактов",
      );
    if (process.env.AUDIT_BROWSER_ENABLED === "true") {
      try {
        const { browserAudit } = await import("./browser.js");
        const browser = await browserAudit(response.url);
        metrics.browser = {
          state: "COMPLETED",
          overflow: browser.overflow,
          viewportWidth: 390,
        };
        metrics.lighthouse = browser.lighthouse;
        if (browser.overflow)
          add(
            "MOBILE_OVERFLOW",
            "Контент выходит за ширину мобильного экрана",
            "major",
          );
        if (browser.lighthouse.performance < 40)
          add("LOW_PERFORMANCE", "Lighthouse performance ниже 40", "major");
      } catch (e) {
        metrics.browser = {
          state: "FAILED",
          reason: String(e.message).slice(0, 250),
        };
        metrics.lighthouse = { state: "FAILED" };
      }
    }
    return {
      status:
        issues.filter((i) => i.severity === "major").length >= 2
          ? "ISSUES"
          : "AVAILABLE",
      metrics,
      issues,
    };
  } catch (e) {
    return {
      status: e instanceof UnsafeUrlError ? "BLOCKED" : "UNAVAILABLE",
      metrics: { ...metrics, error: String(e.message).slice(0, 250) },
      issues: [
        {
          code: e instanceof UnsafeUrlError ? "SSRF_BLOCK" : "FETCH_FAILED",
          label: String(e.message).slice(0, 250),
          severity: "major",
        },
      ],
    };
  }
}
