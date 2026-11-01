export class BodyParseError extends Error {
  constructor() {
    super("INVALID_REQUEST");
  }
}
export async function readBody(
  request: Request,
  limitBytes = 102400,
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type")?.split(";")[0].trim();
  if (
    contentType !== "application/json" &&
    contentType !== "application/x-www-form-urlencoded"
  )
    return {};
  const reader = request.body?.getReader();
  if (!reader) return {};
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limitBytes) {
        await reader.cancel();
        throw new BodyParseError();
      }
      parts.push(value);
    }
    const text = Buffer.concat(parts).toString("utf8");
    if (!text) return {};
    if (contentType === "application/json") {
      const value = JSON.parse(text);
      if (!value || typeof value !== "object") throw 0;
      return value;
    }
    const result: Record<string, unknown> = Object.create(null);
    for (const [k, v] of new URLSearchParams(text)) {
      if (["__proto__", "constructor", "prototype"].includes(k)) continue;
      result[k] =
        result[k] === undefined
          ? v
          : Array.isArray(result[k])
            ? [...result[k], v]
            : [result[k], v];
    }
    return result;
  } catch {
    throw new BodyParseError();
  } finally {
    reader.releaseLock();
  }
}
export function query(request: Request): Record<string, unknown> {
  const params = new URL(request.url).searchParams;
  const result: Record<string, unknown> = Object.create(null);
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    result[key] = values.length === 1 ? values[0] : values;
  }
  return result;
}
