import type { ServerConfig } from "@/config/load";
/** Runtime facts consumed by application services, independent of HTTP/Next. */
export interface ServiceContext {
  config: ServerConfig;
  origin: string;
  appEnv: string;
  hostname: string;
  clientIp: string;
}
