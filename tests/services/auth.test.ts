import { expect, test, vi } from "vitest";
import { createAuthService } from "@/server/auth/service";
import { serviceContext as context } from "../helpers/service-context";
import { decodeStart, decodeCallback, decodeMobile } from "@/server/auth/input";
function setup() {
  const calls: string[] = [];
  const results = {
    saveResult: vi.fn(async () => {
      calls.push("save");
    }),
    waitForResult: vi.fn(async () => undefined),
    getUserInfo: vi.fn(async () => undefined),
  };
  const sessions = {
    read: vi.fn(async () => null),
    create: vi.fn(async () => {
      calls.push("session");
      return "new-session";
    }),
  };
  const provider = {
    buildAuthorizationUrl: vi.fn(() => "https://provider.example/auth"),
    exchangeAuthorizationCode: vi.fn(async () => ({
      tokenInfo: { access_token: "token" },
      userInfo: { phone_number_verified: false },
    })),
  };
  const record = {
    state: "s-qrcode",
    userFlow: "login_ip",
    serverId: "stage",
    clientId: "client",
    origin: context.origin,
    qr: true,
    ownerHash: "hash",
    status: "processing" as const,
    expiresAt: Date.now() + 300000,
  };
  const attempts = {
    create: vi.fn(async () => {}),
    start: vi.fn(async () => ({ ...record, state: "s", phone: "+123" })),
    claimCallback: vi.fn(async () => record),
    finishCallback: vi.fn(async () => {}),
    readOwned: vi.fn(async () => record),
    claimCompletion: vi.fn(async () => record),
    finishCompletion: vi.fn(async () => {}),
  };
  return {
    calls,
    results,
    sessions,
    provider,
    attempts,
    service: createAuthService({
      results,
      attempts,
      sessions,
      provider,
      id: () => "generated-state",
    }),
  };
}
test("authorization validates target before claiming and uses the stored phone/state", async () => {
  const { service, provider, attempts } = setup();
  const binding = { owner: "owner", callback: "callback" };
  await expect(
    service.startWebAuthentication(
      context,
      decodeStart({ server_id: "missing" }),
      binding,
    ),
  ).rejects.toThrow("SERVER_NOT_FOUND");
  await expect(
    service.startWebAuthentication(
      context,
      decodeStart({ user_flow: "missing" }),
      binding,
    ),
  ).rejects.toThrow("CLIENT_NOT_FOUND");
  expect(attempts.start).not.toHaveBeenCalled();
  await service.startWebAuthentication(
    context,
    decodeStart({ user_flow: "login_ip", state: "s", phone: "tampered" }),
    binding,
  );
  expect(provider.buildAuthorizationUrl).toHaveBeenCalledWith(
    expect.objectContaining({ state: "s", phone: "+123", appEnv: "stage" }),
  );
});
test("callback persists both results without notification, and boolean false remains success", async () => {
  const s = setup();
  const result = await s.service.handleAuthorizationCallback(context, {
    ...decodeCallback({ code: "c", state: "s-qrcode" }),
    userFlow: "login_ip",
    serverId: "stage",
    previousSessionId: "",
    backchannel: false,
    callbackBinding: "callback",
  });
  expect(s.calls).toEqual(["save"]);
  expect(result).toEqual({ kind: "qr", failed: false });
});
test("a bound IM browser return reuses a backchannel result without another exchange", async () => {
  const s = setup();
  s.attempts.claimCallback.mockResolvedValueOnce({
    ...(await s.attempts.claimCallback()),
    status: "completed",
  } as never);
  expect(
    await s.service.handleAuthorizationCallback(context, {
      ...decodeCallback({ code: "c", state: "s-qrcode" }),
      userFlow: "login_ip",
      serverId: "stage",
      previousSessionId: "",
      backchannel: false,
      callbackBinding: "callback",
    }),
  ).toEqual({
    kind: "redirect",
    url: context.origin + "/auth/complete?state=s-qrcode",
  });
  expect(s.provider.exchangeAuthorizationCode).not.toHaveBeenCalled();
});
test("bound provider cancellation adopts the existing session without provider calls", async () => {
  const s = setup();
  await s.service.handleAuthorizationCallback(context, {
    ...decodeCallback({ error: "access_denied" }),
    userFlow: "unknown",
    serverId: "missing",
    previousSessionId: "old",
    backchannel: false,
    callbackBinding: "callback",
  });
  expect(s.sessions.create).toHaveBeenCalledWith(
    { isAuthenticated: false, errorMessage: "access_denied" },
    "old",
  );
  expect(s.provider.exchangeAuthorizationCode).not.toHaveBeenCalled();
});
test("store failures propagate; mobile passes submitted redirect and S2S stays a repository read", async () => {
  const s = setup();
  s.results.saveResult.mockRejectedValueOnce(new Error("offline"));
  await expect(
    s.service.handleAuthorizationCallback(context, {
      ...decodeCallback({ code: "c", state: "s-qrcode" }),
      userFlow: "login_ip",
      serverId: "stage",
      previousSessionId: "",
      backchannel: false,
      callbackBinding: "callback",
    }),
  ).rejects.toThrow("offline");
  await s.service.exchangeMobileCode(
    context,
    decodeMobile({
      client_id: "client",
      redirect_uri: "demo://callback",
      code: "c",
    }),
  );
  expect(s.provider.exchangeAuthorizationCode).toHaveBeenLastCalledWith(
    expect.objectContaining({ redirectUri: "demo://callback" }),
  );
  await s.service.readS2sResult("s");
  await s.service.readS2sResult("s");
  expect(s.results.getUserInfo).toHaveBeenCalledTimes(2);
});

