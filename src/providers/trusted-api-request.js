/**
 * GET from a FIXED, developer-controlled HTTPS API endpoint.
 * This is only for predefined provider URLs; NEVER use for arbitrary URLs
 * supplied by a lead/website. Those must keep using audit/network.js SSRF guards.
 * HTTPS certificate verification remains enabled, redirects are disabled.
 */
const ALLOWED_ORIGINS = new Set([
  "https://catalog.api.2gis.com",
  "https://search-maps.yandex.ru",
]);

export async function trustedApiRequest(input, { timeout = 18000, maxBytes = 3 * 1024 * 1024 } = {}) {
  const url = new URL(input);
  if (!ALLOWED_ORIGINS.has(url.origin) || url.protocol !== "https:" || url.username || url.password || url.port)
    throw new Error("Запрещённый адрес внешнего API");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "ShumDevLeadHunter/0.3" },
    });
    if (response.status >= 300 && response.status < 400)
      throw new Error(`API вернул перенаправление (HTTP ${response.status})`);
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > maxBytes)
      throw new Error("Ответ API превышает лимит размера");

    const chunks = [];
    let total = 0;
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new Error("Ответ API превышает лимит размера");
        }
        chunks.push(Buffer.from(value));
      }
    }
    return { status: response.status, body: Buffer.concat(chunks).toString("utf8") };
  } catch (error) {
    if (controller.signal.aborted) throw new Error("Время ожидания ответа API истекло");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
