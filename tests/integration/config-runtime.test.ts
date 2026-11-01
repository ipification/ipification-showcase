import { test, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { configFixture } from "../helpers/config";
import { tmpdir } from "node:os";
import path from "node:path";
test("config checker validates mounted config without Redis or provider calls", () => {
  const c = configFixture();
  try {
    const run = (dir: string) =>
      spawnSync(process.execPath, [path.resolve("scripts/check-config.mjs")], {
        cwd: tmpdir(),
        env: {
          ...process.env,
          NODE_ENV: "production",
          APP_ENV: "stage",
          NODE_CONFIG_ENV: "stage",
          NODE_CONFIG_DIR: dir,
          REDIS_URL: "redis://127.0.0.1:1",
        },
        encoding: "utf8",
      });
    const good = run(c.dir);
    expect(good.status, good.stderr).toBe(0);
    expect(good.stdout).not.toContain("fixture-secret");
    const bad = run(path.join(c.dir, "missing"));
    expect(bad.status).not.toBe(0);
    expect(bad.stderr).not.toContain("fixture-secret");
  } finally {
    c.remove();
  }
});
