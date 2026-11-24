import crypto from "node:crypto";

function canonicalJson(value: any) {
  return serialize(value, new Set());
}

function serialize(value: any, ancestors: Set<any>): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value))
        throw new TypeError("numbers must be finite");
      return JSON.stringify(value);
    case "undefined":
    case "function":
    case "symbol":
    case "bigint":
      throw new TypeError(`unsupported value type: ${typeof value}`);
    case "object":
      break;
    default:
      throw new TypeError(`unsupported value type: ${typeof value}`);
  }

  if (ancestors.has(value))
    throw new TypeError("cannot serialize circular structures");
  ancestors.add(value);
  let result;

  if (Array.isArray(value)) {
    const items = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) {
        throw new TypeError("unsupported undefined array element");
      }
      items.push(serialize(value[index], ancestors));
    }
    result = `[${items.join(",")}]`;
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("value must contain only plain objects");
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError("symbols are not supported");
    }
    const keys = Object.keys(value).sort();
    result = `{${keys.map((key) => `${JSON.stringify(key)}:${serialize(value[key], ancestors)}`).join(",")}}`;
  }

  ancestors.delete(value);
  return result;
}

function createRequestHash(action: string, payload: any) {
  if (typeof action !== "string" || action.length === 0) {
    throw new TypeError("action must be a non-empty string");
  }
  return crypto
    .createHash("sha256")
    .update(`${action}\n${canonicalJson(payload)}`, "utf8")
    .digest("base64url");
}

export { canonicalJson, createRequestHash };
