import { parse } from "csv-parse/sync";
import ExcelJS from "exceljs";
import { inflateRaw } from "node:zlib";
import { promisify } from "node:util";
const inflate = promisify(inflateRaw);
import { companySchema } from "../validators/company.js";
import { HttpError } from "../lib/errors.js";
export const headers = {
  name: ["name", "название", "наименование"],
  city: ["city", "город"],
  region: ["region", "регион"],
  niche: ["niche", "ниша", "категория"],
  address: ["address", "адрес"],
  inn: ["inn", "инн"],
  ogrn: ["ogrn", "огрн"],
  website: ["website", "сайт", "веб-сайт"],
  phone: ["phone", "телефон"],
  email: ["email", "почта"],
  sourceUrl: ["sourceurl", "источник", "ссылка на источник"],
};
function mapRow(row, defaults) {
  const obj = { ...defaults };
  for (const [key, aliases] of Object.entries(headers)) {
    const match = Object.keys(row).find((k) =>
      aliases.includes(k.trim().toLowerCase()),
    );
    if (match) {
      const v = String(row[match] ?? "").trim();
      if (v) obj[key] = v;
    }
  }
  return obj;
}
export async function parseFile(buffer, filename, defaults) {
  let rows;
  if (filename.toLowerCase().endsWith(".csv")) {
    const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    const delimiter = text.split(/\r?\n/)[0].includes(";") ? ";" : ",";
    rows = parse(text, {
      columns: true,
      delimiter,
      skip_empty_lines: true,
      bom: true,
      max_record_size: 10000,
    });
  } else if (filename.toLowerCase().endsWith(".xlsx")) {
    await validateXlsxArchive(buffer);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer);
    if (book.worksheets.length > 10)
      throw new HttpError(400, "Слишком много листов");
    const sheet = book.worksheets[0];
    if (!sheet) throw new HttpError(400, "Нет листа");
    const cellValue = (c) => {
      const v = c.value;
      if (v && typeof v === "object")
        return v.text ?? v.richText?.map((x) => x.text).join("") ?? "";
      return v ?? "";
    };
    const names = sheet
      .getRow(1)
      .values.slice(1)
      .map((v) => String(v || ""));
    rows = [];
    sheet.eachRow((row, i) => {
      if (i === 1) return;
      if (i > 5001) throw new HttpError(400, "Максимум 5000 записей");
      const obj = {};
      names.forEach(
        (name, j) => (obj[name] = String(cellValue(row.getCell(j + 1)))),
      );
      rows.push(obj);
    });
  } else throw new HttpError(400, "Поддерживаются CSV UTF-8 и XLSX");
  if (rows.length > 5000) throw new HttpError(400, "Максимум 5000 записей");
  const valid = [],
    errors = [];
  for (let i = 0; i < rows.length; i++) {
    const mapped = mapRow(rows[i], defaults);
    const sourceUrl = mapped.sourceUrl || "";
    delete mapped.sourceUrl;
    const result = companySchema.safeParse(mapped);
    if (result.success) valid.push({ data: result.data, sourceUrl });
    else
      errors.push({
        row: i + 2,
        error: result.error.issues
          .map((x) => `${x.path.join(".")}: ${x.message}`)
          .join("; "),
      });
  }
  return { valid, errors, total: rows.length };
}
export function csvCell(value) {
  let text = String(value ?? "");
  if (/^(?:[\s]*[=+@\-]|[\t\r\n])/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

async function validateXlsxArchive(buffer) {
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new HttpError(400, "Повреждён XLSX");
  const count = buffer.readUInt16LE(end + 10),
    offset = buffer.readUInt32LE(end + 16);
  if (count > 2000 || count === 65535 || offset === 0xffffffff)
    throw new HttpError(400, "XLSX слишком сложный или ZIP64");
  let pos = offset,
    total = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > buffer.length || buffer.readUInt32LE(pos) !== 0x02014b50)
      throw new HttpError(400, "Повреждён ZIP");
    const size = buffer.readUInt32LE(pos + 24);
    total += size;
    if (size > 10 * 1024 * 1024 || total > 30 * 1024 * 1024)
      throw new HttpError(400, "Распакованный XLSX превышает лимит 30 МБ");
    const compression = buffer.readUInt16LE(pos + 10),
      flags = buffer.readUInt16LE(pos + 8);
    const compressedSize = buffer.readUInt32LE(pos + 20),
      localOffset = buffer.readUInt32LE(pos + 42);
    if (
      flags & 1 ||
      ![0, 8].includes(compression) ||
      localOffset + 30 > buffer.length ||
      buffer.readUInt32LE(localOffset) !== 0x04034b50
    )
      throw new HttpError(400, "Неподдерживаемый XLSX ZIP");
    const dataOffset =
      localOffset +
      30 +
      buffer.readUInt16LE(localOffset + 26) +
      buffer.readUInt16LE(localOffset + 28);
    if (dataOffset + compressedSize > buffer.length)
      throw new HttpError(400, "Повреждён XLSX ZIP");
    const compressed = buffer.subarray(dataOffset, dataOffset + compressedSize);
    let unpacked;
    try {
      unpacked =
        compression === 8
          ? await inflate(compressed, {
              maxOutputLength: Math.min(size + 1, 10 * 1024 * 1024 + 1),
            })
          : compressed;
    } catch {
      throw new HttpError(
        400,
        "Распаковка XLSX превышает лимит или повреждена",
      );
    }
    if (unpacked.length !== size)
      throw new HttpError(400, "Некорректный размер содержимого XLSX");
    pos +=
      46 +
      buffer.readUInt16LE(pos + 28) +
      buffer.readUInt16LE(pos + 30) +
      buffer.readUInt16LE(pos + 32);
  }
}
