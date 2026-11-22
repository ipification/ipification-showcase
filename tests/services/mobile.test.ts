import { expect, test, vi } from "vitest";
import {
  decodeMobile,
  exchangeMobileAuthorizationCode,
} from "@/modules/mobile/service";
import { serviceContext } from "../helpers/service-context";

test("mobile exchanges the code with the submitted redirect and no browser binding", async () => {
  const userInfo = { sub: "mobile-user" };
  const exchange = vi.fn(async () => ({
    tokenInfo: { access_token: "token" },
    userInfo,
  }));
  const result = await exchangeMobileAuthorizationCode(
    serviceContext,
    decodeMobile({
      client_id: "client",
      redirect_uri: "demo://callback",
      code: "c",
    }),
    exchange,
  );
  expect(exchange).toHaveBeenCalledExactlyOnceWith({
    server: serviceContext.config.auth_servers[0],
    realm: serviceContext.config.realm,
    clientId: "client",
    clientSecret: serviceContext.config.clients[0].client_secret,
    redirectUri: "demo://callback",
    code: "c",
  });
  expect(result).toEqual({
    server: serviceContext.config.auth_servers[0],
    userInfo,
  });
});
