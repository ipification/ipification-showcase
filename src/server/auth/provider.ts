import { randomUUID } from "node:crypto";
import qs from "qs";
import type { ServerClient } from "@/server/config/load";
import type { AuthServer } from "@/shared/contracts";
import { exchangeCodeAndGetUserInfo } from "@/server/shared/http-client";
export function buildAuthorizationUrl({
  client,
  baseUrl,
  userFlow,
  server,
  realm,
  state,
  phone,
  appEnv = process.env.APP_ENV || "development",
}: {
  client: ServerClient;
  baseUrl: string;
  userFlow: string;
  server: AuthServer;
  realm: string;
  state: unknown;
  phone?: unknown;
  appEnv?: string;
}) {
  // Provider authorization parameters: state identifies the prepared attempt;
  // login_hint carries the phone only for flows that collect one.
  // The callback URI must be the same when the backend exchanges the code.
  // /auth/prepare and /auth/status are showcase endpoints, not provider APIs.
  const params: Record<string, unknown> = {
    response_type: "code",
    client_id: client.client_id,
    redirect_uri: `${baseUrl}/auth/callback/${userFlow}/${server.id}`,
    scope: client.scope,
    state,
    nonce: randomUUID(),
    ui_locales: "en",
    consent_id: process.env.CONSENT_ID,
    consent_timestamp: Math.floor(Date.now() / 1000),
    env: appEnv,
  };
  if (client.channel) params.channel = client.channel;
  if (phone) params.login_hint = phone;
  // IP via App uses the IPificator endpoint; other browser flows use the configured server.
  const authorizationEndpoint =
    userFlow === "pvn_ipificator"
      ? "https://ipificator.ipification.com/api"
      : `${server.url}/realms/${realm}/protocol/openid-connect/auth`;
  return `${authorizationEndpoint}?${qs.stringify(params)}`;
}
export async function exchangeAuthorizationCode({
  server,
  realm,
  clientId,
  clientSecret,
  redirectUri,
  code,
}: {
  server: AuthServer;
  realm: string;
  clientId: string;
  clientSecret: string;
  redirectUri: unknown;
  code: unknown;
}) {
  const root = `${server.url}/realms/${realm}/protocol/openid-connect`;
  // Exchange the one-use code on the backend; never expose the client secret to the browser.
  return exchangeCodeAndGetUserInfo(root + "/token", root + "/userinfo", {
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
  });
}
