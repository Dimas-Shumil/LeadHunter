import { readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = `${dir}/${item.name}`;
    if (item.isDirectory()) await walk(path);
    else if (/\.(?:js|mjs)$/.test(path))
      execFileSync(process.execPath, ["--check", path], { stdio: "inherit" });
  }
}
for (const dir of ["src", "public/js", "scripts", "tests"]) await walk(dir);
console.log("JavaScript syntax OK");
