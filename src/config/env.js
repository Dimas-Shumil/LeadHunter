import "dotenv/config";
import { z } from "zod";
export const env = z
  .object({
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.string().default("127.0.0.1"),
    DATABASE_URL: z.string().min(1),
    APP_ORIGIN: z.url().default("http://localhost:3000"),
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    AUDIT_TIMEOUT_MS: z.coerce.number().min(10000).max(120000).default(90000),
  })
  .parse(process.env);
if (env.NODE_ENV === "production" && !env.APP_ORIGIN.startsWith("https://"))
  throw new Error("Production требует HTTPS APP_ORIGIN");
