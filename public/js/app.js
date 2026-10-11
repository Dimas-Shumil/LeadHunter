import {
  api,
  setCsrf,
  esc,
  date,
  statuses,
  websiteStatuses,
  jobStatuses,
  options,
  toast,
  link,
} from "./api.js";
import { openCompany } from "./company.js";
const app = document.querySelector("#app");
let owner,
  settings,
  timer,
  routeVersion = 0,
  filters = { page: 1, pageSize: 25 },
  crmFilter = "";
window.addEventListener("session-expired", () => {
  clearInterval(timer);
  document.querySelector("#modal").close();
  login();
});
window.addEventListener("hashchange", () =>
  render().catch((e) => toast(e.message)),
);
const headings = {
  overview: [
    "Обзор",
    "Рабочее пространство для поиска и квалификации клиентов",
  ],
  search: [
    "Поиск организаций",
    "Ищите клиентов автоматически через 2ГИС, Яндекс и OpenStreetMap",
  ],
  companies: [
    "База клиентов",
    "Проверяйте организации, оценивайте потенциал и сохраняйте контакты",
  ],
  crm: ["CRM", "Ведите переговоры и планируйте следующие действия"],
  settings: [
    "Настройки и источники",
    "Подключения, правила оценки и возможности приложения",
  ],
};
async function start() {
  try {
    owner = await api("/auth/me");
    setCsrf(owner.csrf);
    settings = await api("/settings");
    await render();
  } catch {
    login();
  }
}
function login() {
  clearInterval(timer);
  owner = null;
  app.innerHTML = `<main class="login"><section class="login__card"><div class="login__brand">ShumDev</div><small>LEAD HUNTER</small><h1>Войти в приложение</h1><p>Внутренняя система поиска клиентов</p><form id="login-form" class="form"><label>Email<input name="email" type="email" autocomplete="username" required></label><label>Пароль<input name="password" type="password" autocomplete="current-password" required></label><p id="login-error" class="error"></p><button>Войти</button></form><small>Владелец создаётся командой npm run owner:create.</small></section></main>`;
  document.querySelector("#login-form").onsubmit = async (e) => {
    e.preventDefault();
    const button = e.currentTarget.querySelector("button");
    button.disabled = true;
    try {
      owner = await api("/auth/login", {
        method: "POST",
        data: Object.fromEntries(new FormData(e.currentTarget)),
      });
      setCsrf(owner.csrf);
      settings = await api("/settings");
      await render();
    } catch (err) {
      document.querySelector("#login-error").textContent = err.message;
      button.disabled = false;
    }
  };
}
async function render() {
  if (!owner) return;
  clearInterval(timer);
  const version = ++routeVersion;
  let route = location.hash.slice(1) || "overview";
  if (!headings[route]) route = "overview";
  const [title, subtitle] = headings[route];
  app.innerHTML = `<div class="shell"><aside class="sidebar"><div class="sidebar__brand">ShumDev</div><p class="sidebar__tag">Lead Hunter</p><nav class="sidebar__nav" aria-label="Главная навигация">${Object.entries(
    headings,
  )
    .map(
      ([key, [name]]) =>
        `<a class="sidebar__link ${route === key ? "sidebar__link--active" : ""}" href="#${key}">${esc(name)}</a>`,
    )
    .join(
      "",
    )}</nav><div class="sidebar__footer">${esc(owner.email)}<p>Внутренняя система<br>Продукт 30 000 ₽</p></div></aside><main class="main"><div class="topbar"><span><span class="topbar__dot"></span>Рабочее пространство</span><div class="actions"><small>${esc(owner.email)}</small><button id="logout" class="button--secondary">Выйти</button></div></div><div class="page-heading"><div><h1>${title}</h1><p>${subtitle}</p></div><div id="page-actions" class="actions"></div></div><div id="content"><div class="panel">Загрузка…</div></div></main></div>`;
  document.querySelector("#logout").onclick = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
      login();
    } catch (e) {
      toast(e.message);
    }
  };
  try {
    await { overview, search, companies, crm, settings: settingsPage }[route](
      version,
    );
  } catch (e) {
    if (version === routeVersion)
      document.querySelector("#content").innerHTML =
        `<div class="notice error">${esc(e.message)}</div>`;
  }
}
const content = () => document.querySelector("#content");
const empty = (title, text, action = "") =>
  `<div class="empty"><h3>${title}</h3><p>${text}</p>${action}</div>`;
