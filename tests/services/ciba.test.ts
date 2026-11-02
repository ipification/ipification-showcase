import { expect, test, vi } from "vitest";
import { createCibaService } from "@/server/ciba/service";
import { decodeCiba } from "@/server/ciba/input";
import { serviceContext as context } from "../helpers/service-context";
function setup() {
  const sessions = {
    read: vi.fn(async () => null),
    create: vi.fn(async () => "new-session"),
  };
  const provider = {
    sendSmsCode: vi.fn(async () => ({ authReqId: "auth", nonce: "nonce" })),
    createSimCredentialRequest: vi.fn(async () => ({
      authReqId: "auth",
      nonce: "nonce",
    })),
    verifySmsCode: vi.fn(async () => ({ sub: "user" })),
    exchangeSimCredential: vi.fn(async () => ({ sub: "user" })),
  };
  return {
    sessions,
    provider,
    service: createCibaService({ sessions, provider }),
  };
}
test("start resolves credentials, preserves requested scope, and classifies provider failure without HTTP", async () => {
  const s = setup();
  const result = await s.service.sendSmsCode(
    context,
    decodeCiba({ client_id: "client", scope: ["openid", "phone"] }),
  );
  expect(result.kind).toBe("started");
  expect(s.provider.sendSmsCode).toHaveBeenCalledWith(
    expect.objectContaining({
      clientSecret: "secret",
      reqScope: ["openid", "phone"],
    }),
  );
  s.provider.createSimCredentialRequest.mockRejectedValueOnce({
    message: "upstream failed",
    response: { status: 503, data: { error: "offline" } },
  });
  const failure = await s.service.createSimCredentialRequest(
    context,
    decodeCiba({ client_id: "client" }),
  );
  expect(failure).toMatchObject({
    kind: "failure",
    failure: {
      message: "upstream failed",
      status: 503,
      data: { error: "offline" },
    },
  });
});
test("successful token stores display data before returning the new session", async () => {
  const s = setup();
  const outcome = await s.service.exchangeSimCredential(
    context,
    decodeCiba({
      client_id: "client",
      nonce: "n",
      vp_token: { value: "opaque" },
    }),
    "old",
  );
  expect(outcome).toMatchObject({
    kind: "token_exchanged",
    sessionId: "new-session",
    data: { sub: "user" },
  });
  expect(s.sessions.create).toHaveBeenCalledWith(
    {
      isAuthenticated: true,
      userData: {
        userInfo: { sub: "user" },
        client_id: "client",
        client_title: "SIM",
        state: "n",
      },
    },
    "old",
  );
});
test("token failure still adopts an authenticated demo error session", async () => {
  const s = setup();
  s.provider.verifySmsCode.mockRejectedValueOnce({
    message: "invalid code",
    response: { status: 401, data: { error: "invalid_grant" } },
  });
  const outcome = await s.service.verifySmsCode(
    context,
    decodeCiba({ client_id: "client", nonce: "n" }),
    "old",
  );
  expect(outcome).toMatchObject({
    kind: "failure",
    sessionId: "new-session",
    failure: { status: 401 },
  });
  expect(s.sessions.create).toHaveBeenCalledWith(
    expect.objectContaining({
      isAuthenticated: true,
      userData: expect.objectContaining({
        userInfo: {
          error: "invalid code",
          status: 401,
          data: { error: "invalid_grant" },
        },
      }),
    }),
    "old",
  );
});
test("a successful token followed by a session failure attempts one error-display adoption; repeated store failure propagates", async () => {
  const s = setup();
  s.sessions.create.mockRejectedValueOnce(new Error("store failed"));
  expect(
    await s.service.verifySmsCode(
      context,
      decodeCiba({ client_id: "client" }),
      "old",
    ),
  ).toMatchObject({
    kind: "failure",
    failure: { message: "store failed", status: 500 },
  });
  expect(s.sessions.create).toHaveBeenCalledTimes(2);
  s.sessions.create.mockRejectedValue(new Error("offline"));
  await expect(
    s.service.verifySmsCode(
      context,
      decodeCiba({ client_id: "client" }),
      "old",
    ),
  ).rejects.toThrow("offline");
});
