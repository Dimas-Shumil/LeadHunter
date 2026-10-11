import test from "node:test";
import assert from "node:assert/strict";
import { map2gisItem, mapYandexFeature, uniqueRows, mapContacts, searchPhrases, regionsByCity } from "../src/providers/maps-utils.js";

const input = { city: "Абакан", region: "Республика Хакасия" };
test("2ГИС: корректно извлекаются сайт, телефон и источник", () => {
  const row = map2gisItem({ id: "70000001063199639", type: "branch", name: "Сервис 19", address_name: "Пушкина, 1", contact_groups: [
    { contacts: [ { type: "website", value: "https://servis19.example" }, { type: "phone", value: "+7 999 111-22-33" } ] }
  ] }, input, "Автодетейлинг");
  assert.equal(row.data.website, "https://servis19.example");
  assert.equal(row.data.phone, "+7 999 111-22-33");
  assert.equal(row.source.sourceUrl, "https://2gis.ru/firm/70000001063199639");
  assert.equal(row.source.provider, "2gis");
});
test("2ГИС: без доступа к контактам организация сохраняется без выдуманного сайта", () => {
  const row = map2gisItem({ id: "123", type: "branch", name: "Мастерская" }, input, "Автодетейлинг");
  assert.equal(row.data.website, null);
  assert.equal(row.data.phone, null);
  assert.equal(row.data.contactBasis, "");
});
test("Яндекс: берём только данные организации", () => {
  const row = mapYandexFeature({ properties: { CompanyMetaData: {id:"101", name:"Мебель 19", url:"https://mebel19.example", Phones:[{type:"phone",formatted:"+7 800 1234567"}] } } }, input, "Мебель на заказ");
  assert.equal(row.data.name, "Мебель 19");
  assert.equal(row.data.website, "https://mebel19.example");
  assert.equal(row.source.externalId, "101");
  assert.equal(mapYandexFeature({ properties: {} }, input, "Мебель на заказ"), null);
});
test("Дедупликация выдачи по источнику и ID", () => {
  const r = { source: { provider: "2gis", externalId: "42" }, data: {name:"A"} };
  assert.deepEqual(uniqueRows([r, r, { ...r, source: { provider: "yandex", externalId:"42"} }]).length, 2);
});
test("Города/ниши и типы контактов", () => {
  assert.equal(regionsByCity["Красноярск"], "Красноярский край");
  assert(searchPhrases(["Грузоперевозки"]).some(x=>x.term === "грузоперевозки"));
  assert.equal(mapContacts([{contacts:[{type:"email",value:"info@example.org"}]}]).email, "info@example.org");
});
