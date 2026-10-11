import { randomBytes } from "node:crypto";
import { db } from "../lib/db.js";
import { digest } from "../services/normalize.js";
import { env } from "../config/env.js";
export const cookieOptions = {
  httpOnly: true,
  sameSite: "strict",
  secure: env.NODE_ENV === "production",
  path: "/",
  maxAge: 8 * 60 * 60 * 1000,
};
export function originGuard(req, res, next) {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.get("origin") !== env.APP_ORIGIN
  )
    return res.status(403).json({ error: "Недопустимый Origin" });
  next();
}
export async function requireOwner(req, res, next) {
  const token = req.cookies?.lh_session;
  if (!token) return res.status(401).json({ error: "Войдите в систему" });
  const session = await db.session.findUnique({
    where: { id: digest(token) },
    include: { user: true },
  });
  if (
    !session ||
    session.expiresAt <= new Date() ||
    session.user.role !== "OWNER"
  )
    return res.status(401).json({ error: "Сессия истекла" });
  req.owner = session.user;
  req.session = session;
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.get("x-csrf-token") !== session.csrf
  )
    return res
      .status(403)
      .json({ error: "Обновите страницу: CSRF-токен отсутствует" });
  next();
}
export async function createSession(userId) {
  const token = randomBytes(32).toString("base64url");
  const csrf = randomBytes(32).toString("base64url");
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.session.create({
    data: {
      id: digest(token),
      userId,
      csrf,
      expiresAt: new Date(Date.now() + cookieOptions.maxAge),
    },
  });
  return { token, csrf };
}
