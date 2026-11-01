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
