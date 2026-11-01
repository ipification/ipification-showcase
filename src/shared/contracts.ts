export type UserInfo = Record<string, unknown>;
export interface AuthServer {
  id: string;
  url: string;
}
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
export interface PublicConfig {
  version: string;
  auth_servers: AuthServer[];
  realm: string;
  clients: PublicClient[];
  app_config: Record<string, any>;
}
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
  userData?: DisplayResult;
  errorMessage?: string;
}
