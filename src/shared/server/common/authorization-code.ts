import type { AuthServer } from "@/shared/contracts";
import { exchangeCodeAndGetUserInfo } from "./http-client";

export async function exchangeAuthorizationCode({
  server,
  realm,
  clientId,
  clientSecret,
  redirectUri,
  code,
  browser,
}: {
  server: AuthServer;
  realm: string;
  clientId: string;
  clientSecret: string;
  redirectUri: unknown;
  code: unknown;
  browser?: { state: string; nonce: string };
}) {
  const root = `${server.url}/realms/${realm}/protocol/openid-connect`;
  // The server exchanges the authorization code, then uses its token for user info.
  return exchangeCodeAndGetUserInfo(
    root + "/token",
    root + "/userinfo",
    {
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
    },
    browser ? { ...browser, jwksUri: root + "/certs" } : undefined,
  );
}
