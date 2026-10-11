/** Syntax-only check, NOT a verification that a phone number is active or owned by a business. */
export function inspectPhone(input) {
  const raw = String(input || "").trim();
  if (!raw) return { state: "unavailable", value: null, label: "Не предоставлен источником" };
  const cleaned = raw.replace(/^(?:tel:)/i, "").replace(/(?:доб\.?|ext\.?|#)\s*\d+$/i, "").trim();
  const digits = cleaned.replace(/\D/g, "");
  if (/^[78]\d{10}$/.test(digits)) {
    return { state: "format_ok", value: "+7" + digits.slice(1), label: "Формат проверен, доступность не проверялась" };
  }
  if (/^\+\d{10,15}$/.test(cleaned.replace(/[()\s-]/g, "")) && digits.length <= 15) {
    return { state: "format_ok", value: "+" + digits, label: "Формат проверен, доступность не проверялась" };
  }
  return { state: "review", value: null, label: "Не удалось подтвердить формат; проверьте вручную" };
}
