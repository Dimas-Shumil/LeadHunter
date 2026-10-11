import http from "node:http";
import net from "node:net";
import { validateUrl, resolvePublic, safeRequest } from "./network.js";
// All browser HTTP and CONNECT traffic passes here; DNS answers are pinned to sockets.
export async function createAuditProxy() {
  let total = 0;
  const sockets = new Set();
  const limit = 25 * 1024 * 1024;
  const track = (s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
    s.on("data", (b) => {
      total += b.length;
      if (total > limit) for (const socket of sockets) socket.destroy();
    });
  };
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method !== "GET") throw new Error("Only GET");
      const r = await safeRequest(validateUrl(req.url).href, {
        maxBytes: 2 * 1024 * 1024,
      });
      total += Buffer.byteLength(r.body);
      if (total > limit) throw new Error("Budget exceeded");
      res.writeHead(r.status, {
        "content-type": r.headers["content-type"] || "text/plain",
      });
      res.end(r.bodyBuffer || r.body);
    } catch {
      res.writeHead(502);
      res.end("Audit proxy blocked request");
    }
  });
  server.on("connection", track);
  server.on("connect", async (req, client, head) => {
    try {
      if (sockets.size > 24) throw new Error("Connection limit");
      const u = validateUrl(`https://${req.url}`);
      if (!req.url.endsWith(":443")) throw new Error("Only 443");
      const pinned = await resolvePublic(u.hostname);
      const upstream = net.connect({ host: pinned.address, port: 443 });
      track(upstream);
      upstream.setTimeout(20000, () => upstream.destroy());
      upstream.on("error", () => client.destroy());
      client.on("error", () => upstream.destroy());
      client.on("close", () => upstream.destroy());
      upstream.once("connect", () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        upstream.pipe(client);
        client.pipe(upstream);
      });
    } catch {
      client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    port: server.address().port,
    close: () => {
      for (const s of sockets) s.destroy();
      server.close();
    },
  };
}
