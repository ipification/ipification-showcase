import { validState } from "@/shared/server/storage/auth-state";
import { createHash } from "node:crypto";
import { memoryStore } from "@/shared/server/storage/memory";
import { AuthAttemptError } from "@/shared/server/common/errors";
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
  nonce: string;
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
/**
 * Hashes a validated random cookie token before storing it with an attempt.
 *
 * @param value - 64-character lowercase hexadecimal cookie token.
 * @returns SHA-256 digest to persist instead of the raw token.
 * @throws `AuthAttemptError` when the token is malformed.
 */
export function bindingHash(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value))
    throw new AuthAttemptError("AUTH_STATE_INVALID");
  // Store only a digest of the random cookie binding in the attempt record.
  return createHash("sha256").update(value).digest("hex");
}
type Match = { userFlow: string; serverId: string; origin: string };
type AttemptPurpose = "start" | "callback" | "backchannel";
export interface AuthAttemptRepository {
  /** @param value - Complete prepared attempt. @returns Resolves after save; rejects invalid or duplicate state. */
  create(value: AuthAttempt): Promise<void>;
  /** @param state - Attempt state. @param match - Expected flow/server/origin/client. @param owner - Owner cookie token. @param callback - Callback browser token. @returns The started attempt. */
  start(
    state: unknown,
    match: Match & { clientId: string },
    owner: string,
    callback: string,
  ): Promise<AuthAttempt>;
  /** @param state - Attempt state. @param match - Expected flow/server/origin. @param callback - Callback browser token. @param backchannel - Whether this is an IM backchannel request. @returns The claimed processing attempt. */
  claimCallback(
    state: unknown,
    match: Match,
    callback: string,
    backchannel: boolean,
  ): Promise<AuthAttempt>;
  /** @param state - Claimed attempt state. @param failure - Optional callback failure details. @param backchannel - Whether callback came from backchannel. @returns Resolves after the attempt becomes completed or failed. */
  finishCallback(
    state: string,
    failure?: AttemptFailure,
    backchannel?: boolean,
  ): Promise<void>;
  /** @param state - Attempt state. @param owner - Owner cookie token. @param origin - Current Showcase origin. @returns The matching attempt or throws when invalid/expired. */
  readOwned(
    state: unknown,
    owner: string,
    origin: string,
  ): Promise<AuthAttempt>;
  /** @param state - Attempt state. @param owner - Owner cookie token. @param origin - Current Showcase origin. @returns The attempt claimed for completion. */
  claimCompletion(
    state: unknown,
    owner: string,
    origin: string,
  ): Promise<AuthAttempt>;
  /** @param state - Attempt state being completed. @param failed - Whether display completion failed. @returns Resolves after the attempt is consumed or marked failed. */
  finishCompletion(state: string, failed?: boolean): Promise<void>;
}

// Synchronous transitions are atomic within the demo's single Node.js process.
/**
 * Checks whether this attempt type may use the requested start or backchannel path.
 *
 * @param attempt - Attempt being transitioned.
 * @param purpose - Start, browser callback, or backchannel operation.
 * @param ownerHash - Owner token digest checked for non-QR starts.
 * @returns Nothing when allowed; throws for an invalid operation.
 */
function validateAttemptPurpose(
  attempt: AuthAttempt,
  purpose: AttemptPurpose | undefined,
  ownerHash: string,
) {
  if (purpose === "start" && !attempt.qr && attempt.ownerHash !== ownerHash)
    throw new AuthAttemptError("AUTH_STATE_INVALID");
  if (
    purpose === "backchannel" &&
    (attempt.qr || !["pvn_im", "login_im"].includes(attempt.userFlow))
  )
    throw new AuthAttemptError("AUTH_STATE_INVALID");
}

/**
 * Returns an existing result for the supported backchannel/browser callback race.
 *
 * @param attempt - Current saved attempt.
 * @param key - Storage key used to persist a browser-return marker.
 * @param purpose - Operation being processed.
 * @returns The reusable attempt for a recognized race, or `undefined` to continue validation.
 */
function resumeCallbackIfAlreadyProcessed(
  attempt: AuthAttempt,
  key: string,
  purpose: AttemptPurpose | undefined,
) {
  if (purpose !== "callback") return undefined;
  if (attempt.status === "processing" && attempt.backchannelProcessing)
    return attempt;
  if (
    attempt.status === "completed" &&
    attempt.backchannelCompleted &&
    !attempt.browserReturned
  ) {
    attempt.browserReturned = true;
    memoryStore.set(key, attempt, memoryStore.remaining(key));
    return attempt;
  }
  return undefined;
}

