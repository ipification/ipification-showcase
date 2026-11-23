import qs from "qs";
import type { ServerClient } from "@/config/load";
import type { AuthServer } from "@/shared/contracts";
/**
 * Builds the authorization URL that starts the selected provider flow.
 *
 * @param options - Saved client/server and attempt details used in provider parameters.
 * @returns The provider authorization endpoint with its query parameters.
 */
export function buildAuthorizationUrl({
  client,
  baseUrl,
  userFlow,
  server,
  realm,
  state,
  nonce,
  phone,
  appEnv = process.env.APP_ENV || "development",
}: {
  client: ServerClient;
  baseUrl: string;
  userFlow: string;
  server: AuthServer;
  realm: string;
  state: unknown;
  nonce: string;
  phone?: unknown;
  appEnv?: string;
}) {
  // Build the authorization request from saved attempt details; callback URI must match code exchange.
  // These are provider parameters; /auth/prepare and /auth/status belong to this demo.
  // Keep the callback URI identical when exchanging the authorization code.
  const params: Record<string, unknown> = {
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: `${baseUrl}/auth/callback/${userFlow}/${server.id}`,
    scope: client.scope,
    state,
    nonce,
    ui_locales: "en",
    consent_id: process.env.CONSENT_ID,
    consent_timestamp: Math.floor(Date.now() / 1000),
    env: appEnv,
  };
  if (client.channel) params.channel = client.channel;
  if (phone) params.login_hint = phone;
  const authorizationEndpoint =
    userFlow === "pvn_ipificator"
      ? "https://ipificator.ipification.com/api"
      : `${server.url}/realms/${realm}/protocol/openid-connect/auth`;
  return `${authorizationEndpoint}?${qs.stringify(params)}`;
}
