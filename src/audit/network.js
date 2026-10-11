import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import ipaddr from "ipaddr.js";
export class UnsafeUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}
export function isPublicIp(value) {
  try {
    const ip = ipaddr.process(value);
    if (ip.range() !== "unicast") return false;
    if (ip.kind() === "ipv6") {
      const blocked = [
        "2001:db8::/32",
        "2001::/32",
        "2002::/16",
        "64:ff9b::/96",
      ];
      return (
        ip.match(ipaddr.parse("2000::"), 3) &&
        !blocked.some((c) => ip.match(ipaddr.parseCIDR(c)))
      );
    }
    return ![
      "192.0.0.0/24",
      "192.0.2.0/24",
      "198.51.100.0/24",
      "203.0.113.0/24",
      "198.18.0.0/15",
    ].some((c) => ip.match(ipaddr.parseCIDR(c)));
  } catch {
    return false;
  }
}
export function validateUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeUrlError("Некорректный URL");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new UnsafeUrlError("Запрещённая схема, порт или credentials");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (
    !host ||
    host === "localhost" ||
    /\.(?:localhost|local|internal|test|invalid)$/i.test(host)
  )
    throw new UnsafeUrlError("Локальный домен запрещён");
  if (net.isIP(host) && !isPublicIp(host))
    throw new UnsafeUrlError("Непубличный IP запрещён");
  return url;
}
export async function resolvePublic(host, lookup = dns.lookup) {
  host = host.replace(/^\[|\]$/g, "");
  const records = net.isIP(host)
    ? [{ address: host, family: net.isIP(host) }]
    : await lookup(host, { all: true, verbatim: true });
  if (!records.length || records.some((r) => !isPublicIp(r.address)))
    throw new UnsafeUrlError(
      "DNS содержит приватный или зарезервированный адрес",
    );
  return records[0];
}
export async function safeRequest(
  input,
  {
    method = "GET",
    body,
    headers = {},
    timeout = 15000,
    maxBytes = 2 * 1024 * 1024,
    maxRedirects = 5,
  } = {},
) {
  let url = validateUrl(input);
  const redirects = [];
  for (let i = 0; i <= maxRedirects; i++) {
    const pinned = await resolvePublic(url.hostname);
    const result = await new Promise((resolve, reject) => {
      const req = (url.protocol === "https:" ? https : http).request(
        url,
        {
          method,
          headers: {
            "User-Agent": "ShumDevLeadHunter/0.1 (internal website audit)",
            Accept: "text/html,application/json;q=0.9",
            ...headers,
          },
          agent: false,
          lookup: (_host, opts, cb) =>
            opts.all
              ? cb(null, [pinned])
              : cb(null, pinned.address, pinned.family),
        },
        (res) => {
          if (
            [301, 302, 303, 307, 308].includes(res.statusCode) &&
            res.headers.location
          ) {
            res.destroy();
            resolve({ status: res.statusCode, headers: res.headers, body: "" });
            return;
          }
          if (Number(res.headers["content-length"] || 0) > maxBytes) {
            res.destroy(new Error("Ответ слишком большой"));
            return;
          }
          let size = 0;
          const chunks = [];
          res.on("data", (chunk) => {
            size += chunk.length;
            if (size > maxBytes)
              res.destroy(new Error("Ответ слишком большой"));
            else chunks.push(chunk);
          });
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: Buffer.concat(chunks).toString("utf8"),
              bodyBuffer: Buffer.concat(chunks),
            }),
          );
          res.on("error", reject);
        },
      );
      const timer = setTimeout(
        () => req.destroy(new Error("Истёк таймаут")),
        timeout,
      );
      req.on("close", () => clearTimeout(timer));
      req.on("error", reject);
      if (body) req.write(body);
      req.end();
    });
    if (
      [301, 302, 303, 307, 308].includes(result.status) &&
      result.headers.location
    ) {
      if (i === maxRedirects) throw new Error("Слишком много редиректов");
      url = validateUrl(new URL(result.headers.location, url).href);
      redirects.push(url.href);
      if (result.status === 303) {
        method = "GET";
        body = undefined;
      }
      continue;
    }
    return { ...result, url: url.href, redirects };
  }
  throw new Error("Redirect error");
}
