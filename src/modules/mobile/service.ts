import { exchangeAuthorizationCode } from "@/shared/server/common/authorization-code";
import type { ServiceContext } from "@/shared/server/common/context";
import { resolveClient, resolveServer } from "@/shared/server/common/errors";

/**
 * Picks the fields accepted by the mobile authorization-code endpoint.
 *
 * @param input - Parsed JSON request body.
 * @returns Client, server, code and redirect URI values for exchange.
 */
export const decodeMobile = (input: Record<string, unknown>) => ({
  client_id: input.client_id,
  server_id: input.server_id,
  code: input.code,
  redirect_uri: input.redirect_uri,
});

/**
 * Resolves the configured target and exchanges a mobile authorization code.
 *
 * @param context - Resolved Showcase config and request origin.
 * @param input - Client/server IDs, code and registered redirect URI.
 * @param exchange - Authorization-code exchange adapter; defaults to the shared OIDC exchange.
 * @returns The selected authorization server and provider user claims.
 */
export async function exchangeMobileAuthorizationCode(
  context: ServiceContext,
  input: ReturnType<typeof decodeMobile>,
  exchange = exchangeAuthorizationCode,
) {
  // Resolve the selected provider/client before exchanging the code.
  const server = resolveServer(context, input.server_id);
  const client = resolveClient(context, { id: input.client_id });
  // Use the exact redirect URI supplied by the mobile client when exchanging its code.
  const { userInfo } = await exchange({
    server,
    realm: context.config.realm,
    clientId: client.client_id,
    clientSecret: client.client_secret,
    redirectUri: input.redirect_uri,
    code: input.code,
  });
  return { server, userInfo };
}
