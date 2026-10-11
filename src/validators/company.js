import { z } from "zod";
export const statuses = [
  "NEW",
  "REVIEW",
  "QUALIFIED",
  "IN_PROGRESS",
  "DISCUSSION",
  "CLIENT",
  "REJECTED",
  "ARCHIVED",
];
const text = (n) => z.string().trim().max(n);
const optional = text(500).nullable().optional();
export const companySchema = z
  .object({
    name: text(250).min(1),
    city: text(120).min(1),
    region: text(150).default(""),
    niche: text(150).min(1),
    address: text(500).default(""),
    inn: z
      .string()
      .regex(/^(?:\d{10}|\d{12})$/)
      .nullable()
      .optional(),
    ogrn: z
      .string()
      .regex(/^(?:\d{13}|\d{15})$/)
      .nullable()
      .optional(),
    website: optional,
    phone: text(80).nullable().optional(),
    email: z.email().max(250).nullable().optional(),
    contactBasis: text(1000).default(""),
    noWebsiteConfirmed: z.boolean().default(false),
    active: z.boolean().nullable().default(null),
    activeEvidence: text(1000).default(""),
    highTicket: z.boolean().nullable().default(null),
    highTicketEvidence: text(1000).default(""),
    automation: z.boolean().nullable().default(null),
    automationEvidence: text(1000).default(""),
    productFit: z.boolean().nullable().default(null),
    productFitEvidence: text(1000).default(""),
    manualWebsiteNeed: z.boolean().nullable().default(null),
    manualWebsiteEvidence: text(1000).default(""),
    crmStatus: z.enum(statuses).default("NEW"),
    product: text(250).default("Мини-платформа 30 000 ₽"),
    negotiationResult: text(2000).default(""),
    lastContactAt: z.iso.datetime().nullable().optional(),
  })
  .superRefine((c, ctx) => {
    for (const key of [
      "active",
      "highTicket",
      "automation",
      "productFit",
      "manualWebsiteNeed",
    ])
      if (
        c[key] !== null &&
        !c[
          key === "manualWebsiteNeed"
            ? "manualWebsiteEvidence"
            : key + "Evidence"
        ]
      )
        ctx.addIssue({
          code: "custom",
          path: [
            key === "manualWebsiteNeed"
              ? "manualWebsiteEvidence"
              : key + "Evidence",
          ],
          message: "Укажите основание ручной оценки",
        });
    if (c.noWebsiteConfirmed && !c.manualWebsiteEvidence)
      ctx.addIssue({
        code: "custom",
        path: ["manualWebsiteEvidence"],
        message: "Укажите, как подтверждено отсутствие сайта",
      });
    if ((c.phone || c.email) && !c.contactBasis)
      ctx.addIssue({
        code: "custom",
        path: ["contactBasis"],
        message: "Укажите источник/основание хранения делового контакта",
      });
    if (c.website && c.noWebsiteConfirmed)
      ctx.addIssue({
        code: "custom",
        message: "У компании с URL нельзя подтвердить отсутствие сайта",
      });
  });
export const patchSchema = z.object({
  data: companySchema,
  revision: z.number().int().min(0),
});
