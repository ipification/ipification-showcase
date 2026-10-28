import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import next from "next";
import { startSocketServer } from "./runtime/socket-server.mjs";
import { initializeConfigEnvironment } from "./runtime/config.mjs";
const appRoot = fileURLToPath(new URL(".", import.meta.url));
const dev = process.env.NODE_ENV !== "production";
initializeConfigEnvironment({ appRoot, dev });
const port = Number(process.env.PORT || 3002);
const app = next({ dev, dir: appRoot, hostname: "0.0.0.0", port });
await app.prepare();
const handler = app.getRequestHandler();
let sockets;
const server = createServer((req, res) => {
  const requestId = randomUUID(),
    started = Date.now();
  res.setHeader("X-Request-Id", requestId);
  res.once("finish", () => {
    if (!req.url?.startsWith("/_next/"))
      console.info(
        JSON.stringify({
          requestId,
          method: req.method,
          path: (req.url || "/").split("?")[0],
          status: res.statusCode,
          duration: Date.now() - started,
        }),
      );
  });
  // Next derives Request.url from forwarded headers before Route Handlers run.
  // Remove untrusted values at the raw HTTP boundary, not only in context.ts.
  if (!(Number(process.env.TRUST_PROXY_HOPS || 0) > 0)) {
    for (const name of Object.keys(req.headers))
      if (name.startsWith("x-forwarded-") || name === "forwarded")
        delete req.headers[name];
  }
  req.headers["x-showcase-peer-ip"] = req.socket.remoteAddress || "127.0.0.1";
  req.headers["x-showcase-realtime-ready"] = sockets?.ready()
    ? "true"
    : "false";
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  return handler(req, res);
});
if (process.env.REDIS_URL)
  sockets = await startSocketServer(server, {
    redisUrl: process.env.REDIS_URL,
    adapterKey:
      (process.env.SHOWCASE_KEY_PREFIX || "showcase-next:development:") +
      "socket.io",
  });
server.listen(port, "0.0.0.0", () =>
  console.log(`Showcase listening on ${port}`),
);
async function close() {
  const timeout = setTimeout(() => process.exit(1), 9500);
  timeout.unref();
  if (sockets) await sockets.close();
  server.close();
  server.closeAllConnections();
  await app.close();
  process.exit(0);
}
process.once("SIGTERM", close);
process.once("SIGINT", close);
