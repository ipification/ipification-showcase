import { expect, it, vi } from "vitest";
import { createApp } from "@/app";
import { getConfig } from "@/config/load";

vi.mock("@/config/load", () => ({ getConfig: vi.fn(() => ({})) }));
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
    expect(health.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(health.headers.get("x-content-type-options")).toBe("nosniff");
    expect(health.headers.get("referrer-policy")).toBe("no-referrer");
    expect(health.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    for (const asset of ["qr", "sms", "sim"]) {
      const script = await fetch(`${base}/js/${asset}.js`);
      expect(script.status).toBe(200);
      expect(script.headers.get("content-type")).toMatch(/javascript/);
      expect(await script.text()).not.toBe("");
      expect((await fetch(`${base}/js/flows/${asset}.js`)).status).toBe(200);
    }
    const ready = await fetch(`${base}/health/ready`);
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status: "ready" });
    vi.mocked(getConfig).mockImplementationOnce(() => {
      throw new Error("invalid configuration");
    });
    const unavailable = await fetch(`${base}/health/ready`);
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ status: "unavailable" });
    const root = await fetch(base, { redirect: "manual" });
    expect(root.status).toBe(302);
    expect(root.headers.get("location")).toBe("/auth/login");
  } finally {
    server.close();
  }
});
