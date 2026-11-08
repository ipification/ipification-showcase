import { randomBytes } from "node:crypto";
import { validState, AUTH_ATTEMPT_MS } from "./attempts";
// Separate random cookies bind the initiating browser and the callback browser
// to one state. Only their hashes are stored in the server-side attempt.
export const newBinding = () => randomBytes(32).toString("hex");
function name(kind: "owner" | "callback", state: string) {
  return `showcase_oauth_${kind}_${state}`;
}
export function authBinding(
  request: Request,
  kind: "owner" | "callback",
  state: unknown,
) {
  if (!validState(state)) return "";
  const matches = (request.headers.get("cookie") || "")
    .split(";")
    .map((value) => value.trim())
    .filter((value) => value.startsWith(name(kind, state) + "="));
  if (matches.length !== 1) return "";
  const value = matches[0].slice(name(kind, state).length + 1);
  return /^[a-f0-9]{64}$/.test(value) ? value : "";
}
export function setAuthBinding(
  response: Response,
  kind: "owner" | "callback",
  state: string,
  value: string,
  origin: string,
  clear = false,
  lifetimeMs = AUTH_ATTEMPT_MS,
) {
  if (!validState(state)) return response;
  const path = kind === "owner" ? "/auth" : "/auth/callback";
  response.headers.append(
    "Set-Cookie",
    `${name(kind, state)}=${clear ? "" : value}; HttpOnly; SameSite=Lax; Path=${path}; Max-Age=${clear ? 0 : lifetimeMs / 1000}${origin.startsWith("https:") ? "; Secure" : ""}`,
  );
  return response;
}
