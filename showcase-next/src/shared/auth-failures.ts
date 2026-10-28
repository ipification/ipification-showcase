export const authFailures = {
  CLIENT_AUTH_FAILED: {
    title: "The application could not sign in",
    description:
      "The authentication provider did not accept this application's credentials.",
    action:
      "Check the client credentials and authentication server configuration, then start a new login. Retrying the same callback link will not fix this configuration error.",
  },
  AUTH_CODE_INVALID: {
    title: "This login link is no longer valid",
    description:
      "The authentication provider rejected the authorization code. It may have expired, already been used, or been issued for a different redirect URL or client.",
    action:
      "Start a new login and use the new verification link or QR code. If this continues, check the registered callback URL and client configuration.",
  },
  TOKEN_REJECTED: {
    title: "The provider could not complete sign-in",
    description:
      "The authentication provider rejected the token request. Its response did not identify a more specific supported cause.",
    action:
      "Start a new login. If the error continues, ask the application administrator to check the client credentials, callback URL and provider configuration.",
  },
  USERINFO_FAILED: {
    title: "We could not load your profile",
    description:
      "The code exchange completed, but the authentication provider could not load your profile.",
    action:
      "Try a new login. If this continues, ask the application administrator to check userinfo access and the requested scopes.",
  },
  PROVIDER_UNAVAILABLE: {
    title: "The authentication service is unavailable",
    description:
      "The authentication provider is temporarily unavailable or could not be reached.",
    action:
      "Wait a moment, then start a new login. Contact the application administrator if the problem continues.",
  },
  AUTH_FAILED: {
    title: "Unable to complete authentication",
    description: "Something went wrong while completing your login.",
    action:
      "Start a new login. If the error continues, share the reference below with the application administrator.",
  },
} as const;
export type AuthFailureReason = keyof typeof authFailures;
export function authFailureReason(value: unknown): AuthFailureReason {
  return typeof value === "string" && Object.hasOwn(authFailures, value)
    ? (value as AuthFailureReason)
    : "AUTH_FAILED";
}
export const providerErrorCodes = new Set([
  "invalid_client",
  "unauthorized_client",
  "invalid_grant",
  "invalid_token",
  "access_denied",
  "invalid_scope",
  "insufficient_scope",
  "server_error",
  "temporarily_unavailable",
]);
export function safeProviderCode(value: unknown) {
  return typeof value === "string" && providerErrorCodes.has(value)
    ? value
    : undefined;
}
