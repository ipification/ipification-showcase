import { expect, test } from "vitest";
import { networkInterfaces } from "node:os";
import { startApp } from "../helpers/processes";
test("Express serves pages, legacy root redirect and not-found", async () => {
  const app = await startApp();
  try {
    const port = new URL(app.url).port;
    const startupLogs = app
      .output()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { msg?: string; url?: string });
    expect(startupLogs).toContainEqual(
      expect.objectContaining({
        url: `http://localhost:${port}/auth/login`,
        msg: "Open Showcase locally",
      }),
    );
    expect(startupLogs).toContainEqual(
      expect.objectContaining({
        msg: "For phone QR authentication, use a Network URL reachable from the phone; localhost points to the phone itself.",
      }),
    );
    const addresses = Object.values(networkInterfaces())
      .flatMap((values) => values || [])
      .filter((entry) => entry.family === "IPv4" && !entry.internal)
      .map((entry) => entry.address);
    for (const address of new Set(addresses))
      expect(startupLogs).toContainEqual(
        expect.objectContaining({
          url: `http://${address}:${port}/auth/login`,
          msg: "Open Showcase from another device on the same network",
        }),
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
