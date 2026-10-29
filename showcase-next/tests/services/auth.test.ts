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
  const notify = vi.fn(async () => {
    calls.push("notify");
  });
  return {
    calls,
    results,
    sessions,
    provider,
    notify,
    service: createAuthService({
      results,
      sessions,
      provider,
      notify,
      id: () => "generated-state",
    }),
  };
}
test("authorization validates target before missing state, preserves permissive query values", () => {
  const { service, provider } = setup();
  expect(() =>
    service.begin(context, decodeStart({ server_id: "missing" })),
  ).toThrow("SERVER_NOT_FOUND");
  expect(() =>
    service.begin(context, decodeStart({ user_flow: "missing" })),
  ).toThrow("CLIENT_NOT_FOUND");
  expect(
    service.begin(context, decodeStart({ user_flow: "login_ip" })),
  ).toEqual({ kind: "login_required" });
  service.begin(
    context,
    decodeStart({ user_flow: "login_ip", state: ["a", "b"], phone: "+123" }),
  );
  expect(provider.buildAuthorizationUrl).toHaveBeenCalledWith(
    expect.objectContaining({ state: ["a", "b"], appEnv: "stage" }),
  );
});
test("callback persists both results before QR notify, and boolean false remains success", async () => {
  const s = setup();
  const result = await s.service.callback(context, {
    ...decodeCallback({ code: "c", state: "s-qrcode" }),
    userFlow: "login_ip",
    serverId: "stage",
    previousSessionId: "",
    backchannel: false,
  });
  expect(s.calls).toEqual(["save", "notify"]);
  expect(result).toEqual({ kind: "qr", failed: false });
  expect(s.notify).toHaveBeenCalledWith(
    "s-qrcode",
    "https://showcase.example/auth/complete?state=s-qrcode",
  );
});
test("backchannel precedes QR and missing state is generated", async () => {
  const s = setup();
  expect(
    await s.service.callback(context, {
      ...decodeCallback({ code: "c", state: "s-qrcode" }),
      userFlow: "login_ip",
      serverId: "stage",
      previousSessionId: "",
      backchannel: true,
    }),
  ).toEqual({ kind: "backchannel" });
  expect(s.notify).not.toHaveBeenCalled();
  await s.service.callback(context, {
    ...decodeCallback({ code: "c" }),
    userFlow: "login_ip",
    serverId: "stage",
    previousSessionId: "",
    backchannel: false,
  });
  expect(s.results.saveResult).toHaveBeenLastCalledWith(
    "generated-state",
    expect.objectContaining({ state: "generated-state" }),
    expect.anything(),
  );
});
test("provider cancellation adopts the existing session before target lookup", async () => {
  const s = setup();
  await s.service.callback(context, {
    ...decodeCallback({ error: "access_denied" }),
    userFlow: "unknown",
    serverId: "missing",
    previousSessionId: "old",
    backchannel: false,
  });
  expect(s.sessions.create).toHaveBeenCalledWith(
    { isAuthenticated: false, errorMessage: "Authentication was cancelled." },
    "old",
  );
  expect(s.provider.exchangeAuthorizationCode).not.toHaveBeenCalled();
});
test("store/notify failures propagate; mobile passes submitted redirect and S2S stays a repository read", async () => {
  const s = setup();
  s.notify.mockRejectedValueOnce(new Error("offline"));
  await expect(
    s.service.callback(context, {
      ...decodeCallback({ code: "c", state: "s-qrcode" }),
      userFlow: "login_ip",
      serverId: "stage",
      previousSessionId: "",
      backchannel: false,
    }),
  ).rejects.toThrow("offline");
  await s.service.mobile(
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
  await s.service.userInfo("s");
  await s.service.userInfo("s");
  expect(s.results.getUserInfo).toHaveBeenCalledTimes(2);
});

test("completion creates a replacement authenticated session only after a stored result is found", async () => {
  const s=setup();
  expect(await s.service.complete("missing","old")).toBeUndefined();
  expect(s.sessions.create).not.toHaveBeenCalled();
  const result={userInfo:{sub:"user"},client_id:"client",client_title:"Login",state:"s"};
  const service=createAuthService({sessions:s.sessions,results:{...s.results,waitForResult:async()=>result}});
  expect(await service.complete("s","old")).toBe("new-session");
  expect(s.sessions.create).toHaveBeenCalledWith({isAuthenticated:true,userData:result},"old");
});
