import { randomBytes } from "node:crypto";
import { validState } from "@/shared/server/storage/auth-state";
import { AUTH_ATTEMPT_MS } from "./attempts";
// Separate random cookies bind the initiating browser and the callback browser
// to one state. Only their hashes are stored in the server-side attempt.
/**
 * Creates a cryptographically random token used to bind a browser to an attempt.
 *
 * @returns 32 random bytes encoded as lowercase hexadecimal.
 */
export const newBinding = () => randomBytes(32).toString("hex");

/**
 * Builds the unique cookie name for one attempt and browser role.
 *
 * @param kind - `owner` for the initiating browser or `callback` for the browser sent to the provider.
 * @param state - The authorization attempt state used to isolate this cookie.
 * @returns The cookie name associated with that attempt and role.
 */
function name(kind: "owner" | "callback", state: string) {
  return `showcase_oauth_${kind}_${state}`;
}
/**
 * Reads a single valid binding cookie for an authorization attempt.
 *
 * @param request - The incoming request containing the cookie header.
 * @param kind - Whether to read the owner or callback browser binding.
 * @param state - The attempt state used to find the corresponding cookie.
 * @returns The 32-byte random token as hex, or an empty string if absent or invalid.
 */
export function authBinding(
  request: Request,
  kind: "owner" | "callback",
  state: unknown,
) {
  // Cookie names are tied to a valid attempt state so unrelated attempts cannot share a binding.
  if (!validState(state)) return "";
  const matches = (request.headers.get("cookie") || "")
    .split(";")
    .map((value) => value.trim())
    .filter((value) => value.startsWith(name(kind, state) + "="));
  if (matches.length !== 1) return "";
  const value = matches[0].slice(name(kind, state).length + 1);
  return /^[a-f0-9]{64}$/.test(value) ? value : "";
}
/**
 * Adds, refreshes, or clears the attempt binding cookie on an HTTP response.
 *
 * @param response - The response that should carry the `Set-Cookie` header.
 * @param kind - The owner or callback browser role for this binding.
 * @param state - The attempt state used to name the cookie.
 * @param value - A random binding token, or an empty string to remove the cookie.
 * @param origin - The expected Showcase origin used to set cookie security options.
 * @param clear - When true, expire the cookie instead of setting its value.
 * @param lifetimeMs - Optional cookie lifetime in milliseconds.
 * @returns The same response with the matching `Set-Cookie` header, or unchanged for invalid state.
 */
export function setAuthBinding(
  response: Response,
  kind: "owner" | "callback",
  state: string,
  value: string,
  origin: string,
  clear = false,
  lifetimeMs = AUTH_ATTEMPT_MS,
) {
  // Set or clear an HttpOnly, origin-bound cookie for the owner or callback browser.
  if (!validState(state)) return response;
  const path = kind === "owner" ? "/auth" : "/auth/callback";
  response.headers.append(
    "Set-Cookie",
    `${name(kind, state)}=${clear ? "" : value}; HttpOnly; SameSite=Lax; Path=${path}; Max-Age=${clear ? 0 : lifetimeMs / 1000}${origin.startsWith("https:") ? "; Secure" : ""}`,
  );
  return response;
}
