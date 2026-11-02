import "server-only";
import type { ServerConfig } from "./load";
import type {
  PublicConfig,
  PublicShowcaseConfig,
  PublicClient,
} from "@/shared/contracts";
import pkg from "../../../package.json";
export function toPublicConfig(
  config: ServerConfig,
  origin: string,
): PublicConfig {
  // Project only public client fields; configured secrets stay on the server.
  const clients = config.clients.map((client) => {
    const result: PublicClient = {
      user_flow: client.user_flow,
      client_id: client.client_id,
      scope: client.scope,
      redirect_uri: config.auth_servers[0]
        ? `${origin}/auth/callback/${client.user_flow}/${config.auth_servers[0].id}`
        : undefined,
      redirect_uris: Object.fromEntries(
        config.auth_servers.map((server) => [
          server.id,
          `${origin}/auth/callback/${client.user_flow}/${server.id}`,
        ]),
      ),
    };
    for (const field of ["title", "channel", "auth_server_url"] as const)
      if (client[field] !== undefined) result[field] = client[field];
    return result;
  });
  return {
    version: pkg.version,
    auth_servers: config.auth_servers.map(({ id, url }) => ({ id, url })),
    realm: config.realm,
    clients,
    app_config: config.app_config,
  };
}
export function toPublicShowcaseConfig(
  config: ServerConfig,
  origin: string,
): PublicShowcaseConfig {
  return {
    ...toPublicConfig(config, origin),
    locale: config.locale,
    title: config.title || "IPification Showcase",
    appEnv: process.env.APP_ENV || "development",
    defaultCountry: config.default_country_code,
    disabledSelectCountry: !!config.disabled_select_country,
    logoUrl: config.app_logo_url,
    logoStyle: config.app_logo_style,
    faviconUrl: config.favicon_url || "/images/logo.ico",
    primaryColor: config.app_config.branding?.primary_color,
  };
}
