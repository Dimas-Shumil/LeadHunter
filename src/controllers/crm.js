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
