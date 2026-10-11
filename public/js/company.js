import {
  api,
  esc,
  date,
  link,
  statuses,
  websiteStatuses,
  options,
  toast,
  inquiryStatuses,
  inquirySources,
} from "./api.js";
const modal = document.querySelector("#modal");
const labels = {
  name: "Название",
  city: "Город",
  region: "Регион",
  niche: "Ниша",
  address: "Адрес",
  website: "Веб-сайт",
  phone: "Деловой телефон",
  email: "Деловой email",
  inn: "ИНН",
  ogrn: "ОГРН",
  contactBasis: "Источник / основание хранения контактов",
  product: "Продукт ShumDev",
  negotiationResult: "Результат переговоров",
};
const evidenceLabels = {
  active: "Активность бизнеса",
  highTicket: "Высокий средний чек",
  automation: "Процессы для автоматизации",
  productFit: "Подходит продукт за 30 000 ₽",
  manualWebsiteNeed: "Ручная оценка потребности в платформе",
};
function fields(c) {
  return Object.entries(labels)
    .map(
      ([key, label]) =>
        `<label class="${["contactBasis", "negotiationResult"].includes(key) ? "form__wide" : ""}">${label}<input name="${key}" value="${esc(c[key])}" ${["name", "city", "niche"].includes(key) ? "required" : ""} maxlength="${key === "negotiationResult" ? 2000 : key === "contactBasis" ? 1000 : 500}"></label>`,
    )
    .join("");
}
const auditHtml = (c) =>
  c.audits?.length
    ? c.audits
        .slice(0, 3)
        .map(
          (a) =>
            `<div class="audit"><strong>${esc(websiteStatuses[a.status])}</strong> <small>${date(a.createdAt)}${a.website !== c.website ? " · предыдущий URL" : ""}</small><p>${link(a.metrics.finalUrl || a.website)} · HTTP ${esc(a.metrics.statusCode || "—")} · HTTPS ${a.metrics.https === true ? "да" : a.metrics.https === false ? "нет" : "не определено"}</p><p>Viewport: ${esc(a.metrics.viewport || "—")} · H1: ${esc(a.metrics.h1Count ?? "—")} · Формы: ${esc(a.metrics.forms ?? "—")}</p><p>Номера, обнаруженные на сайте: ${(a.metrics.phoneCandidates || []).length ? a.metrics.phoneCandidates.map(p => esc(p)).join(", ") : "не найдены"} (дозвон не проверялся)</p><p>Title: ${esc(a.metrics.title || "—")}<br>Description: ${esc(a.metrics.description || "—")}</p><p>Мобильная проверка: ${esc(a.metrics.browser?.state)} ${esc(a.metrics.browser?.reason || "")}<br>Lighthouse: ${a.metrics.lighthouse?.performance !== undefined ? esc(JSON.stringify(a.metrics.lighthouse)) : esc(a.metrics.lighthouse?.state || "не выполнен")}</p><ul>${a.issues.map((i) => `<li>${esc(i.label)}</li>`).join("")}</ul></div>`,
        )
        .join("")
    : "<p><small>Проверок пока нет.</small></p>";
