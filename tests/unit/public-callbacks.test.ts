import { test, expect } from "vitest";
import { toPublicConfig } from "@/server/config/public";
import { serviceContext } from "../helpers/service-context";
test("public callback URLs identify default and alternate servers", () => {
  const config = {
    ...serviceContext.config,
    auth_servers: [
      { id: "stage", url: "https://stage.example" },
      { id: "secondary", url: "https://secondary.example" },
    ],
  };
  const client = toPublicConfig(config, "https://showcase.example").clients[0];
  expect(client.redirect_uri).toBe(
    "https://showcase.example/auth/callback/login_ip/stage",
  );
  expect(client).toHaveProperty("redirect_uris", {
    stage: "https://showcase.example/auth/callback/login_ip/stage",
    secondary: "https://showcase.example/auth/callback/login_ip/secondary",
  });
  expect(JSON.stringify(client)).not.toContain("secret");
});
