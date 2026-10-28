import "server-only";
import { loadRuntimeConfig } from "../../../runtime/config.mjs";
import type { AuthServer, PublicClient } from "@/shared/contracts";
export interface ServerClient extends PublicClient {
  client_secret: string;
}
export interface ServerConfig {
  realm: string;
  client_id: string;
  client_secret: string;
  auth_servers: AuthServer[];
  clients: ServerClient[];
  locale: Record<string, any>;
  app_config: Record<string, any>;
  title?: string;
  app_logo_url?: string;
  app_logo_style?: string;
  favicon_url?: string;
  default_country_code?: string;
  disabled_select_country?: boolean;
  play_integrity_verify_domains?: string[];
}
export const getConfig = (): ServerConfig => loadRuntimeConfig();
