import { expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

test("environment files preserve process precedence and local overrides without variable expansion", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "showcase-env-"));
  try {
    writeFileSync(
      path.join(dir, ".env"),
      "SHOWCASE_TEST_BASE=from-base\nSHOWCASE_TEST_ORDER=base\n",
    );
    writeFileSync(
      path.join(dir, ".env.local"),
      "SHOWCASE_TEST_ORDER=local\nSHOWCASE_TEST_EXPANDED=$SHOWCASE_TEST_BASE\n",
    );
    const module = pathToFileURL(path.resolve("runtime/config.mjs")).href;
    const code = `import { initializeConfigEnvironment } from ${JSON.stringify(module)}; initializeConfigEnvironment({appRoot:${JSON.stringify(dir)},dev:true}); console.log(JSON.stringify({order:process.env.SHOWCASE_TEST_ORDER, literal:process.env.SHOWCASE_TEST_EXPANDED, existing:process.env.SHOWCASE_TEST_EXISTING}));`;
    const child = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", code],
      {
        encoding: "utf8",
        env: { ...process.env, SHOWCASE_TEST_EXISTING: "process" },
      },
    );
    expect(child.status, child.stderr).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual({
      order: "local",
      literal: "$SHOWCASE_TEST_BASE",
      existing: "process",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
