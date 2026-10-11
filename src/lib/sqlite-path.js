import { resolve, isAbsolute, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

// Resolve DATABASE_URL without interpreting its unescaped file path as a URL.
// Keep the absolute URL helper for file-system operations (backup/tests).
function sqliteFilePath(input, root = process.cwd()) {
  if (!input?.startsWith("file:"))
    throw new Error("DATABASE_URL должен начинаться с file: для SQLite");
  const raw = input.slice(5);
  if (!raw || raw.includes("?") || raw.includes("#"))
    throw new Error("Ожидается URL без query/fragment: file:./prisma/dev.db");
  return isAbsolute(raw) ? raw : resolve(root, raw);
}

export function sqliteUrl(input, root = process.cwd()) {
  return pathToFileURL(sqliteFilePath(input, root)).href;
}

// Prisma Migrate resolves file:./... relative to prisma/schema.prisma.
// Preserve a RELATIVE SQLite URL for the engine: converting the database
// path to file:///C:/Users/%D0%... breaks Prisma on Windows Cyrillic profiles.
export function sqliteCliUrl(input, root = process.cwd()) {
  const dbPath = sqliteFilePath(input, root);
  const relativePath = relative(resolve(root, "prisma"), dbPath).split(sep).join("/");
  if (isAbsolute(relativePath))
    throw new Error("SQLite database должен быть на том же диске, что и проект");
  const prefix = relativePath.startsWith(".") ? "" : "./";
  return `file:${prefix}${relativePath}`;
}
