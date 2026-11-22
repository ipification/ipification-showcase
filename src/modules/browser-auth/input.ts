/** Decode known fields without tightening legacy acceptance of provider-owned wire values. */
export const decodeStart = (input: Record<string, unknown>) => ({
  user_flow: input.user_flow,
  server_id: input.server_id,
  state: input.state,
  phone: input.phone,
});
export const decodeCallback = (input: Record<string, unknown>) => ({
  code: input.code,
  state: input.state,
  error: input.error,
  error_description: input.error_description,
});
export type StartInput = ReturnType<typeof decodeStart>;
export const decodePrepare = (input: Record<string, unknown>) => ({
  ...decodeStart(input),
  qr: input.qr,
});
export type PrepareInput = ReturnType<typeof decodePrepare>;
export type CallbackInput = ReturnType<typeof decodeCallback> & {
  userFlow: string;
  serverId: string;
  previousSessionId: string;
  backchannel: boolean;
  callbackBinding: string;
};
