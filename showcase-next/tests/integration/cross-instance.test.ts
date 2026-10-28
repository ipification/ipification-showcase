import { test, expect } from "vitest";
import { io } from "socket.io-client";
import { startApp, freePort } from "../helpers/processes";
import { startRedis } from "../helpers/redis";
import { startProvider } from "../helpers/provider";
import { configFixture } from "../helpers/config";
test("production callback on B notifies A and completion session is readable on either process", async () => {
  const redis = await startRedis(),
    provider = await startProvider();
  const config = configFixture({
    auth_servers: [{ id: "stage", url: provider.url }],
  });
  const portA = await freePort(),
    portB = await freePort();
  const env = {
    NODE_ENV: "production",
    NODE_CONFIG_DIR: config.dir,
    APP_ORIGIN: `http://127.0.0.1:${portA}`,
    REDIS_URL: redis.url,
    SHOWCASE_KEY_PREFIX: "cross-instance:",
  };
  const a = await startApp({ ...env, PORT: String(portA) }),
    b = await startApp({ ...env, PORT: String(portB) });
  const client = io(a.url, { transports: ["websocket"] });
  try {
    await new Promise<void>((r) => client.on("connect", () => r()));
    await new Promise<void>((r) =>
      client.emit("init", { state: "cross-qrcode" }, () => r()),
    );
    const notification = new Promise<any>((r) =>
      client.on("messages", (m) => {
        if (m.event_name === "url") r(m);
      }),
    );
    const callback = await fetch(
      b.url + "/auth/callback/pvn_ip/stage?code=c&state=cross-qrcode",
      { redirect: "manual" },
    );
    expect(callback.status).toBe(302);
    expect((await notification).url).toBe(
      a.url + "/auth/complete?state=cross-qrcode",
    );
    const complete = await fetch(a.url + "/auth/complete?state=cross-qrcode", {
      redirect: "manual",
    });
    const cookie = complete.headers.get("set-cookie")!.split(";")[0];
    const result = await fetch(b.url + "/user/info", { headers: { cookie } });
    expect(result.status).toBe(200);
    expect(await result.text()).toContain("+12025550123");
    expect((await fetch(a.url + "/health/ready")).status).toBe(200);
  } finally {
    client.disconnect();
    await a.stop();
    await b.stop();
    config.remove();
    await provider.stop();
    await redis.stop();
  }
});
