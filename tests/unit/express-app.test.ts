import { expect, it } from "vitest";
import { createApp } from "@/server/express/app";
it("serves the existing health and root redirect contracts with security headers", async () => {
  const server = createApp().listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("missing address");
    const base = `http://127.0.0.1:${address.port}`;
    const health = await fetch(`${base}/health/live`);
    expect(await health.json()).toEqual({ status: "live" });
    expect(health.headers.get("cache-control")).toBe("no-store");
    expect(health.headers.get("x-content-type-options")).toBe("nosniff");
    expect(health.headers.get("referrer-policy")).toBe("no-referrer");
    expect(health.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    const ready = await fetch(`${base}/health/ready`);
    expect(ready.status).toBe(503);
    expect(await ready.json()).toEqual({ status: "unavailable" });
    const root = await fetch(base, { redirect: "manual" });
    expect(root.status).toBe(302);
    expect(root.headers.get("location")).toBe("/auth/login");
  } finally {
    server.close();
  }
});
