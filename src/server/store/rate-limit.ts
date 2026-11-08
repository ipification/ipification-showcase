import { createHash } from "node:crypto";
import { memoryStore } from "./memory";
const positive = (name: string, fallback: number) => {
  const n = parseInt(process.env[name] || "", 10);
  return n > 0 ? n : fallback;
};
export async function checkTs43Limit(
  context: { clientIp: string },
  body: Record<string, unknown>,
) {
  const windowMs = positive("TS43_RATE_LIMIT_WINDOW_MS", 60000);
  const identity = createHash("sha256")
    .update(String(body.login_hint || ""))
    .digest("hex");
  const stages = [
    {
      id: "ip:" + context.clientIp,
      limit: positive("TS43_RATE_LIMIT_IP_MAX", 20),
    },
    {
      id: `identity:${body.client_id || ""}:${identity}`,
      limit: positive("TS43_RATE_LIMIT_IDENTITY_MAX", 5),
    },
  ];
  let headers: Record<string, string> = {};
  for (const stage of stages) {
    const key = "rate:" + stage.id;
    const count = (memoryStore.get<number>(key) ?? 0) + 1;
    const ttl = count === 1 ? windowMs : memoryStore.remaining(key);
    memoryStore.set(key, count, ttl);
    const reset = Math.max(1, Math.ceil(ttl / 1000));
    headers = {
      "RateLimit-Policy": `${stage.limit};w=${Math.ceil(windowMs / 1000)}`,
      RateLimit: `limit=${stage.limit}, remaining=${Math.max(0, stage.limit - count)}, reset=${reset}`,
    };
    if (count > stage.limit)
      return {
        allowed: false,
        headers: { ...headers, "Retry-After": String(reset) },
      };
  }
  return { allowed: true, headers };
}