export async function openCompany(id, onSaved) {
  const c = id
    ? await api(`/companies/${id}`)
    : {
        name: "",
        city: "Абакан",
        region: "Республика Хакасия",
        niche: "Грузоперевозки",
        crmStatus: "NEW",
        product: "Мини-платформа 30 000 ₽",
      };
  modal.innerHTML = `<div class="modal"><div class="modal__header"><div><small>КАРТОЧКА ОРГАНИЗАЦИИ</small><h2>${esc(c.name || "Новая компания")}</h2></div><button type="button" class="modal__close" id="close-modal" aria-label="Закрыть карточку">×</button></div><div class="modal__body"><div><form id="company-form" class="form"><div class="form__grid">${fields(c)}<label>CRM-статус<select name="crmStatus">${options(statuses, c.crmStatus)}</select></label><label>Последний контакт<input name="lastContactAt" type="datetime-local" value="${c.lastContactAt ? localInput(c.lastContactAt) : ""}"></label></div><label class="form__check"><input type="checkbox" name="noWebsiteConfirmed" ${c.noWebsiteConfirmed ? "checked" : ""}>Отсутствие сайта подтверждено вручную</label><small>Укажите основание ниже. Отсутствие URL в базе само по себе ничего не подтверждает.</small><details><summary>Квалификация и ручные оценки</summary>${Object.entries(
    evidenceLabels,
  )
    .map(
      ([key, label]) =>
        `<div class="evidence"><label>${label}<select name="${key}" aria-label="${esc(label)}">${options({ unknown: "Недостаточно данных", true: "Да, подтверждено", false: "Нет" }, c[key] === true ? "true" : c[key] === false ? "false" : "unknown")}</select></label><label>Основание оценки / ссылка на подтверждение<textarea name="${key === "manualWebsiteNeed" ? "manualWebsiteEvidence" : key + "Evidence"}" maxlength="1000">${esc(c[key === "manualWebsiteNeed" ? "manualWebsiteEvidence" : key + "Evidence"])}</textarea></label></div>`,
    )
    .join(
      "",
    )}</details><p class="error" id="company-error"></p><button type="submit">Сохранить компанию</button></form>${id ? `<hr><h3>Заметки</h3><form id="note-form" class="form"><label>Новая заметка<textarea name="text" required maxlength="4000"></textarea></label><button>Добавить заметку</button></form>${c.notes.map((n) => `<div class="note"><small>${date(n.createdAt)}</small><p>${esc(n.text)}</p></div>`).join("")}<h3>Заявки / обращения</h3><form id="inquiry-form" class="form"><label>Заголовок заявки<input name="title" required minlength="2" maxlength="200" placeholder="Например: Интерес к мини-платформе"></label><div class="form__grid"><label>Канал<select name="source">${options(inquirySources, "PHONE")}</select></label><label>Ожидаемая сумма, ₽<input name="amount" type="number" min="0" max="100000000" placeholder="30000"></label></div><label>Комментарий<textarea name="details" maxlength="4000" placeholder="Что обсуждали и что требуется"></textarea></label><button>Записать заявку</button></form>${(c.inquiries || []).map(i => `<div class="task inquiry"><div><strong>${esc(i.title)}</strong><div class="task__date">${date(i.createdAt)} · ${esc(inquirySources[i.source] || i.source)}${i.amount != null ? " · "+esc(i.amount)+" ₽" : ""}</div><small>${esc(i.details)}</small></div><select data-inquiry="${esc(i.id)}" aria-label="Статус заявки">${options(inquiryStatuses,i.status)}</select></div>`).join("")}<h3>Задачи</h3><form id="task-form" class="form"><label>Что сделать<input name="title" required maxlength="300"></label><label>Срок<input name="dueAt" type="datetime-local" required></label><button>Создать задачу</button></form>${c.tasks.map((t) => `<div class="task"><div><strong>${esc(t.title)}</strong><div class="task__date">${date(t.dueAt)}</div></div><button type="button" data-task="${esc(t.id)}" data-done="${t.done}">${t.done ? "Вернуть" : "Выполнить"}</button></div>`).join("")}` : ""}</div><aside>${id ? `<div class="panel"><h2>Lead Score · ${c.score}/100</h2>${c.scoreDetails.map((p) => `<div class="score-part"><strong>${esc(p.label)}<span>${p.points}/${p.max}</span></strong><p>${esc(p.state)} · ${esc(p.reason)}</p></div>`).join("")}</div><div class="panel"><div class="panel__header"><h2>Проверка сайта</h2><button id="audit-company" type="button" ${c.website ? "" : "disabled"}>Проверить</button></div>${auditHtml(c)}</div><div class="panel"><h2>Источники</h2>${c.sources.map((s) => `<p>${esc(s.provider)} · ${link(s.sourceUrl, "Первоисточник")}<br><small>${esc(s.license)} · ${date(s.updatedAt)}</small></p>`).join("")}</div>${duplicateHtml(c)}<div class="panel"><h2>История</h2>${c.history.map((h) => `<div class="history">${date(h.createdAt)} · ${esc({ CREATED: "Создана", EDITED: "Карточка изменена", AUDITED: "Сайт проверен", NOTE: "Добавлена заметка", MERGED: "Компании объединены", TASK_CREATED: "Задача создана", TASK_UPDATED: "Задача изменена", INQUIRY_CREATED: "Заявка создана", INQUIRY_UPDATED: "Статус заявки изменён" }[h.type] || h.type)}${h.type === "EDITED" ? `<br>${esc(h.details.fields?.join(", "))}` : ""}</div>`).join("")}</div>` : '<div class="notice">Добавьте известные сведения. Оценка появится после сохранения; неподтверждённые признаки не добавляют баллы.</div>'}</aside></div></div>`;
  modal.querySelector("#close-modal").onclick = () => modal.close();
  if (!modal.open) modal.showModal();
  modal.querySelector("#company-form").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget,
      f = Object.fromEntries(new FormData(form));
    for (const key of ["inn", "ogrn", "website", "phone", "email"])
      f[key] = f[key] || null;
    f.noWebsiteConfirmed = form.noWebsiteConfirmed.checked;
    f.lastContactAt = f.lastContactAt
      ? new Date(f.lastContactAt).toISOString()
      : null;
    for (const key of Object.keys(evidenceLabels))
      f[key] = f[key] === "unknown" ? null : f[key] === "true";
    try {
      const result = await api(id ? `/companies/${id}` : "/companies", {
        method: id ? "PUT" : "POST",
        data: id ? { data: f, revision: c.revision } : f,
      });
      toast(
        result.duplicate ? "Компания уже есть в базе" : "Компания сохранена",
      );
      await onSaved?.();
      await openCompany(id || result.company.id, onSaved);
    } catch (err) {
      modal.querySelector("#company-error").textContent = err.message;
    }
  };
  if (!id) return;
  modal.querySelector("#note-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api(`/companies/${id}/notes`, {
        method: "POST",
        data: Object.fromEntries(new FormData(e.currentTarget)),
      });
      await openCompany(id, onSaved);
    } catch (err) {
      toast(err.message);
    }
  };
  modal.querySelector("#inquiry-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const form = e.currentTarget;
      const data = Object.fromEntries(new FormData(form));
      data.amount = data.amount === "" ? null : Number(data.amount);
      await api(`/companies/${id}/inquiries`, { method: "POST", data });
      toast("Заявка добавлена");
      await onSaved?.();
      await openCompany(id, onSaved);
    } catch (err) { toast(err.message); }
  };
  modal.querySelectorAll("[data-inquiry]").forEach(el => el.onchange = async () => {
    try {
      await api(`/inquiries/${el.dataset.inquiry}`, { method: "PATCH", data: { status: el.value } });
      await onSaved?.();
      await openCompany(id, onSaved);
    } catch(err) { toast(err.message); }
  });
  modal.querySelector("#task-form").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const data = Object.fromEntries(new FormData(e.currentTarget));
      data.dueAt = new Date(data.dueAt).toISOString();
      await api(`/companies/${id}/tasks`, { method: "POST", data });
      await onSaved?.();
      await openCompany(id, onSaved);
    } catch (err) {
      toast(err.message);
    }
  };
  modal.querySelectorAll("[data-task]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          await api(`/tasks/${b.dataset.task}`, {
            method: "PATCH",
            data: { done: b.dataset.done !== "true" },
          });
          await onSaved?.();
          await openCompany(id, onSaved);
        } catch (err) {
          toast(err.message);
        }
      }),
  );
  modal.querySelector("#audit-company").onclick = async () => {
    try {
      await api(`/companies/${id}/audit`, { method: "POST" });
      toast(
        "Проверка поставлена в очередь. После завершения откройте карточку заново.",
      );
    } catch (err) {
      toast(err.message);
    }
  };
  modal
    .querySelectorAll("[data-merge]")
    .forEach(
      (b) =>
        (b.onclick = () => showMergeConfirmation(c, b.dataset.merge, onSaved)),
    );
}
function localInput(value) {
  const d = new Date(value);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
function duplicateHtml(c) {
  const matches = [
    ...(c.duplicates || []).map((d) => d.matched),
    ...(c.matchedDuplicates || []).map((d) => d.company),
  ];
  return matches.length
    ? `<div class="panel"><h2>Возможные дубликаты</h2>${matches.map((m) => `<p>${esc(m.name)} · ${esc(m.city)}</p><button type="button" data-merge="${esc(m.id)}">Объединить</button>`).join("")}</div>`
    : "";
}
function showMergeConfirmation(c, fromId, onSaved) {
  const old = modal.innerHTML;
  modal.innerHTML = `<div class="modal"><h2>Объединить карточки?</h2><p>Текущая карточка «${esc(c.name)}» останется основной. Заметки, задачи, проверки и источники второй карточки будут перенесены. Её поля сохранятся в истории объединения.</p><div class="actions"><button id="confirm-merge">Подтвердить объединение</button><button id="cancel-merge" class="button--secondary">Отмена</button></div></div>`;
  modal.querySelector("#cancel-merge").onclick = () =>
    openCompany(c.id, onSaved);
  modal.querySelector("#confirm-merge").onclick = async () => {
    try {
      await api(`/companies/${c.id}/merge`, {
        method: "POST",
        data: { fromId, confirm: true },
      });
      toast("Карточки объединены");
      await onSaved?.();
      await openCompany(c.id, onSaved);
    } catch (err) {
      toast(err.message);
      await openCompany(c.id, onSaved);
    }
  };
}
