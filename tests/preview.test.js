import test from "node:test";
import assert from "node:assert/strict";
import { preview2gis, findCityId } from "../src/providers/2gis-preview.js";
import { previewYandex } from "../src/providers/yandex-preview.js";
import { nicheGroups, searchTerms, searchPhrases } from "../src/providers/niche-catalog.js";

const validCity = { meta: { code: 200 }, result: { total: 1, items: [
  { id: '143', type: 'adm_div', subtype: 'city', name: 'Абакан', full_name: 'Республика Хакасия, Абакан' }
] } };
const validPlaces = { meta: { code: 200 }, result: { total: 112, items: [
  { type: 'branch', id: '123', name: 'Эвакуатор19', address_name: 'Пушкина, 5' },
  { type: 'branch', id: '124', name: 'Эвакуатор24', address_name: 'Пушкина, 7' }
] } };

test('expanded categories keep over 60 business niches with distinct names', () => {
  const names = nicheGroups.flatMap(g => g.items.map(x => x[0]));
  assert(names.length >= 60);
  assert.equal(new Set(names).size, names.length);
  assert(searchTerms['Эвакуаторы'].includes('эвакуатор'));
  assert(searchPhrases(['Эвакуаторы'], 'Эвакуатор19').some(x => x.term === 'Эвакуатор19'));
});

test('2GIS preview uses exact city_id, any website and correct page number; no persistence', async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.DGIS_API_KEY;
  const oldContact = process.env.DGIS_CONTACTS_ALLOWED;
  process.env.DGIS_API_KEY = 'test';
  process.env.DGIS_CONTACTS_ALLOWED = 'false';
  const urls = [];
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    urls.push(u);
    return new Response(JSON.stringify(u.searchParams.get('type') === 'adm_div.city' ? validCity : validPlaces), { status: 200 });
  };
  try {
    const d = await preview2gis({ city: 'Абакан', region: 'Республика Хакасия', query: 'Эвакуатор19', page: 2, website: 'any' });
    assert.equal(d.items[0].name, 'Эвакуатор19');
    assert.equal(d.items[0].website, null);
    assert.equal(d.storage, false);
    assert.equal(d.geoMode, 'city_id');
    assert.equal(urls.length, 2);
    assert.equal(urls[1].searchParams.get('q'), 'Эвакуатор19');
    assert.equal(urls[1].searchParams.get('city_id'), '143');
    assert.equal(urls[1].searchParams.get('page'), '2');
    assert.equal(urls[1].searchParams.get('has_site'), null);
    assert.equal(urls[1].searchParams.get('fields').includes('contact_groups'), false);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DGIS_API_KEY; else process.env.DGIS_API_KEY = oldKey;
    if (oldContact === undefined) delete process.env.DGIS_CONTACTS_ALLOWED; else process.env.DGIS_CONTACTS_ALLOWED = oldContact;
  }
});

test('2GIS preview website filter is only set when explicitly selected', async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.DGIS_API_KEY;
  process.env.DGIS_API_KEY = 'test';
  let searchURL;
  globalThis.fetch = async url => {
    const u = new URL(url);
    if (u.searchParams.get('type') !== 'adm_div.city') searchURL = u;
    return new Response(JSON.stringify(u.searchParams.get('type') === 'adm_div.city' ? validCity : validPlaces), { status: 200 });
  };
  try {
    await preview2gis({ city:'Абакан', region:'Хакасия', query:'эвакуатор', page:1, website:'found' });
    assert.equal(searchURL.searchParams.get('has_site'), 'true');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.DGIS_API_KEY; else process.env.DGIS_API_KEY = oldKey;
  }
});

test('Yandex preview sends page offset with business search, temporary result only', async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.YANDEX_MAPS_API_KEY;
  process.env.YANDEX_MAPS_API_KEY = 'test';
  let u;
  globalThis.fetch = async url => {
    u = new URL(url);
    return new Response(JSON.stringify({
      type:'FeatureCollection', properties:{ResponseMetaData:{SearchResponse:{found:46}}},
      features:[{properties:{CompanyMetaData:{id:'abc123', name:'Ремонт и сервис', address:'Абакан, ул. Ленина, 5', url:'https://example.com'}}}]
    }), {status:200});
  };
  try {
    const result = await previewYandex({city:'Абакан', region:'Хакасия', query:'эвакуатор', page:3, website:'any'});
    assert.equal(u.searchParams.get('skip'),'20');
    assert.equal(u.searchParams.get('results'),'10');
    assert.equal(u.searchParams.get('type'),'biz');
    assert.equal(result.total,46);
    assert.equal(result.items[0].website,'https://example.com');
    assert.equal(result.storage,false);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.YANDEX_MAPS_API_KEY; else process.env.YANDEX_MAPS_API_KEY = oldKey;
  }
});
