import { test, expect } from "vitest";
import { startApp } from "../helpers/processes";
import { startRedis } from "../helpers/redis";
import { configFixture } from "../helpers/config";

test("HTTP endpoints reject unbound authentication and malformed requests", async () => {
  const redis = await startRedis();
  const config = configFixture();
  const app = await startApp({
    NODE_CONFIG_DIR: config.dir,
    REDIS_URL: redis.url,
    PLAY_INTEGRITY_ENABLED: "false",
  });
  try {
    for (const route of [
      "/auth/callback/missing/stage",
      "/auth/complete?state=missing-parity",
    ]) {
      const response = await fetch(app.url + route, { redirect: "manual" });
      expect(response.status, route).toBe(302);
      expect(response.headers.get("location"), route).toContain(
        "AUTH_STATE_INVALID",
      );
    }
    for (const route of [
      "/auth/s2s/signin",
      "/auth/mobile/login",
      "/sms/auth",
      "/sms/token",
      "/ts43/auth",
      "/ts43/token",
      "/sms/log",
      "/ts43/log",
    ]) {
      for (const body of [
        "{",
        JSON.stringify({ oversized: "x".repeat(102400) }),
      ]) {
        const response = await fetch(app.url + route, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        });
        expect(response.status, `${route}: ${body.length} bytes`).toBe(500);
      }
    }
  } finally {
    await app.stop();
    config.remove();
    await redis.stop();
  }
});
