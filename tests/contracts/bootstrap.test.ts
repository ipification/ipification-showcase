import { expect, test } from "vitest";
import { request } from "node:http";
import { randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
function upgradeStatus(base: string, origin: string): Promise<number> {
  return new Promise((resolve) => {
    const req = request(base + "/_next/hmr", {
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": randomBytes(16).toString("base64"),
        Origin: origin,
      },
    });
    const timer = setTimeout(() => {
      req.destroy();
      resolve(0);
    }, 5000);
    req.once("upgrade", (res, socket) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(res.statusCode || 0);
    });
    req.once("response", (res) => {
      clearTimeout(timer);
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.once("error", () => {
      clearTimeout(timer);
      resolve(0);
    });
    req.end();
  });
}
import { startApp } from "../helpers/processes";
test("custom server serves Next pages, legacy root redirect and not-found", async () => {
  const app = await startApp();
  try {
    const port = new URL(app.url).port;
    expect(app.output()).toContain(
      `Local: http://localhost:${port}/auth/login`,
    );
    expect(app.output()).toContain(
      "For QR authentication from your phone, open a Network URL on your computer",
    );
    const addresses = Object.values(networkInterfaces())
      .flatMap((values) => values || [])
      .filter((entry) => entry.family === "IPv4" && !entry.internal)
      .map((entry) => entry.address);
    for (const address of new Set(addresses))
      expect(app.output()).toContain(
        `Network: http://${address}:${port}/auth/login`,
      );
    const root = await fetch(app.url, { redirect: "manual" });
    expect(root.status).toBe(302);
    expect(root.headers.get("location")).toBe("/auth/login");
    const login = await fetch(app.url + "/auth/login");
    expect(login.status).toBe(200);
    expect(login.headers.get("content-type")).toContain("text/html");
    expect((await fetch(app.url + "/missing-page")).status).toBe(404);
    expect(
      (await fetch(app.url + "/socket.io/?EIO=4&transport=polling")).status,
    ).toBe(404);
    // Dev hydration needs the HMR socket even when opened by IP from a phone.
    const localHosts = new Set([
      "127.0.0.1",
      ...Object.values(networkInterfaces())
        .flatMap((addresses) => addresses || [])
        .filter((address) => address.family === "IPv4")
        .map((address) => address.address),
    ]);
    for (const host of localHosts) {
      expect(await upgradeStatus(app.url, `http://${host}:3002`), host).toBe(
        101,
      );
    }
    expect(await upgradeStatus(app.url, "https://untrusted.example")).not.toBe(
      101,
    );
  } finally {
    await app.stop();
  }
});
