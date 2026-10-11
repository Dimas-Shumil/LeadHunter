import argon2 from "argon2";
import { z } from "zod";
import { db } from "../lib/db.js";
import { createSession, cookieOptions } from "../middleware/auth.js";
export async function login(req, res) {
  const data = z
    .object({ email: z.email().max(250), password: z.string().min(1).max(200) })
    .parse(req.body);
  const user = await db.user.findUnique({
    where: { email: data.email.toLowerCase() },
  });
  if (!user || !(await argon2.verify(user.passwordHash, data.password)))
    return res.status(401).json({ error: "Неверный email или пароль" });
  const session = await createSession(user.id);
  res
    .cookie("lh_session", session.token, cookieOptions)
    .json({ email: user.email, csrf: session.csrf });
}
export async function logout(req, res) {
  await db.session.delete({ where: { id: req.session.id } });
  res
    .clearCookie("lh_session", {
      path: "/",
      sameSite: "strict",
      secure: cookieOptions.secure,
    })
    .json({ ok: true });
}
