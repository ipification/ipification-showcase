import { exchangeAuthorizationCode } from "@/shared/server/common/authorization-code";
import type { ServiceContext } from "@/shared/server/common/context";
import { resolveClient, resolveServer } from "@/shared/server/common/errors";

export const decodeMobile = (input: Record<string, unknown>) => ({
  client_id: input.client_id,
  server_id: input.server_id,
  code: input.code,
  redirect_uri: input.redirect_uri,
});

export async function exchangeMobileAuthorizationCode(
  context: ServiceContext,
  input: ReturnType<typeof decodeMobile>,
  exchange = exchangeAuthorizationCode,
) {
  const server = resolveServer(context, input.server_id);
  const client = resolveClient(context, { id: input.client_id });
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
