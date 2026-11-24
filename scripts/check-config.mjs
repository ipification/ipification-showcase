import { fileURLToPath } from "node:url";
import {
  initializeConfigEnvironment,
  loadRuntimeConfig,
  ConfigurationError,
} from "../runtime/config.mjs";
try {
  initializeConfigEnvironment({
    appRoot: fileURLToPath(new URL("..", import.meta.url)),
    dev: process.env.NODE_ENV !== "production",
  });
  loadRuntimeConfig();
  console.log("Configuration valid");
} catch (error) {
  console.error(
    error instanceof ConfigurationError ? error.message : "INVALID_CONFIG",
  );
  process.exitCode = 1;
}
