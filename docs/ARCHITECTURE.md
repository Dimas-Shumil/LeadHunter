# Архитектура ShumDev Lead Hunter v0.3

Express 5 обслуживает статическую административную панель на Vanilla JS, REST API и Prisma Client. SQLite хранит компании, пользователей/сессии, источники, историю проверок и фоновые задания. Один отдельный Node worker получает задания и выполняет поиск/импорт/проверки.

## SQLite и одновременный доступ

- Prisma v7 `provider = "sqlite"` + `@prisma/adapter-better-sqlite3`.
- Файл базы `prisma/dev.db` задаётся через `.env`; путь нормализуется и в Prisma CLI, и в runtime.
- `writeTransaction`: обновляет `_WriteLock` первой операцией транзакции, чтобы SQLite захватил право записи до чтения. Применяется для `enqueue`, `claimJob`, `ingestCompany` и `mergeCompanies`.
- При временной блокировке поддерживаются ограниченные повторные попытки. Работа 1 web-процесса + 1 worker — целевая локальная конфигурация. Не запускать много worker или кластер PM2.
- Prisma schema использует enum и JSON на стороне ORM; SQLite хранит их как TEXT/JSONB, database-level CHECK для enum нет.
- `COLLATE NOCASE` для столбца `Company.city` в миграции помогает сравнениям городов с латиницей, но не гарантирует insensitive-сравнения всех кириллических букв. Отсутствующие `mode: insensitive` — отличие от PostgreSQL.

## Модули

- `src/providers/` — OSM, 2ГИС, Яндекс, общая нормализация провайдеров.
- `src/services/companies.js` — создание, дедупликация и merge.
- `src/services/jobs.js`, `src/worker.js` — задания и обработчик.
- `src/audit/` — проверка внешних сайтов, отдельный процесс браузера при настройке.
- `src/controllers/` и `src/routes/` — защищённые API.
- `public/` + `styles/` — интерфейс.
- `prisma/migrations/` — единственная исходная SQLite миграция (не PG).

## Сохранение и безопасность

`*.db`, `*.db-*`, `.env` исключены из git. Для консистентной копии используйте `npm run db:backup`. `AUDIT_BROWSER_ENABLED=false` по умолчанию. Ключи хранятся только в `.env`. Данные внешних организаций должны использоваться на основании прав и условий провайдеров.
