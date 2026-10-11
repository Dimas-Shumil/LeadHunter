import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import argon2 from "argon2";
// Never run integration tests against the main local data file.
import { sqliteUrl } from "../src/lib/sqlite-path.js";
if (!process.env.TEST_DATABASE_URL || !/^file:.*_test\.db$/i.test(process.env.TEST_DATABASE_URL))
  throw new Error("TEST_DATABASE_URL должен указывать на отдельный файл *_test.db");
if (sqliteUrl(process.env.TEST_DATABASE_URL) === sqliteUrl(process.env.DATABASE_URL || "file:./prisma/dev.db"))
  throw new Error("Тестовая база должна отличаться от рабочей");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = "test";
process.env.APP_ORIGIN = "http://localhost:3000";
const { app } = await import("../src/app.js");
const { db } = await import("../src/lib/db.js");
const { claimJob } = await import("../src/services/jobs.js");
const { executeJob } = await import("../src/services/execute-job.js");
const prefix = `Fixture-${Date.now()}`;
let ownerId, csrf, first, second;
const agent = request.agent(app);
const send = (method, path) =>
  agent[method](path)
    .set("Origin", "http://localhost:3000")
    .set("X-CSRF-Token", csrf || "");
const data = () => ({
  name: prefix,
  city: "Абакан",
  niche: "Грузоперевозки",
  address: "Тестовая улица 1",
});
test.before(async () => {
  const u = await db.user.create({
    data: {
      email: `${prefix.toLowerCase()}@example.test`,
      passwordHash: await argon2.hash("Fixture-password-only", {
        type: argon2.argon2id,
      }),
    },
  });
  ownerId = u.id;
});
test.after(async () => {
  await db.company.deleteMany({ where: { name: { startsWith: prefix } } });
  await db.job.deleteMany({ where: { id: { in: globalThis.testJobs || [] } } });
  if (ownerId) await db.user.delete({ where: { id: ownerId } });
  await db.$disconnect();
});
test("API защищён, Origin обязателен, login и HttpOnly cookie", async () => {
  assert.equal((await request(app).get("/api/companies")).status, 401);
  assert.equal(
    (await request(app).post("/api/auth/login").send({})).status,
    403,
  );
  const res = await agent
    .post("/api/auth/login")
    .set("Origin", "http://localhost:3000")
    .send({
      email: `${prefix.toLowerCase()}@example.test`,
      password: "Fixture-password-only",
    });
  assert.equal(res.status, 200);
  assert.match(res.headers["set-cookie"][0], /HttpOnly/);
  assert.match(res.headers["set-cookie"][0], /SameSite=Strict/);
  csrf = res.body.csrf;
});
test("CSRF защищает мутации", async () => {
  assert.equal(
    (
      await agent
        .post("/api/companies")
        .set("Origin", "http://localhost:3000")
        .send(data())
    ).status,
    403,
  );
});
test("Создание, дедупликация и фильтры", async () => {
  const r = await send("post", "/api/companies").send(data());
  assert.equal(r.status, 201, r.text);
  first = r.body.company.id;
  assert.equal(r.body.company.score, 0);
  const duplicate = await send("post", "/api/companies").send(data());
  assert.equal(duplicate.body.duplicate, true);
  assert.equal(duplicate.body.company.id, first);
  const list = await agent.get(`/api/companies?q=${prefix}&pageSize=1`);
  assert.equal(list.body.total, 1);
  assert.equal(list.body.items.length, 1);
});
test("CRM редактирование и контроль конкурентных изменений", async () => {
  const r = await send("put", `/api/companies/${first}`).send({
    revision: 0,
    data: {
      ...data(),
      crmStatus: "IN_PROGRESS",
      active: true,
      activeEvidence: "Тестовое подтверждение",
    },
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.body.score, 20);
  const conflict = await send("put", `/api/companies/${first}`).send({
    revision: 0,
    data: data(),
  });
  assert.equal(conflict.status, 409);
  const c = await agent.get(`/api/companies/${first}`);
  assert.equal(c.body.history[0].type, "EDITED");
});
test("Заметки и задачи сохраняются, завершение фиксируется", async () => {
  assert.equal(
    (
      await send("post", `/api/companies/${first}/notes`).send({
        text: "Тестовая заметка",
      })
    ).status,
    201,
  );
  const task = await send("post", `/api/companies/${first}/tasks`).send({
    title: "Тестовый звонок",
    dueAt: new Date().toISOString(),
  });
  assert.equal(task.status, 201);
  assert.equal(
    (await send("patch", `/api/tasks/${task.body.id}`).send({ done: true }))
      .status,
    200,
  );
});
test("Импорт реально обрабатывается очередью, ошибки строк видны", async () => {
  const csv = `название;город;ниша;адрес\n${prefix}-import;Абакан;Грузоперевозки;Тест 2\n;Абакан;Грузоперевозки;\n`;
  const result = await send("post", "/api/imports")
    .field("city", "Абакан")
    .field("contactBasis", "Тестовая собственная база")
    .field("license", "Только test fixture")
    .field("audit", "false")
    .attach("file", Buffer.from(csv), "test.csv");
  assert.equal(result.status, 202, result.text);
  globalThis.testJobs = [result.body.id];
  const job = await claimJob();
  assert.equal(job.id, result.body.id);
  await executeJob(job);
  const stored = await db.job.findUnique({ where: { id: job.id } });
  assert.equal(stored.status, "COMPLETED");
  assert.equal(stored.progress.new, 1);
  assert.equal(stored.progress.errors.length, 1);
});
test("SSRF audit: небезопасный URL блокируется в дочернем процессе", async () => {
  const r = await send("post", "/api/companies").send({
    ...data(),
    name: prefix + "-ssrf",
    website: "http://127.0.0.1",
  });
  assert.equal(r.status, 201);
  const audit = await send(
    "post",
    `/api/companies/${r.body.company.id}/audit`,
  ).send({});
  globalThis.testJobs.push(audit.body.id);
  const job = await claimJob();
  await executeJob(job);
  const c = await agent.get(`/api/companies/${r.body.company.id}`);
  assert.equal(c.body.websiteStatus, "BLOCKED");
  assert.equal(c.body.audits[0].issues[0].code, "SSRF_BLOCK");
  assert.equal(c.body.score, 0);
});
test("Разные ИНН не дедуплицируются автоматически; merge защищён", async () => {
  const a = await send("post", "/api/companies").send({
    ...data(),
    name: prefix + "-entity",
    inn: "1234567890",
  });
  const b = await send("post", "/api/companies").send({
    ...data(),
    name: prefix + "-entity",
    inn: "2234567890",
  });
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.equal(b.body.duplicate, false);
  assert.equal(
    (
      await send("post", `/api/companies/${a.body.company.id}/merge`).send({
        fromId: b.body.company.id,
        confirm: true,
      })
    ).status,
    409,
  );
});
test("Подтверждённое объединение переносит notes/sources/history", async () => {
  const r = await send("post", "/api/companies").send({
    ...data(),
    address: "Другое помещение",
  });
  assert.equal(r.status, 201);
  second = r.body.company.id;
  await send("post", `/api/companies/${second}/notes`).send({
    text: "Из второй карточки",
  });
  const result = await send("post", `/api/companies/${first}/merge`).send({
    fromId: second,
    confirm: true,
  });
  assert.equal(result.status, 200, result.text);
  assert.equal((await agent.get(`/api/companies/${second}`)).status, 404);
  const detail = await agent.get(`/api/companies/${first}`);
  assert.ok(detail.body.notes.some((n) => n.text === "Из второй карточки"));
  assert.ok(detail.body.history.some((h) => h.type === "MERGED"));
});
test("Экспорт, overview, sources и logout работают", async () => {
  const res = await agent.get(`/api/companies/export?q=${prefix}`);
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /text\/csv/);
  assert.match(res.text, /license/);
  assert.equal((await agent.get("/api/overview")).status, 200);
  assert.ok(
    ["READY", "NOT_CONFIGURED"].includes(
      (await agent.get("/api/settings")).body.sources.find((s) => s.id === "osm").status
    ),
  );
  assert.equal((await send("post", "/api/auth/logout").send({})).status, 200);
  assert.equal((await agent.get("/api/companies")).status, 401);
});
