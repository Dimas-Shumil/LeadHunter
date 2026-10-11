import { app } from "./app.js";
import { db } from "./lib/db.js";
import { env } from "./config/env.js";
await db.$connect();
const server = app.listen(env.PORT, env.HOST, () =>
  console.log(`ShumDev Lead Hunter: ${env.APP_ORIGIN}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(async () => {
      await db.$disconnect();
      process.exit(0);
    }),
  );
