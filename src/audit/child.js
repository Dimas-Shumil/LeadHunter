import { auditWebsite } from "./run.js";
process.on("message", async ({ website }) => {
  try {
    const result = await auditWebsite(website);
    process.send?.({ result });
  } catch (e) {
    process.send?.({ error: e.message });
  } finally {
    process.disconnect();
  }
});
