import { parseFile } from "./imports.js";
process.on("message", async ({ buffer, filename, defaults }) => {
  try {
    process.send?.({ result: await parseFile(buffer, filename, defaults) });
  } catch (e) {
    process.send?.({ error: e.message });
  } finally {
    process.disconnect();
  }
});
