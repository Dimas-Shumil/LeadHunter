import { db } from "../lib/db.js";
import { writeTransaction } from "../lib/write-transaction.js";
import { normalizeCompany, normalizeName } from "./normalize.js";
import { scoreCompany } from "./scoring.js";
import { HttpError } from "../lib/errors.js";
export async function ingestCompany(
  data,
  source = { provider: "manual", sourceUrl: "", license: "" },
) {
  const c = normalizeCompany(data);
  return writeTransaction(async (tx) => {
    // A SQLite write transaction preserves deduplication across server and worker.
    const external = source.externalId
      ? await tx.companySource.findUnique({
          where: {
            provider_externalId: {
              provider: source.provider,
              externalId: source.externalId,
            },
          },
        })
      : null;
    const exact = external
      ? await tx.company.findUnique({ where: { id: external.companyId } })
      : await tx.company.findFirst({
          where: {
            OR: [
              ...(c.inn ? [{ inn: c.inn }] : []),
              ...(c.ogrn ? [{ ogrn: c.ogrn }] : []),
              {
                normalizedName: c.normalizedName,
                city: c.city,
                address: c.address,
                niche: c.niche,
                AND: [
                  { OR: [{ inn: null }, ...(c.inn ? [{ inn: c.inn }] : [])] },
                  {
                    OR: [{ ogrn: null }, ...(c.ogrn ? [{ ogrn: c.ogrn }] : [])],
                  },
                ],
              },
            ],
          },
        });
    if (exact) {
      if (
        (c.inn && exact.inn && c.inn !== exact.inn) ||
        (c.ogrn && exact.ogrn && c.ogrn !== exact.ogrn)
      )
        throw new HttpError(
          409,
          "Источник ссылается на конфликтующие ИНН/ОГРН",
        );
      // Fill missing contact fields from an authorized import. Never overwrite
      // manually maintained data; keep source provenance for later review.
      const additions = {
        ...(!exact.phone && c.phone && c.contactBasis ? { phone: c.phone, contactBasis: c.contactBasis } : {}),
        ...(!exact.email && c.email && c.contactBasis ? { email: c.email, contactBasis: c.contactBasis } : {}),
        ...(!exact.website && c.website ? { website: c.website, domain: c.domain, websiteStatus: "UNCHECKED" } : {}),
      };
      if (Object.keys(additions).length) {
        const updated = { ...exact, ...additions };
        const audit = updated.website ? await tx.websiteAudit.findFirst({
          where: { companyId: exact.id, website: updated.website },
          orderBy: { createdAt: "desc" },
        }) : null;
        await tx.company.update({ where: { id: exact.id }, data: {
          ...additions, ...scoreCompany(updated, audit), revision: { increment: 1 },
        } });
        await tx.activity.create({ data: {
          companyId: exact.id, type: "EDITED", details: {
            source: source.provider, fields: Object.keys(additions), reason: "ENRICHED_FROM_SOURCE",
          },
        } });
      }
      if (source.externalId) {
        await tx.companySource.upsert({
          where: {
            provider_externalId: {
              provider: source.provider,
              externalId: source.externalId,
            },
          },
          create: { ...source, companyId: exact.id },
          update: { updatedAt: new Date() },
        });
      } else
        await tx.companySource.create({
          data: { ...source, companyId: exact.id },
        });
      return { company: { ...exact, ...additions }, duplicate: true };
    }
    const candidates = await tx.company.findMany({
      where: {
        city: c.city,
        OR: [
          { normalizedName: c.normalizedName },
          ...(c.domain ? [{ domain: c.domain }] : []),
          ...(c.phone ? [{ phone: c.phone }] : []),
        ],
      },
      take: 20,
    });
    const company = await tx.company.create({
      data: {
        ...c,
        ...scoreCompany(c),
        websiteStatus: c.website ? "UNCHECKED" : "NOT_FOUND",
        sources: { create: source },
        history: {
          create: { type: "CREATED", details: { provider: source.provider } },
        },
      },
    });
    for (const match of candidates)
      await tx.duplicateCandidate.create({
        data: {
          companyId: company.id,
          matchedId: match.id,
          reason:
            "Совпадение названия, домена или телефона в городе; требуется подтверждение",
        },
      });
    return { company, duplicate: false, candidates: candidates.length };
  });
}
export async function editCompany(id, data, revision) {
  return db.$transaction(async (tx) => {
    const old = await tx.company.findUnique({
      where: { id },
      include: { audits: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!old) throw new HttpError(404, "Компания не найдена");
    const c = normalizeCompany(data);
    const siteChanged = c.website !== old.website;
    const result = await tx.company.updateMany({
      where: { id, revision },
      data: {
        ...c,
        ...scoreCompany(
          c,
          siteChanged ? null : old.audits.find((a) => a.website === c.website),
        ),
        ...(siteChanged
          ? { websiteStatus: c.website ? "UNCHECKED" : "NOT_FOUND" }
          : {}),
        revision: { increment: 1 },
      },
    });
    if (!result.count)
      throw new HttpError(409, "Карточка уже изменена. Откройте её заново");
    const fields = Object.keys(c).filter(
      (k) => String(c[k]) !== String(old[k]),
    );
    await tx.activity.create({
      data: {
        companyId: id,
        type: "EDITED",
        details: { fields, previousStatus: old.crmStatus, status: c.crmStatus },
      },
    });
    return tx.company.findUnique({ where: { id } });
  });
}
export function listQuery(q) {
  const where = {};
  if (q.q)
    where.OR = ["name", "city", "phone", "inn"].map((k) => ({
      [k]: { contains: String(q.q).slice(0, 200) },
    }));
  for (const key of ["city", "niche", "crmStatus", "websiteStatus"])
    if (q[key]) where[key] = q[key];
  if (q.minScore) where.score = { gte: Number(q.minScore) };
  const sort = ["name", "score", "createdAt", "updatedAt", "city"].includes(
    q.sort,
  )
    ? q.sort
    : "createdAt";
  return {
    where,
    orderBy: [
      { [sort]: q.direction === "asc" ? "asc" : "desc" },
      { id: "asc" },
    ],
  };
}
export async function mergeCompanies(targetId, fromId) {
  if (targetId === fromId) throw new HttpError(400, "Выберите разные компании");
  return writeTransaction(async (tx) => {
    const [target, from] = await Promise.all([
      tx.company.findUnique({ where: { id: targetId } }),
      tx.company.findUnique({ where: { id: fromId } }),
    ]);
    if (!target || !from) throw new HttpError(404, "Компания не найдена");
    if (
      (target.inn && from.inn && target.inn !== from.inn) ||
      (target.ogrn && from.ogrn && target.ogrn !== from.ogrn)
    )
      throw new HttpError(
        409,
        "Разные юридические идентификаторы: объединение запрещено",
      );
    for (const model of [
      "companySource",
      "websiteAudit",
      "note",
      "task",
      "activity",
    ])
      await tx[model].updateMany({
        where: { companyId: fromId },
        data: { companyId: targetId },
      });
    await tx.activity.create({
      data: {
        companyId: targetId,
        type: "MERGED",
        details: { fromId, snapshot: from },
      },
    });
    await tx.company.delete({ where: { id: fromId } });
    await tx.company.update({
      where: { id: targetId },
      data: {
        inn: target.inn || from.inn,
        ogrn: target.ogrn || from.ogrn,
        revision: { increment: 1 },
      },
    });
    return tx.company.findUnique({ where: { id: targetId } });
  });
}
