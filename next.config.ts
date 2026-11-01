import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";
const config: NextConfig = {
  // Phones reach the custom dev server through a LAN IP, not localhost.
  // Next validates HMR origins against this list; keep it to exact local hosts.
  allowedDevOrigins: [
    "127.0.0.1",
    "[::1]",
    ...Object.values(networkInterfaces())
      .flatMap((addresses) => addresses || [])
      .filter((address) => address.family === "IPv4")
      .map((address) => address.address),
  ],
  serverExternalPackages: ["config", "geoip-lite"],
  poweredByHeader: false,
  logging: { incomingRequests: false },
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
};
export default config;