const stat = (label, value, detail) =>
  `<div class="stat"><div class="stat__label">${label}</div><div class="stat__value">${value}</div><div class="stat__detail">${detail}</div></div>`;
async function overview(version) {
  const data = await api("/overview");
  if (version !== routeVersion) return;
  content().innerHTML = `<div class="stats">${stat("Организаций в базе", data.total, "Импорт и разрешённые источники")}${stat("Высокий приоритет", data.high, "Lead Score от 75 баллов")}${stat("Ожидают квалификации", data.needsReview, "Новые и на проверке")}${stat("Стали клиентами", data.clients, "Результат работы CRM")}</div><div class="grid"><section class="panel"><div class="panel__header"><h2>Следующие действия</h2><span class="badge ${data.overdue ? "badge--danger" : ""}">${data.overdue} просрочено</span></div><div id="overview-tasks"></div></section><section class="panel"><h2>Работа с базой</h2><p>Ищите компании, проверяйте сайты и подтверждайте признаки перспективного клиента.</p><div class="actions"><a class="button" href="#search">Найти организации</a><a class="button button--secondary" href="#companies">Открыть базу</a></div><div class="notice">Отсутствие сайта в источнике требует ручной проверки. Оценка строится на известных фактах.</div></section></div><section class="panel"><div class="panel__header"><h2>Последние задания</h2><a href="#search">Все задания</a></div><div id="jobs"></div></section>`;
  await renderTasks("#overview-tasks");
  await refreshJobs();
  timer = setInterval(() => refreshJobs().catch(() => {}), 5000);
}
function table(items) {
  return `<div class="table-wrap"><table class="table"><thead><tr><th>Компания / город</th><th>Ниша</th><th>Сайт</th><th>Оценка</th><th>Контакт</th><th>CRM</th><th>Источник / дата</th></tr></thead><tbody>${items.map((c) => `<tr><td><button class="table__name" data-company="${esc(c.id)}">${esc(c.name)}</button><br><small>${esc(c.city)}</small></td><td>${esc(c.niche)}</td><td>${c.website ? link(c.website, c.domain || "Открыть сайт") : "—"}<br><span class="badge ${c.websiteStatus === "ISSUES" ? "badge--warning" : c.websiteStatus === "UNAVAILABLE" ? "badge--danger" : "badge--muted"}">${esc(websiteStatuses[c.websiteStatus])}</span></td><td><span class="score ${c.score >= 75 ? "score--high" : ""}">${c.score}/100</span></td><td>${esc(c.phone || c.email || "—")}</td><td><span class="badge">${esc(statuses[c.crmStatus])}</span></td><td>${esc(c.sources?.[0]?.provider || "—")}<br><small>${date(c.createdAt)}</small></td></tr>`).join("")}</tbody></table></div>`;
}
function wireCompanies(scope = document) {
  scope
    .querySelectorAll("[data-company]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          openCompany(b.dataset.company, () => render()).catch((e) =>
            toast(e.message),
          )),
    );
}
function queryParams() {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== "" && v !== undefined) params.set(k, v);
  });
  return params;
}
async function companies(version) {
  document.querySelector("#page-actions").innerHTML =
    '<button id="add-company">Добавить компанию</button>';
  document.querySelector("#add-company").onclick = () =>
    openCompany(null, () => render()).catch((e) => toast(e.message));
  content().innerHTML = `<section class="panel"><form id="filter-form" class="filters"><label>Поиск<input name="q" value="${esc(filters.q)}" placeholder="Название, ИНН или телефон"></label><label>Город<input name="city" value="${esc(filters.city)}" placeholder="Все города"></label><label>CRM<select name="crmStatus">${options(statuses, filters.crmStatus, "Все статусы")}</select></label><label>Сайт<select name="websiteStatus">${options(websiteStatuses, filters.websiteStatus, "Все состояния")}</select></label><label>Ниша<select name="niche">${options(Object.fromEntries(settings.niches.map((n) => [n, n])), filters.niche, "Все ниши")}</select></label><label>Минимальный Score<input type="number" name="minScore" value="${esc(filters.minScore)}" min="0" max="100"></label><label>Сортировка<select name="sort">${options({ createdAt: "Дата обнаружения", score: "Lead Score", name: "Название", city: "Город" }, filters.sort || "createdAt")}</select></label><label>Порядок<select name="direction">${options({ desc: "По убыванию", asc: "По возрастанию" }, filters.direction || "desc")}</select></label><button>Применить</button><button type="button" id="reset-filters" class="button--secondary">Сбросить</button></form><div id="company-list"></div></section>`;
  document.querySelector("#filter-form").onsubmit = (e) => {
    e.preventDefault();
    filters = {
      ...Object.fromEntries(new FormData(e.currentTarget)),
      page: 1,
      pageSize: 25,
    };
    render().catch((e) => toast(e.message));
  };
  document.querySelector("#reset-filters").onclick = () => {
    filters = { page: 1, pageSize: 25 };
    render();
  };
  const data = await api("/companies?" + queryParams());
  if (version !== routeVersion) return;
  document.querySelector("#company-list").innerHTML =
    (data.items.length
      ? table(data.items)
      : empty(
          "Компаний пока нет",
          "Добавьте компанию вручную или загрузите базу из CSV/XLSX.",
          '<a class="button" href="#search">Импортировать базу</a>',
        )) +
    `<div class="pagination"><span>${data.total} организаций · страница ${data.page} из ${Math.max(1, Math.ceil(data.total / data.pageSize))}</span><div class="actions"><a class="button button--secondary" href="/api/companies/export?${esc(queryParams())}">Экспорт CSV</a><button id="prev-page" ${data.page === 1 ? "disabled" : ""}>Назад</button><button id="next-page" ${data.page * data.pageSize >= data.total ? "disabled" : ""}>Далее</button></div></div>`;
  document.querySelector("#prev-page").onclick = () => {
    filters.page--;
    render();
  };
  document.querySelector("#next-page").onclick = () => {
    filters.page++;
    render();
  };
  wireCompanies();
}
async function search() {
  const ready = settings.sources.filter((s) => s.status === "READY");
  const dgisEnabled = settings.sources.some((s) => s.id === "2gis" && s.status !== "NOT_CONFIGURED");
  const yandexEnabled = settings.sources.some((s) => s.id === "yandex" && s.status !== "NOT_CONFIGURED");
  const dgisCanSave = settings.sources.some(s => s.id === "2gis" && s.status === "READY");
  const yandexCanSave = settings.sources.some(s => s.id === "yandex" && s.status === "READY");
  const groups = settings.nicheGroups || [{ name: "Все направления", items: settings.niches.map(name => ({ name, osm: true })) }];
  const groupedCheckboxes = groups.map((group, index) => `
    <details class="niche-group" ${index === 0 ? "open" : ""}>
      <summary>${esc(group.name)} <small>(${group.items.length})</small></summary>
      <div class="niche-group__grid">
        ${group.items.map(item => `<label class="form__check niche-item" data-label="${esc(item.name.toLocaleLowerCase("ru"))}">
          <input type="checkbox" name="niche" value="${esc(item.name)}" data-osm="${item.osm ? "yes" : "no"}">
          <span>${esc(item.name)}${item.osm ? "" : ' <small title="Для этой категории нет надёжного OSM-тега">· 2ГИС/Яндекс</small>'}</span>
        </label>`).join("")}
      </div>
    </details>`).join("");

  content().innerHTML = `<div class="grid search-grid"><section class="panel"><h2>Автоматический поиск клиентов</h2>
    <div class="notice">Сначала проверь выдачу 2ГИС по точному названию или услуге. Обычный поиск сохраняет записи только из источников, для которых разрешён импорт. OpenStreetMap не гарантирует полного охвата организаций.</div>
    <form id="search-form" class="form">
      <div class="form__grid">
        <label>Регион<input name="region" value="Республика Хакасия" required list="regions"><datalist id="regions"><option>Республика Хакасия</option><option>Красноярский край</option><option>Новосибирская область</option><option>Иркутская область</option></datalist></label>
        <label>Город<input name="city" value="Абакан" required list="cities"><datalist id="cities">${["Абакан", "Черногорск", "Саяногорск", "Минусинск", "Красноярск", "Новосибирск", "Иркутск", "Кемерово"].map(c => `<option>${c}</option>`).join("")}</datalist></label>
        <label>Источник для импорта<select name="provider">${ready.length ? options(Object.fromEntries(ready.map(s => [s.id,s.name]))) : '<option value="">Нет разрешённых источников</option>'}</select></label>
        <label>Сайт в справочнике<select name="website">${options({ any: "Любой (проверка полноты)", not_found: "Сайт не указан", found: "Сайт отмечен" }, "any")}</select></label>
        <label>Максимум результатов<input name="limit" type="number" min="1" max="200" value="30" required></label>
        <label>Название компании или произвольный запрос<input name="query" maxlength="100" placeholder="Например: Эвакуатор19 или эвакуатор"></label>
      </div>
      <div class="niche-catalog">
        <div class="niche-catalog__heading"><strong>Направления бизнеса (${settings.niches.length})</strong><span id="selected-count">Выбрано: 0</span></div>
        <input id="niche-filter" type="search" placeholder="Найти нишу: ремонт, грузоперевозки, мебель…" aria-label="Фильтрация направлений">
        ${groupedCheckboxes}
      </div>
      <label class="form__check"><input type="checkbox" name="audit">Проверять известные сайты после импорта/разрешённого сохранения (долго)</label>
      <div class="search-actions">
        <button type="button" id="preview-2gis" ${dgisEnabled ? "" : "disabled"}>Посмотреть 2ГИС</button><button type="button" id="preview-yandex" class="button--secondary" ${yandexEnabled ? "" : "disabled"}>Посмотреть Яндекс</button>
        <button type="submit" class="button--secondary" ${ready.length ? "" : "disabled"}>Запустить импорт в CRM</button>
      </div>
      <label class="form__check"><input type="checkbox" name="savePreview" id="save-preview">Автоматически сохранять показанную страницу в CRM (только при разрешённом хранении)</label>
      <small>Автосохранение доступно для 2ГИС: ${dgisCanSave ? "разрешено настройками" : "нет подтверждённых прав"}; Яндекс: ${yandexCanSave ? "разрешено настройками" : "нет прав"}. При отсутствии прав работает только временный просмотр.</small>
      <small>${dgisEnabled ? "Предпросмотр не требует воркера. Для поиска по имени достаточно одной фразы. Если выбрано несколько ниш, предпросмотр использует первую." : "Добавь DGIS_API_KEY или YANDEX_MAPS_API_KEY в .env и перезапусти сервер для предпросмотра."}</small>
      <small>При выборе «Сайт не указан» компании с сайтом, например «Эвакуатор19», будут исключены. Для проверки полноты ставь «Любой».</small>
    </form></section>
    <section class="panel"><h2>Импорт CSV / XLSX</h2><p><small>До 5 МБ и 5000 строк. CSV в UTF-8.</small></p>
      <form id="import-form" class="form"><label>Файл<input type="file" name="file" accept=".csv,.xlsx" required></label><label>Город по умолчанию<input name="city" placeholder="Если не указан в файле" required></label><label>Ниша по умолчанию<select name="niche">${options(Object.fromEntries(settings.niches.map(n => [n,n])))}</select></label><label>Источник и основание хранения контактов<textarea name="contactBasis" required minlength="5" maxlength="1000" placeholder="Например: собственная база; разрешённые деловые контакты"></textarea></label><label>Разрешение на использование базы<textarea name="license" required minlength="5" maxlength="1000" placeholder="Условия лицензии, договора или описание собственной базы"></textarea></label><label class="form__check"><input type="checkbox" name="audit">Проверить сайты</label><button>Импортировать</button></form><p><a href="/import-template.csv" download>Скачать шаблон CSV</a></p></section>
    </div>
    <section class="panel" id="preview-panel"><div class="panel__header"><h2 id="preview-heading">Выдача каталогов — просмотр и разрешённый импорт</h2><span id="preview-count" class="badge">Нет запроса</span></div><div id="preview-results"><p>Нажми «Посмотреть 2ГИС» или «Посмотреть Яндекс». При наличии прав можно включить сохранение в CRM.</p></div><div class="pagination" id="preview-pagination" hidden><span id="preview-page"></span><div class="actions"><button type="button" class="button--secondary" id="preview-prev">Назад</button><button type="button" id="preview-next">Следующая страница</button></div></div></section>
    <section class="panel"><div class="panel__header"><h2>Фоновые задания</h2><button id="refresh-jobs" class="button--secondary">Обновить</button></div><div id="jobs"></div></section>`;

  const form = document.querySelector("#search-form");
  const presetRegions = { Абакан: "Республика Хакасия", Черногорск: "Республика Хакасия", Саяногорск: "Республика Хакасия", Минусинск: "Красноярский край", Красноярск: "Красноярский край", Новосибирск: "Новосибирская область", Иркутск: "Иркутская область", Кемерово: "Кемеровская область" };
  form.elements.city.addEventListener("change", e => {
    if (presetRegions[e.target.value.trim()]) form.elements.region.value = presetRegions[e.target.value.trim()];
  });
  const chosen = () => [...form.querySelectorAll('input[name="niche"]:checked')];
  const refreshCount = () => document.querySelector("#selected-count").textContent = `Выбрано: ${chosen().length}`;
  form.querySelectorAll('input[name="niche"]').forEach(cb => cb.addEventListener("change", refreshCount));
  document.querySelector("#niche-filter").addEventListener("input", e => {
    const q = e.target.value.trim().toLocaleLowerCase("ru");
    document.querySelectorAll(".niche-group").forEach(group => {
      let visible = 0;
      group.querySelectorAll(".niche-item").forEach(item => {
        const matched = item.dataset.label.includes(q);
        item.hidden = !matched;
        if (matched) visible++;
      });
      group.hidden = visible === 0;
      if (q && visible) group.open = true;
    });
  });

  form.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const selected = chosen();
    const provider = fd.get("provider");
    const query = String(fd.get("query") || "").trim();
    if (!selected.length && !query) return toast("Выбери нишу или введи поисковую фразу");
    if (selected.length > 12) return toast("Для одного задания выбери не более 12 ниш");
    if (provider === "osm" && (query || selected.some(el => el.dataset.osm !== "yes")))
      return toast("OSM принимает только поддерживаемые категории. Для свободного запроса используй просмотр 2ГИС");
    const data = { region: fd.get("region"), city: fd.get("city"), provider, website: fd.get("website"), niches: selected.map(el => el.value), query, limit: Number(fd.get("limit")), audit: form.elements.audit.checked };
    try {
      await api("/search", { method: "POST", data });
      toast("Поиск поставлен в очередь");
      await refreshJobs();
    } catch (err) { toast(err.message); }
  };

  let previewQuery = null;
  async function preview(page = 1, source = "2gis") {
    const fd = new FormData(form);
    if (page === 1 || !previewQuery) {
      const chosenItems = chosen();
      const free = String(fd.get("query") || "").trim();
      if (!free && !chosenItems.length) return toast("Укажи название компании, услугу или выбери нишу");
      previewQuery = { city: fd.get("city"), region: fd.get("region"), query: free, niche: chosenItems[0]?.value || "", website: fd.get("website"), source };
    }
    const buttons = [document.querySelector("#preview-2gis"), document.querySelector("#preview-yandex")];
    buttons.forEach(b => b.disabled = true);
    document.querySelector("#preview-results").innerHTML = "<p>Получаем организации из каталога…</p>";
    try {
      const saveRequested = form.elements.savePreview.checked;
      const canSave = previewQuery.source === "2gis" ? dgisCanSave : yandexCanSave;
      if (saveRequested && !canSave) return toast("Для выбранного источника нет прав на сохранение. Сними галочку или получи разрешение на хранение.");
      const data = await api("/search/preview", { method: "POST", data: { ...previewQuery, page, save: saveRequested, audit: saveRequested && form.elements.audit.checked } });
      document.querySelector("#preview-heading").textContent = `Выдача ${previewQuery.source === "2gis" ? "2ГИС" : "Яндекса"} — ${data.saved ? "сохранено в CRM" : "предпросмотр"}`;
      document.querySelector("#preview-count").textContent = `${data.total} в выдаче · показано ${data.items.length}`;
      if (data.saved) toast(`CRM: новых ${data.saved.new}, дубликатов ${data.saved.duplicates}, проверок ${data.saved.auditsQueued}, ошибок ${data.saved.errors}`);
      document.querySelector("#preview-results").innerHTML = `
        <div class="notice">${esc(data.geoNote)}. ${esc(data.disclaimer)} ${data.websiteFilter !== "any" ? "Фильтр сайта может исключать искомую компанию." : ""}</div>
        ${data.items.length ? `<div class="preview-list">${data.items.map(c => `<div class="preview-item"><div><strong>${esc(c.name)}</strong><small>${esc(c.address || "Адрес не предоставлен")}</small></div><div><a href="${esc(c.link)}" target="_blank" rel="noopener noreferrer">Открыть карточку</a>${c.website ? `<br>${link(c.website, "Сайт")}` : ""}${c.phone ? `<br><small>☎ ${esc(c.phone)} · формат проверен, дозвон не выполнялся</small>` : `<br><small>Телефон: ${esc(c.phoneStatus || "не предоставлен")}</small>`}</div></div>`).join("")}</div>` : '<p>На этой странице совпадений нет. Попробуй «Любой сайт», другие формулировки или страницу 1.</p>'}
        ${previewQuery.source === "2gis" && !data.contactsAvailable ? '<small>Сайты и телефоны не возвращаются без разрешения 2ГИС на items.contact_groups. Их отсутствие в выдаче не означает отсутствие у компании.</small>' : ""}`;
      document.querySelector("#preview-pagination").hidden = !data.items.length;
      document.querySelector("#preview-page").textContent = `Страница ${page} / ${Math.min(data.maxPage, Math.max(1, Math.ceil(data.total / data.pageSize)))}`;
      document.querySelector("#preview-prev").disabled = page <= 1;
      document.querySelector("#preview-next").disabled = page >= data.maxPage || page * data.pageSize >= data.total || !data.items.length;
      document.querySelector("#preview-prev").onclick = () => preview(page - 1);
      document.querySelector("#preview-next").onclick = () => preview(page + 1);
    } catch (err) {
      document.querySelector("#preview-count").textContent = "Ошибка";
      document.querySelector("#preview-results").innerHTML = `<p class="error">${esc(err.message)}</p>`;
      document.querySelector("#preview-pagination").hidden = true;
    } finally { buttons[0].disabled = !dgisEnabled; buttons[1].disabled = !yandexEnabled; }
  }
  document.querySelector("#preview-2gis").onclick = () => preview(1, "2gis");
  document.querySelector("#preview-yandex").onclick = () => preview(1, "yandex");
  document.querySelector("#import-form").onsubmit = async e => {
    e.preventDefault();
    const importForm = e.currentTarget;
    const fd = new FormData(importForm);
    fd.set("audit", String(importForm.elements.audit.checked));
    const button = importForm.querySelector("button");
    button.disabled = true;
    try { await api("/imports", { method: "POST", data: fd }); toast("Импорт поставлен в очередь"); await refreshJobs(); }
    catch(err) { toast(err.message); }
    finally { button.disabled = false; }
  };
  document.querySelector("#refresh-jobs").onclick = () => refreshJobs().catch(e => toast(e.message));
  await refreshJobs();
  timer = setInterval(() => refreshJobs().catch(() => {}), 5000);
}
async function refreshJobs() {
  const element = document.querySelector("#jobs");
  if (!element) return;
  const data = await api("/jobs");
  if (!element.isConnected) return;
  element.innerHTML = data.length
    ? data
        .map(
          (j) =>
            `<div class="job"><div class="job__head"><strong>${esc({ SEARCH: "Поиск организаций", IMPORT: "Импорт базы", AUDIT: "Проверка сайта" }[j.type] || j.type)}</strong><span class="badge ${j.status === "FAILED" ? "badge--danger" : "badge--muted"}">${esc(jobStatuses[j.status])}${j.cancelRequested && j.status === "RUNNING" ? " · останавливается" : ""}</span></div><small>${date(j.createdAt)}</small><div class="job__counts">Найдено: ${j.progress.found || 0} · новых: ${j.progress.new || 0} · дубликатов: ${j.progress.duplicates || 0} · проверено: ${j.progress.checked || 0} · ошибок обработки: ${j.progress.failed || 0}</div>${j.error ? `<p class="error">${esc(j.error)}</p>` : ""}${j.progress.errors?.length ? `<details><summary>Ошибки строк / проверки (${j.progress.errors.length})</summary>${j.progress.errors.map((x) => `<p>${esc(x.row ? `Строка ${x.row}` : x.company)}: ${esc(x.error)}</p>`).join("")}</details>` : ""}${["QUEUED", "RUNNING"].includes(j.status) ? `<button data-cancel="${esc(j.id)}" class="button--secondary">Остановить</button>` : ""}</div>`,
        )
        .join("")
    : empty("Заданий пока нет", "Запустите поиск, импорт или проверку сайта.");
  element.querySelectorAll("[data-cancel]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          await api(`/jobs/${b.dataset.cancel}/cancel`, { method: "POST" });
          await refreshJobs();
        } catch (e) {
          toast(e.message);
        }
      }),
  );
}
async function renderTasks(selector) {
  const tasks = await api("/tasks");
  const target = document.querySelector(selector);
  if (!target) return;
  target.innerHTML = tasks.length
    ? tasks
        .map(
          (t) =>
            `<div class="task ${new Date(t.dueAt) < new Date() ? "task--overdue" : ""}"><div><strong>${esc(t.title)}</strong><br><button class="table__name" data-company="${esc(t.company.id)}">${esc(t.company.name)}</button><div class="task__date">${date(t.dueAt)}</div></div><button data-complete="${esc(t.id)}">Выполнить</button></div>`,
        )
        .join("")
    : empty(
        "Нет запланированных задач",
        "Создайте следующую задачу в карточке компании.",
      );
  target.querySelectorAll("[data-complete]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          await api(`/tasks/${b.dataset.complete}`, {
            method: "PATCH",
            data: { done: true },
          });
          await render();
        } catch (e) {
          toast(e.message);
        }
      }),
  );
  wireCompanies(target);
}
async function crm(version) {
  content().innerHTML = `<section class="panel"><h2>Воронка клиентов</h2><div class="pills"><button data-status="" class="${crmFilter ? "" : "is-active"}">Все</button>${Object.entries(
    statuses,
  )
    .map(
      ([key, label]) =>
        `<button data-status="${key}" class="${crmFilter === key ? "is-active" : ""}">${label}</button>`,
    )
    .join(
      "",
    )}</div><div id="crm-list"></div></section><section class="panel"><h2>Следующие задачи</h2><div id="crm-tasks"></div></section>`;
  document.querySelectorAll("[data-status]").forEach(
    (b) =>
      (b.onclick = () => {
        crmFilter = b.dataset.status;
        render();
      }),
  );
  const data = await api(
    `/companies?pageSize=100${crmFilter ? "&crmStatus=" + crmFilter : ""}`,
  );
  if (version !== routeVersion) return;
  document.querySelector("#crm-list").innerHTML = data.items.length
    ? table(data.items) +
      `<small>Показано ${data.items.length} из ${data.total}. Для всех записей и фильтров используйте базу клиентов.</small>`
    : empty(
        "Нет компаний на этом этапе",
        "Статус взаимодействия меняется в карточке компании.",
      );
  wireCompanies();
  await renderTasks("#crm-tasks");
}
async function settingsPage() {
  settings = await api("/settings");
  const sourceState = {
    READY: "Настроен",
    NOT_CONFIGURED: "Не настроен",
    NOT_IMPLEMENTED: "Пока не подключён",
    LICENSE_REVIEW: "Требует проверки лицензии",
    UNSUITABLE: "Не подходит для хранения",
    NEEDS_RIGHTS: "Нужно разрешение на хранение",
  };
  content().innerHTML = `<section class="panel"><h2>Источники организаций</h2>${settings.sources.map((s) => `<div class="source"><div><strong>${esc(s.name)}</strong><p>${esc(s.note)}</p></div><span class="badge ${s.status === "READY" ? "" : "badge--muted"}">${esc(sourceState[s.status])}</span></div>`).join("")}<p><small>Параметры подключений задаются администратором сервера в .env. После изменения перезапустите сервер и worker.</small></p><div class="notice">Данные OpenStreetMap: © OpenStreetMap contributors, ODbL 1.0. <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">Условия использования</a>. Экспорт содержит первоисточники и лицензии.</div></section><div class="grid"><section class="panel"><h2>Правила Lead Score</h2>${[
    ["Потребность в платформе", 25],
    ["Активность бизнеса", 20],
    ["Высокий средний чек", 20],
    ["Автоматизация процессов", 15],
    ["Деловой контакт", 10],
    ["Типовой продукт", 10],
  ]
    .map(
      ([label, max]) =>
        `<div class="source"><strong>${label}</strong><span>${max} баллов</span></div>`,
    )
    .join(
      "",
    )}<p><small>75–100: высокий · 50–74: средний · 0–49: низкий. Неизвестные признаки дают 0 баллов. Редактор весов — следующий этап.</small></p></section><section class="panel"><h2>Проверка сайтов</h2><p>HTTP, HTTPS, редиректы, title, description, H1, viewport, формы и контакты.</p><span class="badge">${settings.browserEnabled ? "Браузер и Lighthouse включены" : "Браузер и Lighthouse выключены"}</span><p><small>Если проверка браузером недоступна, результаты не подменяются. Статическая проверка не видит формы, добавленные JavaScript.</small></p></section></div>`;
}
start();
