import { fork } from "node:child_process";
import { HttpError } from "../lib/errors.js";
let running = 0;
export function parseImport(buffer, filename, defaults) {
  if (running >= 2)
    throw new HttpError(429, "Два файла уже обрабатываются, попробуйте позже");
  running++;
  return new Promise((resolve, reject) => {
    const child = fork(new URL("./import-child.js", import.meta.url), [], {
      serialization: "advanced",
      execArgv: ["--max-old-space-size=256"],
      env: { PATH: process.env.PATH },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    let settled = false;
    function done(error, result) {
      if (settled) return;
      settled = true;
      running--;
      clearTimeout(timer);
      child.kill("SIGKILL");
      error ? reject(error) : resolve(result);
    }
    const timer = setTimeout(
      () => done(new HttpError(400, "Файл не удалось разобрать за 20 секунд")),
      20000,
    );
    child.on("message", (m) =>
      done(m.error ? new HttpError(400, m.error) : null, m.result),
    );
    child.on("error", (e) => done(new HttpError(400, e.message)));
    child.on("exit", (code) => {
      if (!settled)
        done(new HttpError(400, `Парсер файла завершился: ${code}`));
    });
    child.send({ buffer, filename, defaults });
  });
}