/**
 * Loads an attempt, checks expiry/bindings/phase, applies updates and returns it.
 *
 * @param state - State used to find the record.
 * @param expectedBindings - Stored fields that must match the request.
 * @param allowedStatuses - Phases that may transition; empty permits a read.
 * @param updates - Fields to save after checks pass.
 * @param purpose - Optional start/callback-specific rules.
 * @param ownerHash - Owner digest used for direct non-QR start.
 * @returns The current or updated attempt.
 * @throws `AuthAttemptError` for invalid, expired, mismatched or replayed attempts.
 */
async function transitionAttempt(
  state: unknown,
  expectedBindings: Partial<AuthAttempt>,
  allowedStatuses: AuthAttempt["status"][],
  updates: Partial<AuthAttempt>,
  purpose?: AttemptPurpose,
  ownerHash = "",
): Promise<AuthAttempt> {
  // All state changes pass through this check so expiry, ownership and replay
  // rules are applied consistently before the in-memory record is updated.
  if (!validState(state)) throw new AuthAttemptError("AUTH_STATE_INVALID");
  const key = "oauth:" + state;
  const attempt = memoryStore.get<AuthAttempt>(key);
  if (!attempt) throw new AuthAttemptError("AUTH_STATE_INVALID");
  if (attempt.expiresAt <= Date.now())
    throw new AuthAttemptError("AUTH_STATE_EXPIRED");
  for (const [name, expectedValue] of Object.entries(expectedBindings))
    if ((attempt as unknown as Record<string, unknown>)[name] !== expectedValue)
      throw new AuthAttemptError("AUTH_STATE_INVALID");
  validateAttemptPurpose(attempt, purpose, ownerHash);
  const resumedCallback = resumeCallbackIfAlreadyProcessed(
    attempt,
    key,
    purpose,
  );
  if (resumedCallback) return resumedCallback;
  if (allowedStatuses.length && !allowedStatuses.includes(attempt.status))
    throw new AuthAttemptError("AUTH_STATE_REPLAYED");
  if (purpose === "start" && attempt.qr)
    updates.expiresAt = Date.now() + AUTH_ATTEMPT_MS;
  Object.assign(attempt, updates);
  if (Object.keys(updates).length)
    memoryStore.set(key, attempt, memoryStore.remaining(key));
  return attempt;
}
export const authAttempts: AuthAttemptRepository = {
  async create(value) {
    if (!validState(value.state))
      throw new AuthAttemptError("AUTH_STATE_INVALID");
    const key = "oauth:" + value.state;
    if (memoryStore.get(key)) throw new AuthAttemptError("AUTH_STATE_REPLAYED");
    // Keep the record slightly longer than its logical expiry for stable expired errors.
    memoryStore.set(key, value, AUTH_ATTEMPT_MS * 2);
  },
  start(state, match, owner, callback) {
    // QR deliberately starts on a different browser; direct navigation must match its initiator.
    const ownerHash = owner ? bindingHash(owner) : "";
    return transitionAttempt(
      state,
      match,
      ["prepared"],
      { status: "started", callbackHash: bindingHash(callback) },
      "start",
      ownerHash,
    );
  },
  claimCallback(state, match, callback, backchannel) {
    // Backchannel callbacks have no browser cookie; browser callbacks must match theirs.
    const expected = backchannel
      ? match
      : { ...match, callbackHash: bindingHash(callback) };
    return transitionAttempt(
      state,
      expected,
      ["started"],
      { status: "processing", backchannelProcessing: backchannel },
      backchannel ? "backchannel" : "callback",
    );
  },
  async finishCallback(state, failure, backchannel = false) {
    await transitionAttempt(
      state,
      {},
      ["processing"],
      failure
        ? { status: "failed", failure }
        : { status: "completed", backchannelCompleted: backchannel },
    );
  },
  readOwned(state, owner, origin) {
    // Status polling checks ownership but intentionally leaves the phase unchanged.
    return transitionAttempt(
      state,
      { ownerHash: bindingHash(owner), origin },
      [],
      {},
    );
  },
  claimCompletion(state, owner, origin) {
    // Only completed/failed attempts can be claimed, and only once by their owner.
    return transitionAttempt(
      state,
      { ownerHash: bindingHash(owner), origin },
      ["completed", "failed"],
      { status: "completing" },
    );
  },
  async finishCompletion(state) {
    await transitionAttempt(state, {}, ["completing"], { status: "consumed" });
  },
};
