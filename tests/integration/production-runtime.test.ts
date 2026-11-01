import { test, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";
import path from "node:path";
import { freePort } from "../helpers/processes";
import { configFixture } from "../helpers/config";
const command = promisify(execFile);
test.runIf(!!process.env.TEST_DOCKER_IMAGE)(
  "Docker runs as non-root with runtime config, supports recreate and has no baked private JSON",
  async () => {
    const id = "showcase-smoke-" + randomUUID().slice(0, 8),
      network = id + "-net",
      redis = id + "-redis",
      app = id + "-app";
    const config = configFixture();
    const filename = path.join(config.dir, "default.json");
    chmodSync(filename, 0o644);
    const port = await freePort();
    const docker = (...args: string[]) =>
      command("docker", args, { timeout: 120000 });
    const args = [
      "run",
      "--rm",
      "-d",
      "--network",
      network,
      "--name",
      app,
      "-p",
      `127.0.0.1:${port}:3002`,
      "-e",
      "NODE_ENV=production",
      "-e",
      "NODE_CONFIG_DIR=/run/showcase-config",
      "-e",
      `REDIS_URL=redis://${redis}:6379`,
      "--mount",
      `type=bind,source=${filename},target=/run/showcase-config/default.json,readonly`,
      process.env.TEST_DOCKER_IMAGE!,
    ];
    async function ready() {
      for (let i = 0; i < 120; i++) {
        try {
          const r = await fetch(`http://127.0.0.1:${port}/health/ready`);
          if (r.ok) return;
        } catch {}
        await new Promise((r) => setTimeout(r, 250));
      }
      throw new Error((await docker("logs", app)).stdout);
    }
    try {
      await docker("network", "create", network);
      await docker(
        "run",
        "--rm",
        "-d",
        "--network",
        network,
        "--name",
        redis,
        "redis:7.4.7-alpine",
      );
      await docker(...args);
      await ready();
      expect((await docker("exec", app, "id", "-u")).stdout.trim()).not.toBe(
        "0",
      );
      expect(
        (
          await docker(
            "exec",
            app,
            "node",
            "-e",
            "console.log(require('node:fs').existsSync('/usr/app/config/default.json'))",
          )
        ).stdout.trim(),
      ).toBe("false");
      const response = await fetch(`http://127.0.0.1:${port}/api/config`);
      const publicConfig = await response.json();
      expect(publicConfig.realm).toBe("demo");
      expect(JSON.stringify(publicConfig)).not.toContain("fixture-secret");
      await docker("stop", "-t", "10", app);
      writeFileSync(
        filename,
        JSON.stringify({ ...config.data, realm: "changed-runtime" }),
      );
      await docker(...args);
      await ready();
      expect(
        (await (await fetch(`http://127.0.0.1:${port}/api/config`)).json())
          .realm,
      ).toBe("changed-runtime");
    } finally {
      await docker("rm", "-f", app).catch(() => {});
      await docker("rm", "-f", redis).catch(() => {});
      await docker("network", "rm", network).catch(() => {});
      config.remove();
    }
  },
  120000,
);
