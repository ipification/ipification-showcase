import { createHash } from "node:crypto";
import { getRedis, key } from "@/server/store/redis";
import { AuthAttemptError } from "@/server/shared/errors";
import type { AuthFailureReason } from "@/shared/auth-failures";
export const AUTH_ATTEMPT_MS = 300000;
export const QR_SCAN_MS = 120000;
export interface AttemptFailure {
  reason: AuthFailureReason;
  stage: "token" | "userinfo" | "application";
  status?: number;
  providerCode?: string;
  callbackMessage?: string;
}
export interface AuthAttempt {
  state: string;
  userFlow: string;
  serverId: string;
  clientId: string;
  origin: string;
  phone?: unknown;
  qr: boolean;
  ownerHash: string;
  callbackHash?: string;
  status:
    | "prepared"
    | "started"
    | "processing"
    | "completed"
    | "completing"
    | "consumed"
    | "failed";
  expiresAt: number;
  scanExpiresAt?: number;
  failure?: AttemptFailure;
  backchannelCompleted?: boolean;
  backchannelProcessing?: boolean;
  browserReturned?: boolean;
}
export const validState = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(?:-qrcode)?$/.test(
    value,
  );
export function bindingHash(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value))
    throw new AuthAttemptError("AUTH_STATE_INVALID");
  return createHash("sha256").update(value).digest("hex");
}
type Match = { userFlow: string; serverId: string; origin: string };
export interface AuthAttemptRepository {
  create(value: AuthAttempt): Promise<void>;
  start(
    state: unknown,
    match: Match & { clientId: string },
    owner: string,
    callback: string,
  ): Promise<AuthAttempt>;
  claimCallback(
    state: unknown,
    match: Match,
    callback: string,
    backchannel: boolean,
  ): Promise<AuthAttempt>;
  finishCallback(
    state: string,
    failure?: AttemptFailure,
    backchannel?: boolean,
  ): Promise<void>;
  readOwned(
    state: unknown,
    owner: string,
    origin: string,
  ): Promise<AuthAttempt>;
  claimCompletion(
    state: unknown,
    owner: string,
    origin: string,
  ): Promise<AuthAttempt>;
  finishCompletion(state: string, failed?: boolean): Promise<void>;
}

// Attempt lifecycle: prepared -> started -> processing -> completed/failed
// -> completing -> consumed. Status polling reads the same record without claiming it.
// All expiry, binding and phase checks happen in the same Redis operation as the claim.
// This prevents concurrent callbacks or completions from claiming the same attempt.
const transitionScript = `
local raw=redis.call('GET',KEYS[1]); if not raw then return cjson.encode({error='AUTH_STATE_INVALID'}) end
local a=cjson.decode(raw)
if a.expiresAt<=tonumber(ARGV[1]) then return cjson.encode({error='AUTH_STATE_EXPIRED'}) end
local expected=cjson.decode(ARGV[2]); for k,v in pairs(expected) do if a[k]~=v then return cjson.encode({error='AUTH_STATE_INVALID'}) end end
local mode=ARGV[5]
if mode=='start' and not a.qr and a.ownerHash~=ARGV[6] then return cjson.encode({error='AUTH_STATE_INVALID'}) end
if mode=='backchannel' and (a.qr or (a.userFlow~='pvn_im' and a.userFlow~='login_im')) then return cjson.encode({error='AUTH_STATE_INVALID'}) end
if mode=='callback' and a.status=='processing' and a.backchannelProcessing then return cjson.encode(a) end
if mode=='callback' and a.status=='completed' and a.backchannelCompleted and not a.browserReturned then
 a.browserReturned=true; redis.call('SET',KEYS[1],cjson.encode(a),'KEEPTTL'); return cjson.encode(a)
end
local phases=cjson.decode(ARGV[3]); local allowed=#phases==0
for _,p in ipairs(phases) do if a.status==p then allowed=true end end
if not allowed then return cjson.encode({error='AUTH_STATE_REPLAYED'}) end
local changes=cjson.decode(ARGV[4])
-- Only a successful first QR start opens its completion window; replay cannot extend it.
if mode=='start' and a.qr then changes.expiresAt=tonumber(ARGV[1])+${AUTH_ATTEMPT_MS} end
for k,v in pairs(changes) do a[k]=v end
if next(changes) then redis.call('SET',KEYS[1],cjson.encode(a),'KEEPTTL') end
return cjson.encode(a)
`;
async function transition(
  state: unknown,
  expected: Record<string, unknown>,
  phases: AuthAttempt["status"][],
  changes: Record<string, unknown>,
  mode = "",
  owner = "",
): Promise<AuthAttempt> {
  if (!validState(state)) throw new AuthAttemptError("AUTH_STATE_INVALID");
  const raw = await (
    await getRedis()
  ).eval(transitionScript, {
    keys: [key("oauth:" + state)],
    arguments: [
      String(Date.now()),
      JSON.stringify(expected),
      JSON.stringify(phases),
      JSON.stringify(changes),
      mode,
      owner,
    ],
  });
  const value = JSON.parse(String(raw));
  if (value.error) throw new AuthAttemptError(value.error);
  return value as AuthAttempt;
}
export const authAttempts: AuthAttemptRepository = {
  async create(value) {
    if (!validState(value.state))
      throw new AuthAttemptError("AUTH_STATE_INVALID");
    const saved = await (
      await getRedis()
    ).set(key("oauth:" + value.state), JSON.stringify(value), {
      NX: true,
      PX: AUTH_ATTEMPT_MS * 2,
    });
    if (!saved) throw new AuthAttemptError("AUTH_STATE_REPLAYED");
  },
  start(state, match, owner, callback) {
    // QR deliberately starts on a different browser; direct navigation must match its initiator.
    const ownerHash = owner ? bindingHash(owner) : "";
    return transition(
      state,
      match,
      ["prepared"],
      { status: "started", callbackHash: bindingHash(callback) },
      "start",
      ownerHash,
    );
  },
  claimCallback(state, match, callback, backchannel) {
    const expected = backchannel
      ? match
      : { ...match, callbackHash: bindingHash(callback) };
    return transition(
      state,
      expected,
      ["started"],
      { status: "processing", backchannelProcessing: backchannel },
      backchannel ? "backchannel" : "callback",
    );
  },
  async finishCallback(state, failure, backchannel = false) {
    await transition(
      state,
      {},
      ["processing"],
      failure
        ? { status: "failed", failure }
        : { status: "completed", backchannelCompleted: backchannel },
    );
  },
  readOwned(state, owner, origin) {
    return transition(state, { ownerHash: bindingHash(owner), origin }, [], {});
  },
  claimCompletion(state, owner, origin) {
    return transition(
      state,
      { ownerHash: bindingHash(owner), origin },
      ["completed", "failed"],
      { status: "completing" },
    );
  },
  async finishCompletion(state) {
    await transition(state, {}, ["completing"], { status: "consumed" });
  },
};
