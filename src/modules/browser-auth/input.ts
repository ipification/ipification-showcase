/**
 * Copies supported start fields from a parsed query object.
 *
 * @param input - Parsed `/auth/start` query fields.
 * @returns The known flow, server, state and optional phone values.
 * @remarks Leaves provider-owned values unchanged to preserve existing acceptance behavior.
 */
export const decodeStart = (input: Record<string, unknown>) => ({
  user_flow: input.user_flow,
  server_id: input.server_id,
  state: input.state,
  phone: input.phone,
});
/**
 * Copies supported fields from the authorization server's callback query.
 *
 * @param input - Parsed callback query fields.
 * @returns The authorization code, state, and optional provider error fields.
 */
export const decodeCallback = (input: Record<string, unknown>) => ({
  code: input.code,
  state: input.state,
  error: input.error,
  error_description: input.error_description,
});
export type StartInput = ReturnType<typeof decodeStart>;
/**
 * Reads the prepare request fields, including the Showcase QR option.
 *
 * @param input - Parsed JSON body from `POST /auth/prepare`.
 * @returns The supported start fields plus the QR choice.
 */
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
