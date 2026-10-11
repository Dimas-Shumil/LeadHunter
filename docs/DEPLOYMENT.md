# Развёртывание SQLite (после локальных тестов)

Для локального Lead Hunter **не нужен VPS**. На VPS: Node 24, один Express и **один** worker. Не включайте cluster-mode/multiple replicas с общей SQLite базой.

Потребуется серверный каталог с правами записи на `prisma/` и `prisma/backups/`, постоянный диск, план резервного копирования, reverse proxy (Nginx), HTTPS/SSL, надёжная OWNER авторизация и ограничения доступа.

```sh
npm install
npm run db:generate
npm run db:deploy
npm run build
npm run owner:create
```

В `.env` установите `NODE_ENV=production`, `APP_ORIGIN=https://ваш-домен`, `DATABASE_URL=file:./prisma/dev.db`, `HOST=127.0.0.1`; `TRUST_PROXY=1` только за доверенным reverse-proxy. Для реальной эксплуатации подготовить отдельную sandbox/egress защиту браузерного аудита сторонних сайтов.

До завершения Windows + SQLite интеграционных тестов готовность к production не подтверждена.
