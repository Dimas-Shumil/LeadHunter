export function scoreCompany(c, audit) {
  const parts = [];
  const add = (key, label, max, known, yes, reason) =>
    parts.push({
      key,
      label,
      max,
      points: known && yes ? max : 0,
      state: known
        ? yes
          ? "Подтверждено"
          : "Не подходит"
        : "Недостаточно данных",
      reason,
    });
  const serious = (audit?.issues || []).filter((i) => i.severity === "major");
  const auditKnown = !!audit && ["AVAILABLE", "ISSUES"].includes(audit.status);
  const siteKnown =
    c.noWebsiteConfirmed || c.manualWebsiteNeed !== null || auditKnown;
  const need =
    c.noWebsiteConfirmed ||
    c.manualWebsiteNeed === true ||
    (c.manualWebsiteNeed === null && serious.length >= 2);
  add(
    "website",
    "Потребность в веб-платформе",
    25,
    siteKnown,
    need,
    c.noWebsiteConfirmed
      ? c.manualWebsiteEvidence
      : c.manualWebsiteNeed !== null
        ? c.manualWebsiteEvidence
        : auditKnown
          ? `${serious.length} значимых технических проблем`
          : c.website
            ? "Проверка ещё не завершена"
            : "URL не найден в источнике; отсутствие сайта не подтверждено",
  );
  for (const [key, label, max] of [
    ["active", "Активность бизнеса", 20],
    ["highTicket", "Высокий средний чек", 20],
    ["automation", "Процессы для автоматизации", 15],
    ["productFit", "Подходит типовой продукт", 10],
  ])
    add(
      key,
      label,
      max,
      c[key] !== null && !!c[key + "Evidence"],
      c[key] === true,
      c[key + "Evidence"] || "Нужна квалификация",
    );
  add(
    "contact",
    "Деловой контакт",
    10,
    !!((c.phone || c.email) && c.contactBasis),
    true,
    c.contactBasis || "Нет подтверждённого делового контакта",
  );
  return {
    score: parts.reduce((s, p) => s + p.points, 0),
    scoreDetails: parts,
  };
}
