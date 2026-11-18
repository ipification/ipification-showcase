import { expect, test } from "vitest";
import { networkInterfaces } from "node:os";
import { startApp } from "../helpers/processes";
test("Express serves pages, legacy root redirect and not-found", async () => {
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
  } finally {
    await app.stop();
  }
});
