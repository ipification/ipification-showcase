import { createHash } from "node:crypto";
import { memoryStore } from "@/server/store/memory";
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

// Synchronous transitions are atomic within the demo's single Node.js process.
async function transition(
  state: unknown,
  expected: Record<string, unknown>,
  phases: AuthAttempt["status"][],
  changes: Record<string, unknown>,
  mode = "",
  owner = "",
): Promise<AuthAttempt> {
  if (!validState(state)) throw new AuthAttemptError("AUTH_STATE_INVALID");
  const key = "oauth:" + state;
  const value = memoryStore.get<AuthAttempt>(key);
  if (!value) throw new AuthAttemptError("AUTH_STATE_INVALID");
  if (value.expiresAt <= Date.now())
    throw new AuthAttemptError("AUTH_STATE_EXPIRED");
  for (const [name, expectedValue] of Object.entries(expected))
    if ((value as unknown as Record<string, unknown>)[name] !== expectedValue)
      throw new AuthAttemptError("AUTH_STATE_INVALID");
  if (mode === "start" && !value.qr && value.ownerHash !== owner)
    throw new AuthAttemptError("AUTH_STATE_INVALID");
  if (
    mode === "backchannel" &&
    (value.qr || !["pvn_im", "login_im"].includes(value.userFlow))
  )
    throw new AuthAttemptError("AUTH_STATE_INVALID");
  if (
    mode === "callback" &&
    value.status === "processing" &&
    value.backchannelProcessing
  )
    return value;
  if (
    mode === "callback" &&
    value.status === "completed" &&
    value.backchannelCompleted &&
    !value.browserReturned
  ) {
    value.browserReturned = true;
    memoryStore.set(key, value, memoryStore.remaining(key));
    return value;
  }
  if (phases.length && !phases.includes(value.status))
    throw new AuthAttemptError("AUTH_STATE_REPLAYED");
  if (mode === "start" && value.qr)
    changes.expiresAt = Date.now() + AUTH_ATTEMPT_MS;
  Object.assign(value, changes);
  if (Object.keys(changes).length)
    memoryStore.set(key, value, memoryStore.remaining(key));
  return value;
}
export const authAttempts: AuthAttemptRepository = {
  async create(value) {
    if (!validState(value.state))
      throw new AuthAttemptError("AUTH_STATE_INVALID");
    const key = "oauth:" + value.state;
    if (memoryStore.get(key)) throw new AuthAttemptError("AUTH_STATE_REPLAYED");
    memoryStore.set(key, value, AUTH_ATTEMPT_MS * 2);
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
