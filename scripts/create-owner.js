import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { z } from "zod";
import argon2 from "argon2";
import { db } from "../src/lib/db.js";
const rl = createInterface({ input: stdin, output: stdout });
try {
  const email = z
    .email()
    .parse((await rl.question("Email владельца: ")).trim().toLowerCase());
  if (await db.user.count())
    throw new Error("OWNER уже создан. Скрипт не перезаписывает пароль.");
  const password = await rl.question(
    "Пароль (минимум 12 символов; ввод виден в терминале): ",
  );
  if (password.length < 12 || password.length > 200)
    throw new Error("Пароль: 12–200 символов");
  const again = await rl.question("Повторите пароль: ");
  if (password !== again) throw new Error("Пароли не совпадают");
  await db.user.create({
    data: {
      email,
      passwordHash: await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      }),
    },
  });
  console.log("OWNER создан.");
} finally {
  rl.close();
  await db.$disconnect();
}
