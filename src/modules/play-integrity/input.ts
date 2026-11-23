/** @module Play Integrity operations */

/**
 * Server-side operation selected by a Play Integrity route.
 */
export type IntegrityEndpoint = "attempt" | "verify" | "token-exchange";
export interface CreateAttemptInput {
  kind: "attempt";
  phoneNumber: string;
  serverId: string;
}
export interface VerifyAttemptInput {
  kind: "verify";
  attemptId: string;
  token: string;
}
export interface ExchangeCodeInput {
  kind: "exchange";
  code: string;
  state: string;
}
export type IntegrityInput =
  CreateAttemptInput | VerifyAttemptInput | ExchangeCodeInput;
/** Returns true only for a non-empty string field from an untrusted request. */
const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
/**
 * Decodes an endpoint body into the matching internal operation.
 *
 * @param endpoint - Operation selected by the HTTP route.
 * @param body - Parsed JSON fields supplied by the client.
 * @returns A typed operation input, or `undefined` when required fields are invalid.
 * @internal
 */
export function decodeIntegrity(
  endpoint: IntegrityEndpoint,
  body: Record<string, unknown>,
): IntegrityInput | undefined {
  // Keep HTTP snake_case at the boundary; services receive one discriminated input shape.
  if (endpoint === "attempt")
    return nonempty(body.phone_number) && nonempty(body.server_id)
      ? {
          kind: "attempt",
          phoneNumber: body.phone_number,
          serverId: body.server_id,
        }
      : undefined;
  if (endpoint === "verify")
    return nonempty(body.attempt_id) && nonempty(body.integrity_token)
      ? {
          kind: "verify",
          attemptId: body.attempt_id,
          token: body.integrity_token,
        }
      : undefined;
  return nonempty(body.code) &&
    nonempty(body.state) &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(body.state)
    ? { kind: "exchange", code: body.code, state: body.state }
    : undefined;
}
