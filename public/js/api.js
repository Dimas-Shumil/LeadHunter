export let csrf = "";
export const setCsrf = (value) => (csrf = value);
export async function api(url, { method = "GET", data, ...options } = {}) {
  const headers = { ...options.headers };
  if (method !== "GET") headers["X-CSRF-Token"] = csrf;
  let body = data;
  if (data && !(data instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(data);
  }
  const response = await fetch("/api" + url, {
    ...options,
    method,
    headers,
    body,
    credentials: "same-origin",
  });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && url !== "/auth/login")
      window.dispatchEvent(new Event("session-expired"));
    throw new Error(result.error || "Запрос не выполнен");
  }
  return result;
}
export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const date = (value) =>
  value
    ? new Date(value).toLocaleString("ru-RU", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";
export const link = (url, label = url) => {
  try {
    const u = new URL(url);
    return ["http:", "https:"].includes(u.protocol)
      ? `<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`
      : esc(label);
  } catch {
    return esc(label);
  }
};
export const statuses = {
  NEW: "Новый",
  REVIEW: "На проверке",
  QUALIFIED: "Подходит",
  IN_PROGRESS: "В работе",
  DISCUSSION: "Обсуждение",
  CLIENT: "Клиент",
  REJECTED: "Отказ",
  ARCHIVED: "Архив",
};
export const websiteStatuses = {
  NOT_FOUND: "URL не получен",
  UNCHECKED: "Не проверен",
  AVAILABLE: "Доступен",
  ISSUES: "Технические проблемы",
  UNAVAILABLE: "Недоступен",
  BLOCKED: "Проверка заблокирована",
};
export const jobStatuses = {
  QUEUED: "В очереди",
  RUNNING: "Выполняется",
  COMPLETED: "Завершено",
  FAILED: "Ошибка",
  CANCELLED: "Остановлено",
};
export const options = (values, selected, empty) =>
  `${empty ? `<option value="">${esc(empty)}</option>` : ""}${Object.entries(
    values,
  )
    .map(
      ([v, t]) =>
        `<option value="${esc(v)}" ${v === selected ? "selected" : ""}>${esc(t)}</option>`,
    )
    .join("")}`;
export function toast(message) {
  document.querySelector("#toast").textContent = message;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(
    () => (document.querySelector("#toast").textContent = ""),
    6000,
  );
}

export const inquiryStatuses = {
  NEW: "Новая",
  IN_PROGRESS: "В работе",
  WAITING: "Ожидает ответа",
  WON: "Закрыта успешно",
  LOST: "Отказ / не состоялась",
};
export const inquirySources = {
  PHONE: "Телефон", TELEGRAM: "Telegram", VK: "ВКонтакте", WHATSAPP: "WhatsApp",
  EMAIL: "Email", WEBSITE: "Сайт", OTHER: "Другое",
};
