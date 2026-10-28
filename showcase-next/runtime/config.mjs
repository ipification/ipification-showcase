import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
let appRoot =
  process.env.SHOWCASE_APP_ROOT ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(appRoot, "package.json"));
let snapshot;
export function initializeConfigEnvironment({
  appRoot: root = appRoot,
  dev = process.env.NODE_ENV !== "production",
} = {}) {
  appRoot = root;
  process.env.SHOWCASE_APP_ROOT = appRoot;
  nextEnv.loadEnvConfig(appRoot, dev);
  process.env.APP_ENV ||= dev ? "development" : "production";
  process.env.NODE_CONFIG_ENV ||= process.env.APP_ENV;
  process.env.SHOWCASE_KEY_PREFIX ||= `showcase-next:${process.env.APP_ENV}:`;
  process.env.NODE_CONFIG_DIR = (
    process.env.NODE_CONFIG_DIR || path.join(appRoot, "config")
  )
    .split(path.delimiter)
    .map((p) => path.resolve(appRoot, p))
    .join(path.delimiter);
}
export function deepMerge(target, source) {
  const out = { ...target };
  for (const [k, v] of Object.entries(source || {})) {
    if (["__proto__", "prototype", "constructor"].includes(k)) continue;
    out[k] =
      v && typeof v === "object" && !Array.isArray(v)
        ? deepMerge(out[k] && typeof out[k] === "object" ? out[k] : {}, v)
        : v;
  }
  return out;
}
function freeze(value) {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) freeze(v);
    Object.freeze(value);
  }
  return value;
}
export class ConfigurationError extends Error {
  constructor(field) {
    super(`INVALID_CONFIG:${field}`);
    this.name = "ConfigurationError";
  }
}
export function validateFeatureEnvironment() {
  if (process.env.PLAY_INTEGRITY_ENABLED === "true")
    for (const name of [
      "PLAY_INTEGRITY_PACKAGE_NAME",
      "PLAY_INTEGRITY_USER_FLOW",
      "PLAY_INTEGRITY_STATE_SECRET",
      "PLAY_INTEGRITY_STATE_ISSUER",
      "PLAY_INTEGRITY_STATE_AUDIENCE",
    ])
      if (!process.env[name]) throw new ConfigurationError(name);
}
export function loadRuntimeConfig() {
  if (snapshot) return snapshot;
  let raw;
  try {
    raw = require("config").util.toObject();
  } catch {
    throw new ConfigurationError("json");
  }
  for (const key of ["realm", "client_id", "client_secret"])
    if (typeof raw[key] !== "string" || !raw[key])
      throw new ConfigurationError(key);
  for (const key of ["auth_servers", "clients"])
    if (!Array.isArray(raw[key]) || !raw[key].length)
      throw new ConfigurationError(key);
  const ids = new Set();
  for (const server of raw.auth_servers) {
    if (typeof server.id !== "string" || !server.id || ids.has(server.id))
      throw new ConfigurationError("auth_servers.id");
    try {
      new URL(server.url);
    } catch {
      throw new ConfigurationError("auth_servers.url");
    }
    ids.add(server.id);
  }
  const flows = new Set();
  for (const c of raw.clients) {
    if (
      typeof c.user_flow !== "string" ||
      !c.user_flow ||
      flows.has(c.user_flow) ||
      typeof c.scope !== "string" ||
      !c.scope
    )
      throw new ConfigurationError("clients");
    flows.add(c.user_flow);
  }
  if (process.env.NODE_ENV === "production" && !process.env.APP_ORIGIN)
    throw new ConfigurationError("APP_ORIGIN");
  if (process.env.APP_ORIGIN) {
    try {
      const u = new URL(process.env.APP_ORIGIN);
      if (
        !["http:", "https:"].includes(u.protocol) ||
        u.username ||
        u.password ||
        u.search ||
        u.hash ||
        u.pathname !== "/"
      )
        throw 0;
    } catch {
      throw new ConfigurationError("APP_ORIGIN");
    }
  }
  validateFeatureEnvironment();
  const locale = JSON.parse(
    readFileSync(path.join(appRoot, "config/locale.json"), "utf8"),
  );
  const appConfig = JSON.parse(
    readFileSync(path.join(appRoot, "config/app_config.json"), "utf8"),
  );
  snapshot = freeze({
    ...raw,
    clients: raw.clients.map((c) => ({
      ...c,
      client_id: c.client_id || raw.client_id,
      client_secret: c.client_secret || raw.client_secret,
    })),
    locale: deepMerge(locale, raw.locale),
    app_config: deepMerge(appConfig, raw.app_config),
  });
  return snapshot;
}
