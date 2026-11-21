import { expect, test } from "vitest";
import { startApp } from "../helpers/processes";
import { configFixture } from "../helpers/config";

test("production server retains state across routes but not across processes or restart", async () => {
  const config = configFixture();
  const a = await startApp({
    NODE_ENV: "production",
    NODE_CONFIG_DIR: config.dir,
  });
  const b = await startApp({
    NODE_ENV: "production",
    NODE_CONFIG_DIR: config.dir,
  });
  try {
    const response = await fetch(a.url + "/auth/prepare", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user_flow: "login_ip", qr: true }),
    });
    expect(response.status).toBe(201);
    const attempt = await response.json();
    const cookie = response.headers.get("set-cookie")!.split(";")[0];
    const read = (url: string) =>
      fetch(url + "/auth/status?state=" + attempt.state, {
        headers: { cookie, host: new URL(a.url).host },
      });
    expect((await read(a.url)).status).toBe(200);
    expect((await read(b.url)).status).not.toBe(200);
    await a.stop();
    const restarted = await startApp({
      NODE_ENV: "production",
      NODE_CONFIG_DIR: config.dir,
      PORT: new URL(a.url).port,
    });
    try {
      expect((await read(restarted.url)).status).not.toBe(200);
    } finally {
      await restarted.stop();
    }
  } finally {
    await a.stop();
    await b.stop();
    config.remove();
  }
});
