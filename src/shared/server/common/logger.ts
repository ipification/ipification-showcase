import pino from "pino";

const appEnvironment = (process.env.APP_ENV || "development").toLowerCase();
const defaultLogLevel =
  appEnvironment === "stage" || appEnvironment === "development"
    ? "debug"
    : "info";
const sensitiveParameterName =
  appEnvironment === "stage"
    ? /authorization|cookie|password|secret|token|credential|nonce|pin|session/i
    : /authorization|cookie|password|secret|token|credential|nonce|code|state|phone|mobile|msisdn|otp|pin|session/i;

const apiLogContexts = new WeakMap<Request, Record<string, unknown>>();

/** Add allow-listed business context to the access log for this API request. */
export function addApiLogContext(
  request: Request,
  fields: Record<string, unknown>,
) {
  apiLogContexts.set(request, {
    ...apiLogContexts.get(request),
    ...fields,
  });
}

/** Take and clear the context after the HTTP handler has completed. */
export function takeApiLogContext(request: Request) {
  const fields = apiLogContexts.get(request) || {};
  apiLogContexts.delete(request);
  return fields;
}

/** Redact sensitive values and bound nested user-controlled request data. */
export function sanitizeLogValue(value: unknown, name = ""): unknown {
  if (sensitiveParameterName.test(name)) return "[REDACTED]";
  if (Array.isArray(value))
    return value.slice(0, 20).map((item) => sanitizeLogValue(item));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 50)
        .map(([key, item]) => [key, sanitizeLogValue(item, key)]),
    );
  if (typeof value === "string" && value.length > 256)
    return `${value.slice(0, 256)}…`;
  return value;
}

// LOG_LEVEL overrides the APP_ENV default: stage/development use debug,
// while production and unknown environments use info.
export const logger = pino({
  level: process.env.LOG_LEVEL?.trim().toLowerCase() || defaultLogLevel,
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  base: undefined,
});
