import { chromium } from "playwright";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";
import { createAuditProxy } from "./proxy.js";
export async function browserAudit(url) {
  if (process.getuid?.() === 0)
    throw new Error(
      "Аудит браузером запрещён от root: запустите worker непривилегированным пользователем",
    );
  const proxy = await createAuditProxy();
  let chrome, browser;
  try {
    chrome = await launch({
      chromePath: chromium.executablePath(),
      chromeFlags: [
        "--headless=new",
        `--proxy-server=http://127.0.0.1:${proxy.port}`,
        "--proxy-bypass-list=<-loopback>",
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
        "--disable-quic",
        "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
        "--disable-background-networking",
        "--disable-extensions",
      ],
      handleSIGINT: false,
    });
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${chrome.port}`);
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    await context.route("**/*", async (route) => {
      if (!/^https?:/.test(route.request().url())) return route.abort();
      if (route.request().method() !== "GET") return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(1200);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 2,
    );
    await context.close();
    const report = await lighthouse(url, {
      port: chrome.port,
      output: "json",
      logLevel: "error",
      onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      maxWaitForLoad: 20000,
      disableStorageReset: false,
    });
    const categories = report.lhr.categories;
    return {
      overflow,
      lighthouse: Object.fromEntries(
        Object.entries(categories).map(([k, v]) => [
          k,
          Math.round(v.score * 100),
        ]),
      ),
    };
  } finally {
    try {
      await browser?.close();
    } finally {
      await chrome?.kill();
      proxy.close();
    }
  }
}
