import { test, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const fixture = {
  realm: "demo",
  client_id: "root",
  client_secret: "fixture-secret",
  auth_servers: [{ id: "stage", url: "https://provider.invalid" }],
  clients: [
    { user_flow: "pvn_ip", scope: "openid", client_id: "", client_secret: "" },
  ],
  locale: { tabs: { pnv: "Custom" } },
};
test("runtime config loads mounted JSON, stage overlays and packaged defaults independently of cwd", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "showcase-config-"));
  try {
    writeFileSync(path.join(dir, "default.json"), JSON.stringify(fixture));
    writeFileSync(
      path.join(dir, "stage.json"),
      JSON.stringify({ clients: [{ user_flow: "login_ip", scope: "openid" }] }),
    );
    const entry = path.resolve("runtime/config.mjs");
    const script = `import {initializeConfigEnvironment,loadRuntimeConfig} from ${JSON.stringify("file://" + entry)};initializeConfigEnvironment({appRoot:${JSON.stringify(process.cwd())},dev:false});let c=loadRuntimeConfig();console.log(JSON.stringify({flow:c.clients[0].user_flow,id:c.clients[0].client_id,count:c.clients.length,pnv:c.locale.tabs.pnv,login:c.locale.tabs.login,version:c.app_config.config_version,frozen:Object.isFrozen(c)}));`;
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", script],
      {
        cwd: tmpdir(),
        env: {
          ...process.env,
          NODE_CONFIG_DIR: dir,
          NODE_CONFIG_ENV: "stage",
          APP_ENV: "stage",
          NODE_ENV: "production",
        },
        encoding: "utf8",
      },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual({
      flow: "login_ip",
      id: "root",
      count: 1,
      pnv: "Custom",
      login: "Login",
      version: "1.0.0",
      frozen: true,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
