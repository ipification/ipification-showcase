import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
const config: NextConfig = {
  serverExternalPackages: ["config", "geoip-lite"],
  poweredByHeader: false,
  logging: { incomingRequests: false },
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
};
export default config;
