import test from "node:test";
import assert from "node:assert/strict";
import { trustedApiRequest } from "../src/providers/trusted-api-request.js";

const oldFetch = globalThis.fetch;

test("trusted API request: official 2GIS endpoint works using Node fetch", async () => {
  globalThis.fetch = async url => {
    assert.equal(new URL(url).hostname, "catalog.api.2gis.com");
    return new Response(JSON.stringify({ meta: { code: 200 } }), { status: 200 });
  };
  try {
    const response = await trustedApiRequest("https://catalog.api.2gis.com/3.0/items?q=example");
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(response.body).meta.code, 200);
  } finally { globalThis.fetch = oldFetch; }
});

test("trusted API request: arbitrary URLs are rejected", async () => {
  await assert.rejects(trustedApiRequest("http://127.0.0.1/admin"), /Запрещённый/);
  await assert.rejects(trustedApiRequest("https://example.org/"), /Запрещённый/);
  await assert.rejects(trustedApiRequest("https://catalog.api.2gis.com.evil.example/"), /Запрещённый/);
});

test("trusted API request: unexpected redirects are blocked", async () => {
  globalThis.fetch = async () => new Response(null, { status: 302, headers: { location: "https://example.org" } });
  try {
    await assert.rejects(trustedApiRequest("https://catalog.api.2gis.com/3.0/items"), /перенаправление/);
  } finally { globalThis.fetch = oldFetch; }
});

test("trusted API request: oversized response is rejected", async () => {
  globalThis.fetch = async () => new Response("x".repeat(128), { status: 200 });
  try {
    await assert.rejects(trustedApiRequest("https://catalog.api.2gis.com/3.0/items", { maxBytes: 40 }), /лимит/);
  } finally { globalThis.fetch = oldFetch; }
});

test("OSM: Абакан uses a bounded query instead of nested Russia/region areas", async () => {
  const { buildOsmQuery } = await import("../src/providers/osm-query.js");
  const q = buildOsmQuery({ city: "Абакан", niches: ["Автосалоны и мотосалоны"], limit: 20 }, {
    "Автосалоны и мотосалоны": ["shop=car", "shop=motorcycle"],
  });
  assert.match(q, /nwr\["shop"="car"\]\[name\]\(53\.6,91\.24,53\.85,91\.61\)/);
  assert.match(q, /\[maxsize:134217728\]/);
  assert.doesNotMatch(q, /area\[|admin_level|ISO3166/);
});

test("OSM: query requires supported city and valid niche", async () => {
  const { buildOsmQuery } = await import("../src/providers/osm-query.js");
  assert.throws(() => buildOsmQuery({ city: "Другой город", niches: ["X"], limit: 10 }, {}), /не поддержан/);
  assert.throws(() => buildOsmQuery({ city: "Абакан", niches: ["X"], limit: 10 }, {}), /поддерживаемую нишу/);
});
