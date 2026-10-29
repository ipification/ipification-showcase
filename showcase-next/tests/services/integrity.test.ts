import { test, expect, vi } from "vitest";
import { createIntegrityService } from "@/server/integrity/service";
import { UpstreamUnavailableError } from "@/server/shared/errors";
import { serviceContext } from "../helpers/service-context";
function setup() {
  const attempt = {
    id: "attempt",
    requestHash: "hash",
    client: {
      client_id: "c",
      client_secret: "s",
      redirectUri: "demo://callback",
    },
    server: { url: "https://provider.example/", realm: "a b" },
  };
  const transaction = {
    id: "attempt--tx",
    expiresAt: "future",
    status: "approved",
    attempt,
  };
  const attempts = {
    createAttempt: vi.fn(async () => ({
      attemptId: "attempt",
      requestHash: "hash",
      expiresAt: "future",
    })),
    claimAttempt: vi.fn(async () => attempt),
    approveAttempt: vi.fn(async () => transaction),
    rejectAttempt: vi.fn(async () => null),
    createSignedState: vi.fn(() => "a.b.c"),
    claimTransaction: vi.fn(async () => ({ status: "claimed", transaction })),
    completeTransaction: vi.fn(async () => null),
  };
  const verify = vi.fn(async () => ({
    decision: "allow",
    reasonCodes: [] as string[],
  }));
  const exchange = vi.fn(async () => ({ userInfo: { sub: "user" } }));
  const context = {
    ...serviceContext,
    config: {
      ...serviceContext.config,
      play_integrity_verify_domains: [" VERIFY.EXAMPLE "],
    },
    hostname: "verify.example",
  };
  return {
    attempts,
    verify,
    exchange,
    context,
    service: createIntegrityService({
      attempts,
      verify,
      exchange,
      policy: { userFlow: "login_ip", packageName: "com.fixture" },
    }),
  };
}
test("only configured verification hostname invokes verifier and preserves signed-state output", async () => {
  const s = setup();
  expect(
    await s.service.execute("verify", s.context, {
      attempt_id: "attempt",
      integrity_token: "opaque",
    }),
  ).toMatchObject({ kind: "verified", state: "a.b.c" });
  expect(s.verify).toHaveBeenCalledWith({
    integrityToken: "opaque",
    expectedRequestHash: "hash",
    expectedPackageName: "com.fixture",
  });
  s.verify.mockClear();
  await s.service.execute(
    "verify",
    { ...s.context, hostname: "bypass.example" },
    { attempt_id: "attempt", integrity_token: "opaque" },
  );
  expect(s.verify).not.toHaveBeenCalled();
});
test("policy denial rejects the attempt, while verifier outages retain their reason", async () => {
  const s = setup();
  s.verify.mockResolvedValueOnce({
    decision: "deny",
    reasonCodes: ["PACKAGE_NAME_MISMATCH"],
  });
  expect(
    await s.service.execute("verify", s.context, {
      attempt_id: "attempt",
      integrity_token: "t",
    }),
  ).toMatchObject({
    kind: "denied",
    category: "policy",
    reasonCodes: ["PACKAGE_NAME_MISMATCH"],
  });
  expect(s.attempts.rejectAttempt).toHaveBeenCalledWith(
    "attempt",
    "PACKAGE_NAME_MISMATCH",
  );
  s.verify.mockRejectedValueOnce(
    new UpstreamUnavailableError("GOOGLE_TIMEOUT", new Error("private")),
  );
  expect(
    await s.service.execute("verify", s.context, {
      attempt_id: "attempt",
      integrity_token: "t",
    }),
  ).toMatchObject({
    category: "unavailable",
    decision: "unavailable",
    reasonCodes: ["GOOGLE_TIMEOUT"],
  });
});
test("exchange uses captured credentials/redirect and finalizes before returning; failure finalizes as failed", async () => {
  const s = setup();
  expect(
    await s.service.execute("token-exchange", s.context, {
      code: "c",
      state: "a.b.c",
    }),
  ).toEqual({ kind: "exchanged", userInfo: { sub: "user" } });
  expect(s.exchange).toHaveBeenCalledWith(
    "https://provider.example/realms/a%20b/protocol/openid-connect/token",
    "https://provider.example/realms/a%20b/protocol/openid-connect/userinfo",
    expect.objectContaining({
      redirect_uri: "demo://callback",
      client_secret: "s",
    }),
  );
  expect(s.attempts.completeTransaction).toHaveBeenCalledWith(
    "attempt--tx",
    "consumed",
  );
  s.exchange.mockRejectedValueOnce(new Error("401"));
  expect(
    await s.service.execute("token-exchange", s.context, {
      code: "c",
      state: "a.b.c",
    }),
  ).toMatchObject({
    category: "exchange",
    reasonCodes: ["IPIFICATION_EXCHANGE_FAILED"],
  });
  expect(s.attempts.completeTransaction).toHaveBeenLastCalledWith(
    "attempt--tx",
    "failed",
  );
});
test("validation/replay misses do not call the provider; repository failures are service unavailable", async () => {
  const s = setup();
  expect(
    await s.service.execute("verify", s.context, {
      attempt_id: ["a"],
      integrity_token: "t",
    }),
  ).toMatchObject({ category: "input" });
  expect(s.attempts.claimAttempt).not.toHaveBeenCalled();
  const service = createIntegrityService({
    attempts: {
      ...s.attempts,
      claimTransaction: async () => ({ status: "unavailable" }),
    },
    verify: s.verify,
    exchange: s.exchange,
    policy: {},
  });
  expect(
    await service.execute("token-exchange", s.context, {
      code: "c",
      state: "a.b.c",
    }),
  ).toMatchObject({
    category: "conflict",
    reasonCodes: ["TRANSACTION_UNAVAILABLE"],
  });
  expect(s.exchange).not.toHaveBeenCalled();
  s.attempts.claimAttempt.mockRejectedValueOnce(new Error("Redis offline"));
  expect(
    await s.service.execute("verify", s.context, {
      attempt_id: "a",
      integrity_token: "t",
    }),
  ).toMatchObject({
    category: "unavailable",
    reasonCodes: ["SERVICE_UNAVAILABLE"],
  });
});

test("attempt creation resolves a configured flow/server and delegates the immutable credential snapshot", async () => {
  const s = setup();
  expect(
    await s.service.execute("attempt", s.context, {
      phone_number: "+12025550123",
      server_id: "stage",
    }),
  ).toEqual({
    kind: "created",
    attemptId: "attempt",
    requestHash: "hash",
    expiresAt: "future",
  });
  expect(s.attempts.createAttempt).toHaveBeenCalledWith(
    expect.objectContaining({
      clientId: "client",
      serverId: "stage",
      resolveClient: expect.any(Function),
      resolveServer: expect.any(Function),
    }),
  );
  expect(
    await s.service.execute("attempt", s.context, {
      phone_number: "+12025550123",
      server_id: "missing",
    }),
  ).toMatchObject({ category: "input", reasonCodes: ["INVALID_REQUEST"] });
});
