import test from "node:test";
import assert from "node:assert/strict";
import { nicheGroups, searchTerms, niches } from "../src/providers/niche-catalog.js";
import { inspectPhone } from "../src/services/phone.js";
import { previewYandex } from "../src/providers/yandex-preview.js";
import { preview2gis } from "../src/providers/2gis-preview.js";

const names = nicheGroups.flatMap(g => g.items.map(([name]) => name));
test("there are 120+ unique search niches including shawarma and fitness", () => {
  assert.ok(names.length >= 120);
  assert.equal(new Set(names).size, names.length);
  assert.ok(searchTerms["Шаурма и шаверма"].includes("шаурма"));
  assert.ok(searchTerms["Спортзалы и тренажёрные залы"].includes("спортзал"));
  assert.ok(niches["Спортзалы и тренажёрные залы"].length);
});
test("phone inspection validates format but never claims working line", () => {
  assert.deepEqual(inspectPhone("8 (999) 123-45-67").value, "+79991234567");
  assert.equal(inspectPhone("tel:+7 (999) 123-45-67").state, "format_ok");
  assert.equal(inspectPhone("123").state, "review");
  assert.equal(inspectPhone(null).state, "unavailable");
  assert.match(inspectPhone("+7 999 123 45 67").label, /не проверялась/);
});
test("Yandex preview surfaces catalog business phone without persistence", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.YANDEX_MAPS_API_KEY;
  process.env.YANDEX_MAPS_API_KEY = "fake-test-key";
  globalThis.fetch = async () => new Response(JSON.stringify({features:[{properties:{CompanyMetaData:{
    id:"123",name:"Зал",Phones:[{type:"phone",formatted:"+7 999 123-45-67"}]
  }}}],properties:{ResponseMetaData:{SearchResponse:{found:1}}}}), {status:200});
  try {
    const result = await previewYandex({city:"Абакан",region:"Хакасия",query:"спортзал"});
    assert.equal(result.items[0].phone,"+79991234567");
    assert.equal(result.storage,false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.YANDEX_MAPS_API_KEY; else process.env.YANDEX_MAPS_API_KEY = previousKey;
  }
});
test("2GIS does not leak contacts without explicit permission", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.DGIS_API_KEY;
  const previousContacts = process.env.DGIS_CONTACTS_ALLOWED;
  process.env.DGIS_API_KEY = "fake-test-key";
  process.env.DGIS_CONTACTS_ALLOWED = "false";
  globalThis.fetch = async (url) => new Response(JSON.stringify({meta:{code:200},result:{total:1,items:
    new URL(url).searchParams.get("type") === "adm_div.city" ? [] : [{type:"branch",id:"5",name:"Районная шаурма",contact_groups:[{contacts:[{type:"phone",value:"+79991234567"}]}]}]
  }}), {status:200});
  try {
    const result = await preview2gis({city:"Абакан",region:"Хакасия",query:"шаурма"});
    assert.equal(result.items[0].phone,null);
    assert.match(result.items[0].phoneStatus,/разрешение/);
    assert.equal(result.storage,false);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.DGIS_API_KEY; else process.env.DGIS_API_KEY = previousKey;
    if (previousContacts === undefined) delete process.env.DGIS_CONTACTS_ALLOWED; else process.env.DGIS_CONTACTS_ALLOWED = previousContacts;
  }
});
