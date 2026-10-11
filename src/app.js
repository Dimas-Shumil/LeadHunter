import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { HttpError } from "./lib/errors.js";
import { env } from "./config/env.js";
import api from "./routes/api.js";
export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", env.TRUST_PROXY);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: env.NODE_ENV === "production" ? [] : null,
      },
    },
  }),
);
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 240,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
  (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  },
  api,
);
app.use("/api", (_req, res) =>
  res.status(404).json({ error: "API маршрут не найден" }),
);
const publicPath = fileURLToPath(new URL("../public/", import.meta.url));
app.use(express.static(publicPath, { dotfiles: "deny" }));
app.get("/", (_req, res) => res.sendFile(path.join(publicPath, "index.html")));
app.use((err, req, res, _next) => {
  if (err instanceof ZodError)
    return res.status(400).json({
      error: err.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    });
  const status =
    err.status ||
    { P2002: 409, P2003: 404, P2025: 404 }[err.code] ||
    (err.name === "MulterError" ? 400 : 500);
  if (status >= 500)
    console.error(
      JSON.stringify({
        event: "request_failed",
        method: req.method,
        path: req.path,
        message: err.message,
      }),
    );
  res.status(status).json({
    error:
      status >= 500 && !(err instanceof HttpError)
        ? "Ошибка сервера. Проверьте журнал и подключение к БД"
        : err.code === "P2002"
          ? "Такой ИНН/ОГРН уже существует"
          : err.message,
  });
});
