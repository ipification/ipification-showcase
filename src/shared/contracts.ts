/** @module Public contracts */

/**
 * OIDC userinfo claims returned by the provider. Available fields depend on the client scope.
 */
export type UserInfo = Record<string, unknown>;
/**
 * Provider identifier and base URL exposed in the public configuration and exchange responses.
 */
export interface AuthServer {
  id: string;
  url: string;
}
/**
 * Public settings for one configured Showcase client.
 */
export interface PublicClient {
  user_flow: string;
  client_id: string;
  scope: string;
  title?: string;
  channel?: string;
  redirect_uri?: string;
  redirect_uris?: Record<string, string>;
  auth_server_url?: string;
}
/**
 * Public configuration shared across Showcase client flows.
 */
export interface PublicConfig {
  version: string;
  auth_servers: AuthServer[];
  realm: string;
  clients: PublicClient[];
  app_config: Record<string, any>;
}
/**
 * The JSON response for `GET /api/config`, including public client and UI settings.
 */
export interface PublicShowcaseConfig extends PublicConfig {
  locale: Record<string, any>;
  title: string;
  appEnv: string;
  defaultCountry?: string;
  disabledSelectCountry: boolean;
  logoUrl?: string;
  logoStyle?: string;
  faviconUrl: string;
  primaryColor?: string;
}
export interface DisplayResult {
  userInfo: UserInfo;
  client_id: string;
  client_title: string;
  state: unknown;
}
export interface SessionData {
  isAuthenticated: boolean;
  displayErrorOnly?: boolean;
  userData?: DisplayResult;
  errorMessage?: string;
}
