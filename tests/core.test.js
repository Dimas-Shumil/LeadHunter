import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { companySchema } from "../src/validators/company.js";
import { normalizeCompany } from "../src/services/normalize.js";
import { scoreCompany } from "../src/services/scoring.js";
import { parseFile, csvCell } from "../src/services/imports.js";
import {
  validateUrl,
  isPublicIp,
  resolvePublic,
  safeRequest,
} from "../src/audit/network.js";
import { buildQuery, mapOsm } from "../src/providers/osm.js";
const basic = () =>
  companySchema.parse({
    name: "Тестовая компания",
    city: "Абакан",
    niche: "Грузоперевозки",
  });
test("Неизвестные признаки и отсутствие URL не создают баллы", () => {
  const c = basic();
  const s = scoreCompany(c);
  assert.equal(s.score, 0);
  assert.ok(s.scoreDetails.every((p) => p.state === "Недостаточно данных"));
});
test("Один метатег не даёт 25 баллов за потребность", () => {
  const c = basic();
  assert.equal(
    scoreCompany(c, { status: "AVAILABLE", issues: [{ severity: "minor" }] })
      .score,
    0,
  );
});
test("Два значимых дефекта + подтверждённые признаки дают 100", () => {
  const c = companySchema.parse({
    ...basic(),
    active: true,
    activeEvidence: "Работают сейчас: подтверждено владельцем",
    highTicket: true,
    highTicketEvidence: "Прайс: 50000 руб",
    automation: true,
    automationEvidence: "Приём заявок по телефону",
    productFit: true,
    productFitEvidence: "Каталог и заявки",
    phone: "+79000000000",
    contactBasis: "Опубликованный деловой контакт",
  });
  assert.equal(
    scoreCompany(c, {
      status: "ISSUES",
      issues: [{ severity: "major" }, { severity: "major" }],
    }).score,
    100,
  );
});
test("Недоступность не доказывает плохой сайт", () => {
  assert.equal(
    scoreCompany(basic(), {
      status: "UNAVAILABLE",
      issues: [{ severity: "major" }, { severity: "major" }],
    }).score,
    0,
  );
});
test("Ручная оценка имеет приоритет над автоматической", () => {
  const c = companySchema.parse({
    ...basic(),
    manualWebsiteNeed: false,
    manualWebsiteEvidence: "Проверено вручную",
  });
  assert.equal(
    scoreCompany(c, {
      status: "ISSUES",
      issues: [{ severity: "major" }, { severity: "major" }],
    }).score,
    0,
  );
});
test("Контакт и оценки требуют основания", () => {
  assert.equal(
    companySchema.safeParse({ ...basic(), phone: "79000000000" }).success,
    false,
  );
  assert.equal(
    companySchema.safeParse({ ...basic(), active: true }).success,
    false,
  );
  assert.equal(
    companySchema.safeParse({ ...basic(), noWebsiteConfirmed: true }).success,
    false,
  );
});
test("Нормализация домена, имени и телефона", () => {
  const c = normalizeCompany({
    ...basic(),
    name: " ООО «Ёлка» ",
    website: "www.example.org",
    phone: "+7 (900) 000-00-00",
  });
  assert.equal(c.normalizedName, "ооо елка");
  assert.equal(c.domain, "example.org");
  assert.equal(c.phone, "+79000000000");
});
test("SSRF: private, metadata, encoded loopback, IPv6, reserved", () => {
  for (const u of [
    "http://localhost",
    "http://127.0.0.1",
    "http://2130706433",
    "http://0x7f000001",
    "http://[::1]",
    "http://[::ffff:127.0.0.1]",
    "http://169.254.169.254",
    "http://192.168.1.2",
    "http://100.64.0.1",
    "http://[2001:db8::1]",
    "file:///etc/passwd",
    "https://example.org:8443",
    "https://user:pass@example.org",
  ])
    assert.throws(() => validateUrl(u), u);
  assert.equal(isPublicIp("8.8.8.8"), true);
  assert.equal(isPublicIp("2606:4700:4700::1111"), true);
});
test("DNS: блокируются смешанные публичные/приватные ответы", async () => {
  await assert.rejects(
    resolvePublic("example.org", async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]),
  );
  assert.equal(
    (
      await resolvePublic("example.org", async () => [
        { address: "8.8.8.8", family: 4 },
      ])
    ).address,
    "8.8.8.8",
  );
});
test("safeRequest не посылает запрос в локальную сеть", async () => {
  await assert.rejects(safeRequest("http://127.0.0.1"));
});
test("CSV: кириллица, кавычки, invalid rows", async () => {
  const c =
    'название;город;ниша;сайт;телефон\n"ООО; Тест";Абакан;Грузоперевозки;example.org;79000000000\n;Абакан;Грузоперевозки;;\n';
  const parsed = await parseFile(Buffer.from(c), "test.csv", {
    contactBasis: "Собственная тестовая база",
  });
  assert.equal(parsed.valid.length, 1);
  assert.equal(parsed.valid[0].data.name, "ООО; Тест");
  assert.equal(parsed.errors.length, 1);
  assert.equal(parsed.errors[0].row, 3);
});
test("XLSX: числовой ИНН и строки, формулы не исполняются", async () => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Test");
  sheet.addRow(["название", "город", "ниша", "инн"]);
  sheet.addRow(["Тест", "Абакан", "Грузоперевозки", 1234567890]);
  const result = await parseFile(
    Buffer.from(await wb.xlsx.writeBuffer()),
    "test.xlsx",
    {},
  );
  assert.equal(result.valid[0].data.inn, "1234567890");
});
test("CSV export нейтрализует формулы и переносы", () => {
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
  assert.equal(csvCell("  =1+1"), '"\'  =1+1"');
  assert.equal(csvCell("+7900"), '"\'+7900"');
  assert.equal(csvCell("обычный текст"), '"обычный текст"');
});
test("OSM: запрос только RU, регион/город, без инъекции", () => {
  const q = buildQuery({
    region: "Республика Хакасия",
    city: 'Абакан";out;',
    niches: ["Грузоперевозки"],
    limit: 50,
  });
  assert.ok(q.includes('"ISO3166-1"="RU"'));
  assert.ok(q.includes('Абакан\\";out;'));
});
test("OSM: первоисточник/лицензия сохранены, активность не придумана", () => {
  const result = mapOsm(
    { type: "node", id: 123, tags: { name: "Fixture", office: "logistics" } },
    {
      region: "Республика Хакасия",
      city: "Абакан",
      niches: ["Грузоперевозки"],
    },
  );
  assert.equal(result.source.externalId, "node/123");
  assert.equal(result.data.active, null);
  assert.equal(result.data.website, null);
  assert.match(result.source.license, /ODbL/);
});
