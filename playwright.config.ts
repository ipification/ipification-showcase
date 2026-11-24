import { defineConfig, devices } from "@playwright/test";
const port = process.env.E2E_PORT || "3002";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer:
    process.env.E2E_REUSE_SERVER === "1"
      ? undefined
      : {
          command: "node tests/helpers/e2e-server.mjs",
          url: `http://127.0.0.1:${port}/auth/login`,
          reuseExistingServer: false,
          timeout: 120000,
        },
});
