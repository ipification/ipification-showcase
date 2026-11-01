import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
import next from "next";
import { initializeConfigEnvironment } from "./runtime/config.mjs";
const appRoot = fileURLToPath(new URL(".", import.meta.url));
const dev = process.env.NODE_ENV !== "production";
initializeConfigEnvironment({ appRoot, dev });
const port = Number(process.env.PORT || 3002);
const app = next({ dev, dir: appRoot, hostname: "0.0.0.0", port });
await app.prepare();
const handler = app.getRequestHandler();
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
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  return handler(req, res);
});
server.listen(port, "0.0.0.0", () => {
  console.log(`Showcase listening on ${port}`);
  if (!dev) return;
  console.log(`  Local: http://localhost:${port}/auth/login`);
  const addresses = [
    ...new Set(
      Object.values(networkInterfaces())
        .flatMap((entries) => entries || [])
        .filter((entry) => entry.family === "IPv4" && !entry.internal)
        .map((entry) => entry.address),
    ),
  ].sort();
  for (const address of addresses)
    console.log(`  Network: http://${address}:${port}/auth/login`);
  if (!addresses.length)
    console.log(
      "  Network: no LAN IPv4 address found. Connect to Wi-Fi or Ethernet and restart.",
    );
  console.log(
    "  For QR authentication from your phone, open a Network URL on your computer and connect your phone to the same network. localhost on the phone points to the phone itself.",
  );
});
async function close() {
  const timeout = setTimeout(() => process.exit(1), 9500);
  timeout.unref();
  server.close();
  server.closeAllConnections();
  await app.close();
  process.exit(0);
}
process.once("SIGTERM", close);
process.once("SIGINT", close);
