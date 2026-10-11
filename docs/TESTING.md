# Тестирование — SQLite v0.3

## Что проверено при подготовке архива

- Синтаксис JS (`node --check`) локальным Node.js 22.
- SQL-миграция выполнена встроенным SQLite 3.46 через Python `sqlite3` во временном файле, без ошибок. Созданы таблицы, индексы, внешние ключи; `PRAGMA foreign_key_check` — без ошибок.
- Полный `npm install`, генерация Prisma Client, live worker и HTTP UI на SQLite **не запускались**: npm registry в среде сборки недоступен, Node.js 24 здесь отсутствует.
- Результаты 15 unit / 10 интеграционных тестов из старой v0.2 относятся к **PostgreSQL/PGlite** и не являются доказательством работоспособности версии SQLite. См. исторический файл `docs/integration-results.txt`.

## Проверки после установки на Windows

```bat
cd /d C:\Work\shumdev-lead-hunter
npm install
npm run db:generate
npm run db:deploy
npm run check
npm test
npm run owner:create
npm run build
npm run dev
```

Во втором CMD: `npm run worker`.

В UI: вход OWNER, импорт CSV из `public/import-template.csv`, проверка карточки, CRM и Lead Score, новый поиск через OSM с лимитом 20, повторный поиск — без дубликатов, задания и статусы.

## Изолированный интеграционный прогон

Интеграционные тесты меняют данные и **требуют отдельный файл** `*_test.db`. В новом CMD:

```bat
cd /d C:\Work\shumdev-lead-hunter
set DATABASE_URL=file:./prisma/lead_hunter_test.db
npm run db:deploy
set TEST_DATABASE_URL=file:./prisma/lead_hunter_test.db
npm run test:integration
```

Не запускайте тесты параллельно с веб-приложением или worker на тестовой БД. Проверка в tests/integration.mjs запрещает совпадение тестовой БД с основной. После тестов в обычном CMD верните рабочую `DATABASE_URL` из `.env`.

## Backups

`npm run db:backup` создаёт копию в `prisma/backups/`. Проверьте восстановление копии на тестовом месте перед эксплуатацией.
