/**
 * Picks the shared fields accepted by SMS and SIM CIBA endpoints.
 *
 * @param input - Parsed request body.
 * @returns Client/server IDs, hints, scope, operation, code, credential, request ID and nonce.
 */
export const decodeCiba = (input: Record<string, unknown>) => ({
  server_id: input.server_id,
  client_id: input.client_id,
  scope: input.scope,
  login_hint: input.login_hint,
  carrier_hint: input.carrier_hint,
  operation: input.operation,
  auth_req_id: input.auth_req_id,
  vp_token: input.vp_token,
  code: input.code,
  nonce: input.nonce,
});
export type CibaInput = ReturnType<typeof decodeCiba>;
