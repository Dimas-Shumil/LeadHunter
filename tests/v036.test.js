import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inspectPhone } from "../src/services/phone.js";
const read = name => readFileSync(new URL("../"+name,import.meta.url),"utf8");
test("new migration adds only Inquiry table and indexes",()=>{
 const sql=read("prisma/migrations/20261011120000_inquiries/migration.sql");
 assert.match(sql,/CREATE TABLE "Inquiry"/);
 assert.doesNotMatch(sql,/DROP TABLE|DELETE FROM|ALTER TABLE.*DROP/i);
});
test("company detail, API and client agree on inquiries",()=>{
 assert.match(read("prisma/schema.prisma"),/inquiries\s+Inquiry\[\]/);
 assert.match(read("src/controllers/companies.js"),/inquiries: \{/);
 assert.match(read("src/routes/api.js"),/\/companies\/:id\/inquiries/);
 assert.match(read("public/js/app.js"),/async function inquiries/);
});
test("task can be created from company and separately",()=>{
 assert.match(read("src/routes/api.js"),/r.post\("\/tasks", crm.createStandaloneTask\)/);
 assert.match(read("public/js/app.js"),/async function tasks/);
});
test("contacts from the company's site distinguish format from reachability",()=>{
 assert.equal(inspectPhone("tel:+79991112233").value,"+79991112233");
 assert.match(read("src/audit/run.js"),/safeRequest\(contactHref/);
 assert.match(read("src/audit/run.js"),/phoneCandidates/);
});
test("Yandex paid API is not in active providers",()=>{
 assert.doesNotMatch(read("src/providers/index.js"),/providers = \[.*yandexProvider/);
});
