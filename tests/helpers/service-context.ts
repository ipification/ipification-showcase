import type { ServerConfig } from "@/server/config/load";
export const serviceContext = {
  origin: "https://showcase.example",
  hostname: "showcase.example",
  appEnv: "stage",
  clientIp: "203.0.113.1",
  config: {
    realm: "demo",
    client_id: "client",
    client_secret: "secret",
    auth_servers: [{ id: "stage", url: "https://provider.example" }],
    clients: [
      {
        user_flow: "login_ip",
        client_id: "client",
        client_secret: "secret",
        scope: "openid",
        title: "Login",
      },
    ],
    locale: {},
    app_config: {},
  } satisfies ServerConfig,
};