test("completion creates a replacement authenticated session only after a stored result is found", async () => {
  const s = setup();
  await expect(
    s.service.completeWebAuthentication(context, "missing", "old", "owner"),
  ).rejects.toThrow("AUTH_STATE_INVALID");
  expect(s.sessions.create).not.toHaveBeenCalled();
  const result = {
    userInfo: { sub: "user" },
    client_id: "client",
    client_title: "Login",
    state: "s",
  };
  const service = createAuthService({
    attempts: s.attempts,
    sessions: s.sessions,
    results: { ...s.results, waitForResult: async () => result },
  });
  expect(
    await service.completeWebAuthentication(context, "s", "old", "owner"),
  ).toBe("new-session");
  expect(s.sessions.create).toHaveBeenCalledWith(
    { isAuthenticated: true, userData: result },
    "old",
  );
});

test("provider error keeps prior authenticated data and displays the error code", async () => {
  const s = setup();
  const previous = {
    isAuthenticated: true,
    userData: {
      userInfo: { sub: "existing-user" },
      client_id: "client",
      client_title: "Login",
      state: "old",
    },
  };
  const service = createAuthService({
    attempts: s.attempts,
    sessions: { ...s.sessions, read: async () => previous },
    provider: s.provider,
  });
  await service.handleAuthorizationCallback(context, {
    ...decodeCallback({
      error: "unknown-error",
      error_description: "PRIVATE_PROVIDER_TEXT",
    }),
    userFlow: "unknown",
    serverId: "missing",
    previousSessionId: "old",
    backchannel: false,
    callbackBinding: "callback",
  });
  expect(s.sessions.create).toHaveBeenCalledWith(
    { ...previous, errorMessage: "unknown-error" },
    "old",
  );
  expect(s.provider.exchangeAuthorizationCode).not.toHaveBeenCalled();
});

test("an invalid callback claim is rejected before provider calls, persistence, or sessions", async () => {
  const s = setup();
  s.attempts.claimCallback.mockRejectedValueOnce(
    new Error("AUTH_STATE_INVALID"),
  );
  await expect(
    s.service.handleAuthorizationCallback(context, {
      ...decodeCallback({ code: "c", state: ["one", "two"] }),
      userFlow: "login_ip",
      serverId: "stage",
      previousSessionId: "",
      backchannel: false,
      callbackBinding: "callback",
    }),
  ).rejects.toThrow("AUTH_STATE_INVALID");
  expect(s.provider.exchangeAuthorizationCode).not.toHaveBeenCalled();
  expect(s.results.saveResult).not.toHaveBeenCalled();
  expect(s.sessions.create).not.toHaveBeenCalled();
});

test("finished status is restored only for an authenticated session with the exact valid state", async () => {
  const s = setup();
  const state = "12345678-1234-1234-1234-123456789abc";
  let authenticated = true;
  const service = createAuthService({
    attempts: {
      ...s.attempts,
      readOwned: vi.fn(async () => {
        throw new Error("owner required");
      }),
    },
    sessions: {
      ...s.sessions,
      read: async () => ({
        isAuthenticated: authenticated,
        userData: {
          state,
          userInfo: { sub: "user" },
          client_id: "client",
          client_title: "Login",
        },
      }),
    },
  });
  expect(
    await service.getAuthenticationStatus(context, state, "", "session"),
  ).toMatchObject({ status: "finished" });
  await expect(
    service.getAuthenticationStatus(
      context,
      "aaaaaaaa-1234-1234-1234-123456789abc",
      "",
      "session",
    ),
  ).rejects.toThrow("owner required");
  authenticated = false;
  await expect(
    service.getAuthenticationStatus(context, state, "", "session"),
  ).rejects.toThrow("owner required");
  expect(s.sessions.create).not.toHaveBeenCalled();
});

test("callback error takes priority over code and description; description is used if error is absent", async () => {
  for (const [params, expected] of [
    [
      {
        error: "msisdn_country_mismatch",
        error_description: "Country mismatch",
        code: "ignored",
      },
      "msisdn_country_mismatch",
    ],
    [
      { error_description: "Carrier could not verify this number" },
      "Carrier could not verify this number",
    ],
    [{}, "Unable to complete authentication."],
  ] as const) {
    const s = setup();
    await s.service.handleAuthorizationCallback(context, {
      ...decodeCallback({ ...params, state: "s-qrcode" }),
      userFlow: "login_ip",
      serverId: "stage",
      previousSessionId: "",
      backchannel: false,
      callbackBinding: "callback",
    });
    expect(s.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: expected }),
      "",
    );
    expect(s.attempts.finishCallback).toHaveBeenCalledWith(
      "s-qrcode",
      expect.objectContaining({ callbackMessage: expected }),
    );
    expect(s.provider.exchangeAuthorizationCode).not.toHaveBeenCalled();
  }
});

test("QR owner can consume a bound provider callback error into their own session", async () => {
  const s = setup();
  const attempt = await s.attempts.claimCompletion();
  s.attempts.claimCompletion.mockResolvedValueOnce({
    ...attempt,
    failure: {
      reason: "AUTH_CANCELLED",
      stage: "application",
      callbackMessage: "msisdn_country_mismatch",
    },
  } as never);
  const result = await s.service.completeWebAuthentication(
    context,
    "s-qrcode",
    "old",
    "owner",
  );
  expect(result).toEqual({ sessionId: "new-session", callbackError: true });
  expect(s.sessions.create).toHaveBeenCalledWith(
    { isAuthenticated: false, errorMessage: "msisdn_country_mismatch" },
    "old",
  );
  expect(s.attempts.finishCompletion).toHaveBeenCalledWith("s-qrcode");
});
