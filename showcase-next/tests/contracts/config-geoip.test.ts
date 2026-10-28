import { test, expect } from "vitest";
import { startApp } from "../helpers/processes";
import { configFixture } from "../helpers/config";
test("mounted configuration is redacted and geoip retains fallback country", async () => {
  const config = configFixture({ default_country_code: "vn" });
  const app = await startApp({
    NODE_CONFIG_DIR: config.dir,
    APP_ORIGIN: "https://canonical.example",
  });
  try {
    const r = await fetch(app.url + "/api/config");
    expect(
      r.status,
      r.status === 200 ? "" : (await r.text()) + app.output(),
    ).toBe(200);
    const data = await r.json();
    expect(data.version).toBe("1.2.17-SNAPSHOT");
    expect(data.clients[0].client_id).toBe("fixture-client");
    expect(data.clients[0].redirect_uri).toBe(
      "https://canonical.example/auth/callback/pvn_ip",
    );
    expect(JSON.stringify(data)).not.toContain("fixture-secret");
    const geo = await (await fetch(app.url + "/api/geoip")).json();
    expect(geo.country).toBe("vn");
  } finally {
    await app.stop();
    config.remove();
  }
});

for (const hops of [0, 1]) {
  test(`actual Next server only trusts forwarded origin and IP with TRUST_PROXY_HOPS=${hops}`, async () => {
    const config = configFixture();
    const app = await startApp({
      NODE_CONFIG_DIR: config.dir,
      APP_ORIGIN: "",
      TRUST_PROXY_HOPS: String(hops),
    });
    const headers = {
      "x-forwarded-proto": "https",
      "x-forwarded-host": "forwarded.example",
      "x-forwarded-for": "203.0.113.7",
      "x-showcase-peer-ip": "198.51.100.9",
    };
    try {
      const data = await (
        await fetch(app.url + "/api/config", { headers })
      ).json();
      expect(data.clients[0].redirect_uri).toBe(
        `${hops ? "https://forwarded.example" : app.url}/auth/callback/pvn_ip`,
      );
      const geo = await (
        await fetch(app.url + "/api/geoip", { headers })
      ).json();
      expect(geo.ip).toBe(hops ? "203.0.113.7" : "127.0.0.1");
    } finally {
      await app.stop();
      config.remove();
    }
  });
}
