import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const port = process.env.E2E_PORT || "3002";
const allocator = createNetServer();
await new Promise((r) => allocator.listen(0, "127.0.0.1", r));
const redisPort = allocator.address().port;
await new Promise((r) => allocator.close(r));
const redis = spawn(
  "redis-server",
  [
    "--bind",
    "127.0.0.1",
    "--port",
    String(redisPort),
    "--save",
    "",
    "--appendonly",
    "no",
  ],
  { stdio: "ignore" },
);
const provider = createServer(async (req, res) => {
  const u = new URL(req.url, "http://provider");
  if (req.method === "GET" && u.pathname.endsWith("/auth")) {
    const target = new URL(u.searchParams.get("redirect_uri"));
    target.searchParams.set("code", "browser-fixture-code");
    target.searchParams.set("state", u.searchParams.get("state"));
    res.writeHead(302, { Location: target.href });
    res.end();
    return;
  }
  let raw = "";
  for await (const part of req) raw += part;
  const body = req.headers["content-type"]?.includes("application/json")
    ? JSON.parse(raw || "{}")
    : Object.fromEntries(new URLSearchParams(raw));
  res.setHeader("Content-Type", "application/json");
  if (u.pathname.endsWith("/token") && body.code === "browser-invalid-client") {
    res.writeHead(401);
    res.end(
      JSON.stringify({
        error: "invalid_client",
        error_description: "PRIVATE_PROVIDER_DIAGNOSTIC",
      }),
    );
  } else if (u.pathname.endsWith("/ciba/auth"))
    res.end(JSON.stringify({ auth_req_id: "browser-auth-id" }));
  else if (u.pathname.endsWith("/dcql"))
    res.end(JSON.stringify({ id: "phone", format: "ts43" }));
  else if (u.pathname.endsWith("/callback") && body.code === "000000") {
    res.writeHead(400);
    res.end(JSON.stringify({ error: "invalid_code" }));
  } else if (u.pathname.endsWith("/token") && body.auth_req_id === "bad") {
    res.writeHead(400);
    res.end(JSON.stringify({ error: "invalid_code" }));
  } else if (u.pathname.endsWith("/token"))
    res.end(JSON.stringify({ access_token: "browser-token" }));
  else
    res.end(
      JSON.stringify({
        sub: "browser-user",
        phone_number: "+12025550123",
        phone_number_verified: "true",
      }),
    );
});
await new Promise((r) => provider.listen(0, "127.0.0.1", r));
const dir = mkdtempSync(path.join(tmpdir(), "showcase-browser-"));
const config = JSON.parse(readFileSync("config/default.json.sample", "utf8"));
Object.assign(config, {
  client_id: "browser-client",
  client_secret: "browser-fixture-secret",
  default_country_code: "us",
  auth_servers: [
    { id: "stage", url: `http://127.0.0.1:${provider.address().port}` },
    { id: "secondary", url: `http://127.0.0.1:${provider.address().port}` },
  ],
  locale: { app: { name: "IPification Showcase" } },
});
writeFileSync(path.join(dir, "default.json"), JSON.stringify(config));
const child = spawn(process.execPath, ["server.mjs"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: port,
    APP_ENV: "development",
    NODE_CONFIG_ENV: "development",
    APP_ORIGIN: `http://127.0.0.1:${port}`,
    NODE_CONFIG_DIR: dir,
    REDIS_URL: `redis://127.0.0.1:${redisPort}`,
    SHOWCASE_KEY_PREFIX: "showcase-browser:",
  },
  stdio: "inherit",
});
function shutdown() {
  child.kill("SIGTERM");
  redis.kill("SIGTERM");
  provider.closeAllConnections();
  provider.close();
  rmSync(dir, { recursive: true, force: true });
}
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, shutdown);
child.once("exit", (code) => {
  shutdown();
  process.exit(code ?? 0);
});
