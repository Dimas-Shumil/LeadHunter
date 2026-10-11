import { z } from "zod";
import { db } from "../lib/db.js";
import { HttpError } from "../lib/errors.js";
export async function addNote(req, res) {
  const { text } = z
    .object({ text: z.string().trim().min(1).max(4000) })
    .parse(req.body);
  res.status(201).json(
    await db.$transaction(async (tx) => {
      const note = await tx.note.create({
        data: { companyId: req.params.id, text },
      });
      await tx.activity.create({
        data: {
          companyId: req.params.id,
          type: "NOTE",
          details: { noteId: note.id },
        },
      });
      return note;
    }),
  );
}
export async function addTask(req, res) {
  const input = z
    .object({
      title: z.string().trim().min(1).max(300),
      dueAt: z.iso.datetime(),
    })
    .parse(req.body);
  res.status(201).json(
    await db.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          companyId: req.params.id,
          title: input.title,
          dueAt: new Date(input.dueAt),
        },
      });
      await tx.activity.create({
        data: {
          companyId: req.params.id,
          type: "TASK_CREATED",
          details: { taskId: task.id, title: task.title },
        },
      });
      return task;
    }),
  );
}
export async function completeTask(req, res) {
  const input = z.object({ done: z.boolean() }).parse(req.body);
  const task = await db.task.findUnique({ where: { id: req.params.id } });
  if (!task) throw new HttpError(404, "Задача не найдена");
  res.json(
    await db.$transaction(async (tx) => {
      const result = await tx.task.update({
        where: { id: task.id },
        data: input,
      });
      await tx.activity.create({
        data: {
          companyId: task.companyId,
          type: "TASK_UPDATED",
          details: { taskId: task.id, done: input.done },
        },
      });
      return result;
    }),
  );
}
export async function tasks(req, res) {
  res.json(
    await db.task.findMany({
      where: { done: false },
      orderBy: { dueAt: "asc" },
      take: 100,
      include: {
        company: { select: { id: true, name: true, crmStatus: true } },
      },
    }),
  );
}

// A sales inquiry is a manually registered business request, not a directory result.
export const inquiryStatuses = ["NEW", "IN_PROGRESS", "WAITING", "WON", "LOST"];
export const inquirySources = ["PHONE", "TELEGRAM", "VK", "WHATSAPP", "EMAIL", "WEBSITE", "OTHER"];
const inquirySchema = z.object({
  title: z.string().trim().min(2).max(200),
  details: z.string().trim().max(4000).default(""),
  source: z.enum(inquirySources).default("OTHER"),
  status: z.enum(inquiryStatuses).default("NEW"),
  amount: z.number().int().min(0).max(100000000).nullable().default(null),
});
export async function createInquiry(req, res) {
  const input = inquirySchema.parse(req.body);
  const company = await db.company.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!company) throw new HttpError(404, "Организация не найдена");
  const result = await db.$transaction(async tx => {
    const created = await tx.inquiry.create({ data: { ...input, companyId: company.id } });
    await tx.activity.create({ data: { companyId: company.id, type: "INQUIRY_CREATED", details: { id: created.id, title: created.title, status: created.status } } });
    return created;
  });
  res.status(201).json(result);
}
export async function listInquiries(req, res) {
  const status = String(req.query.status || "");
  if (status && !inquiryStatuses.includes(status)) throw new HttpError(400, "Неизвестный статус заявки");
  res.json(await db.inquiry.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: 250,
    include: { company: { select: { id: true, name: true, city: true, phone: true } } },
  }));
}
export async function updateInquiry(req, res) {
  const patch = z.object({ status: z.enum(inquiryStatuses) }).parse(req.body);
  const inquiry = await db.inquiry.findUnique({ where: { id: req.params.id } });
  if (!inquiry) throw new HttpError(404, "Заявка не найдена");
  res.json(await db.$transaction(async tx => {
    const updated = await tx.inquiry.update({ where: { id: inquiry.id }, data: patch });
    await tx.activity.create({ data: { companyId: inquiry.companyId, type: "INQUIRY_UPDATED", details: { id: inquiry.id, from: inquiry.status, to: patch.status } } });
    return updated;
  }));
}

export async function createStandaloneTask(req, res) {
  const data = z.object({ companyId: z.string().min(1).max(100), title: z.string().trim().min(1).max(300), dueAt: z.iso.datetime() }).parse(req.body);
  const company = await db.company.findUnique({ where: { id: data.companyId }, select: { id: true } });
  if (!company) throw new HttpError(404, "Выбранная организация не найдена");
  req.params.id = company.id;
  req.body = { title: data.title, dueAt: data.dueAt };
  return addTask(req, res);
}
