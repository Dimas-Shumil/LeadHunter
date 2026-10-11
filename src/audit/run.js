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
    const websitePhones = [...new Set($('a[href^="tel:"]').toArray()
      .map(node => inspectPhone($(node).attr("href")))
      .filter(value => value.state === "format_ok")
      .map(value => value.value))].slice(0, 10);
    Object.assign(metrics, {
      phoneCandidates: websitePhones,
      phoneCheck: websitePhones.length ? "Номера найдены в tel: ссылках сайта; доступность не проверялась" : "Нет пригодных tel: ссылок",
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
