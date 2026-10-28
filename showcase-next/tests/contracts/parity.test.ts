import { test, expect } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";
import { freePort, startApp, stop } from "../helpers/processes";
import { startRedis } from "../helpers/redis";
import { configFixture } from "../helpers/config";
test("all 21 business paths retain legacy status and non-UI payload contracts", async () => {
  const redis = await startRedis(),
    config = configFixture();
  const oldPort = await freePort(),
    port = await freePort(),
    oldUrl = `http://127.0.0.1:${oldPort}`;
  const legacy = spawn(process.execPath, ["bin/www"], {
    cwd: path.resolve(".."),
    env: {
      ...process.env,
      PORT: String(oldPort),
      NODE_CONFIG_DIR: config.dir,
      NODE_ENV: "development",
      PLAY_INTEGRITY_ENABLED: "false",
    },
    stdio: "ignore",
  });
  const app = await startApp({
    PORT: String(port),
    NODE_CONFIG_DIR: config.dir,
    APP_ORIGIN: `http://127.0.0.1:${port}`,
    REDIS_URL: redis.url,
    PLAY_INTEGRITY_ENABLED: "false",
  });
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(oldUrl, { redirect: "manual" })).status === 302) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 50));
    }
    const cases: [string, string, unknown?][] = [
      ["GET", "/"],
      ["GET", "/auth/login"],
      ["GET", "/auth/start?server_id=unknown"],
      ["GET", "/auth/callback/missing/stage"],
      ["GET", "/auth/complete?state=missing-parity"],
      ["GET", "/auth/qrcode/complete"],
      ["GET", "/auth/qrcode/error"],
      ["GET", "/user/info"],
      ["GET", "/api/config"],
      ["GET", "/api/geoip"],
      ["POST", "/auth/s2s/signin", {}],
      ["POST", "/auth/mobile/login", { client_id: "missing" }],
      ...["sms", "ts43"].flatMap(
        (p) =>
          [
            ["POST", `/${p}/auth`, { client_id: "missing" }],
            ["POST", `/${p}/token`, { client_id: "missing" }],
            ["POST", `/${p}/log`, { data: { type: "fixture" } }],
          ] as [string, string, unknown][],
      ),
      ...["attempt", "verify", "token-exchange"].map(
        (p) =>
          ["POST", `/api/play-integrity/${p}`, {}] as [string, string, unknown],
      ),
    ];
    expect(cases).toHaveLength(21);
    for (const [method, route, body] of cases) {
      const options: RequestInit = {
        method,
        redirect: "manual",
        ...(method === "POST"
          ? {
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      };
      const [old, next] = await Promise.all([
        fetch(oldUrl + route, options),
        fetch(app.url + route, options),
      ]);
      expect(next.status, route).toBe(old.status);
      expect(
        next.headers.get("location")?.replace(app.url, "ORIGIN") || null,
        route,
      ).toBe(old.headers.get("location")?.replace(oldUrl, "ORIGIN") || null);
      if (
        old.status !== 404 &&
        old.headers.get("content-type")?.includes("application/json")
      ) {
        const normalize = (data: unknown, origin: string) =>
          JSON.parse(
            JSON.stringify(data)
              .replaceAll(origin, "ORIGIN")
              .replaceAll("::ffff:127.0.0.1", "127.0.0.1"),
          );
        expect(normalize(await next.json(), app.url), route).toEqual(
          normalize(await old.json(), oldUrl),
        );
      }
    }
  } finally {
    await app.stop();
    await stop(legacy);
    config.remove();
    await redis.stop();
  }
});
