import { randomUUID, createHash } from "node:crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { createRequestHash } from "@/shared/server/common/canonical-json";
import { normalizePhoneNumber } from "@/shared/server/common/phone-number";
import type { AttemptRepository, TransactionSnapshot } from "./ports";
import {
  attemptKey,
  transactionKey,
  readRecord,
  createRecord,
  transition,
  approveRecords,
} from "@/shared/server/storage/integrity";
const ACTION = "IPIFICATION_AUTH";
type AttemptStatus = "created" | "verifying" | "rejected" | "approved";
type TransactionStatus = "approved" | "exchanging" | "consumed" | "failed";
type CreateAttemptInput = Parameters<AttemptRepository["createAttempt"]>[0];
type StoredAttempt = {
  id: string;
  action: typeof ACTION;
  phoneNumber: string;
  phoneNumberHash: string;
  clientId: string;
  serverId: string;
  client: Awaited<ReturnType<CreateAttemptInput["resolveClient"]>>;
  server: Awaited<ReturnType<CreateAttemptInput["resolveServer"]>>;
  requestHash: string;
  status: AttemptStatus;
  createdAt: string;
  expiresAt: string;
  reason?: string;
};
type StoredTransaction = {
  id: string;
  attemptId: string;
  attempt: StoredAttempt;
  status: TransactionStatus;
  createdAt: string;
  expiresAt: string;
};

/**
 * Deep-copies and freezes a snapshot before retaining it for a later exchange.
 *
 * @param value - Attempt or transaction data to preserve.
 * @returns An independent, deeply frozen copy of the input.
 */
function frozen<T>(value: T): T {
  const copy = structuredClone(value);
  function freezeDeep(value: unknown): void {
    if (value && typeof value === "object") {
      for (const child of Object.values(value)) freezeDeep(child);
      Object.freeze(value);
    }
  }
  freezeDeep(copy);
  return copy;
}
/**
 * Creates repository operations for Play Integrity attempts and transactions.
 *
 * @param options - Secret, issuer and audience used to sign/verify client state.
 * @returns Operations that create attempts, record verdicts and claim exchanges.
 */
export function createPlayIntegrityAttemptService(options: {
  stateSecret: string;
  stateIssuer: string;
  stateAudience: string;
}) {
  const { stateSecret, stateIssuer, stateAudience } = options;
  for (const value of [stateSecret, stateIssuer, stateAudience])
    if (!value) throw new Error("INVALID_STATE_CONFIG");
  /**
   * Creates a request-hash-bound attempt with a fixed two-minute expiry.
   *
   * @param input - Phone, client/server IDs and resolvers for their config snapshots.
   * @returns Attempt ID, request hash and expiry, or `null` if its storage key already exists.
   * @throws When input phone or resolved config is invalid.
   */
  async function createAttempt(input: CreateAttemptInput) {
    // Snapshot credentials and redirect URI now; config changes cannot alter this attempt.
    const { phoneNumber, clientId, serverId, resolveClient, resolveServer } =
      input;
    if (
      typeof clientId !== "string" ||
      !clientId ||
      typeof serverId !== "string" ||
      !serverId
    )
      throw new Error("INVALID_REQUEST");
    const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);
    const createdAt = Date.now();
    const attemptId = randomUUID();
    const [client, server] = await Promise.all([
      resolveClient(),
      resolveServer(),
    ]);
    if (!client || client.id !== clientId || !server || server.id !== serverId)
      throw new Error("INVALID_REQUEST");
    const expiresAt = new Date(createdAt + 120000).toISOString();
    const phoneNumberHash = createHash("sha256")
      .update(normalizedPhoneNumber)
      .digest("base64url");
    const requestHash = createRequestHash(ACTION, {
      attemptId,
      clientId,
      serverId,
      phoneNumberHash,
    });
    const attempt: StoredAttempt = frozen({
      id: attemptId,
      action: ACTION,
      phoneNumber: normalizedPhoneNumber,
      phoneNumberHash,
      clientId,
      serverId,
      client,
      server,
      requestHash,
      status: "created",
      createdAt: new Date(createdAt).toISOString(),
      expiresAt,
    });
    return (await createRecord(attemptKey(attemptId), attempt))
      ? { attemptId, requestHash, expiresAt }
      : null;
  }
  /**
   * Moves a stored attempt only when its current status matches `from`.
   *
   * @param id - Attempt ID.
   * @param from - Required current status.
   * @param to - New status to persist.
   * @param extra - Additional fields, such as a rejection reason.
   * @returns Updated frozen attempt, or `null` when missing, expired or already moved.
   */
  async function updateAttempt(
    id: string,
    from: AttemptStatus,
    to: AttemptStatus,
    extra: Partial<StoredAttempt> = {},
  ) {
    // Compare-and-set the expected phase so concurrent submissions cannot both proceed.
    const old = (await readRecord(attemptKey(id))) as StoredAttempt | null;
    if (!old || old.status !== from) return null;
    const next = { ...old, ...extra, status: to };
    return (await transition(attemptKey(id), from, next)) ? frozen(next) : null;
  }
  /** @param id - Attempt ID. @returns Attempt snapshot if moved from created to verifying, otherwise `null`. */
  async function claimAttempt(id: string) {
    // Only a newly created attempt can enter verification.
    return updateAttempt(id, "created", "verifying");
  }
  /** @param id - Attempt ID. @param reason - Stable policy/provider reason code. @returns Updated attempt or `null` if it was not verifying. */
  async function rejectAttempt(id: string, reason = "REJECTED") {
    // Record the reason while making the claimed attempt terminal.
    return updateAttempt(id, "verifying", "rejected", {
      reason: String(reason),
    });
  }
  /** @param id - Verifying attempt ID. @returns Approved transaction snapshot, or `null` if it could not be claimed. */
  async function approveAttempt(id: string) {
    // Atomically save the approved attempt and its separate exchange transaction.
    const old = (await readRecord(attemptKey(id))) as StoredAttempt | null;
    if (!old || old.status !== "verifying") return null;
    const transaction: StoredTransaction = {
      id: `${id}--${randomUUID()}`,
      attemptId: id,
      attempt: frozen(old),
      status: "approved",
      createdAt: new Date().toISOString(),
      expiresAt: old.expiresAt,
    };
    return (await approveRecords(id, transaction, {
      ...old,
      status: "approved",
    }))
      ? frozen(transaction)
      : null;
  }
  /** @param transaction - Approved server-side transaction. @returns Signed state valid for 120 seconds. @throws When the transaction is not approved. */
  function createSignedState(transaction: TransactionSnapshot) {
    // The token points to a server-side transaction; it does not carry provider secrets.
    if (transaction?.status !== "approved" || !transaction.attempt)
      throw new Error("INVALID_TRANSACTION");
    return jwt.sign(
      {
        typ: ACTION,
        tx: transaction.id,
        aid: transaction.attempt.id,
        act: transaction.attempt.action,
      },
      stateSecret,
      {
        algorithm: "HS512",
        expiresIn: "120s",
        issuer: stateIssuer,
        audience: stateAudience,
        jwtid: randomUUID(),
      },
    );
  }
  /** @param state - Signed state returned after a valid integrity verdict. @returns `claimed` with transaction, `invalid` for a bad signature, or `unavailable` if already used/missing. */
  async function claimTransaction(state: string) {
    // Verify the signed state, locate its transaction, then atomically mark it in use.
    let claims: string | JwtPayload;
    try {
      claims = jwt.verify(state, stateSecret, {
        algorithms: ["HS512"],
        issuer: stateIssuer,
        audience: stateAudience,
      });
    } catch {
      return { status: "invalid" };
    }
    if (typeof claims === "string") return { status: "invalid" };
    if (
      claims.typ !== ACTION ||
      typeof claims.tx !== "string" ||
      typeof claims.aid !== "string" ||
      claims.act !== ACTION ||
      !/^[-\w]+$/.test(claims.aid) ||
      !/^[-\w]+$/.test(claims.tx)
    )
      return { status: "invalid" };
    const attemptId = claims.aid;
    const transactionId = claims.tx;
    const key = transactionKey(attemptId, transactionId);
    const tx = (await readRecord(key)) as StoredTransaction | null;
    if (!tx || tx.status !== "approved") return { status: "unavailable" };
    if (
      tx.id !== claims.tx ||
      tx.attemptId !== claims.aid ||
      tx.attempt?.id !== claims.aid ||
      tx.attempt?.action !== claims.act
    )
      return { status: "invalid" };
    const next: StoredTransaction = { ...tx, status: "exchanging" };
    return (await transition(key, "approved", next))
      ? { status: "claimed", transaction: frozen(next) }
      : { status: "unavailable" };
  }
  /** @param id - Transaction ID returned by claim. @param status - Final `consumed` or `failed` status. @returns Updated frozen transaction, or `null` if it is no longer exchanging. */
  async function completeTransaction(
    id: string,
    status: Extract<TransactionStatus, "consumed" | "failed">,
  ) {
    // Close an in-flight transaction as consumed or failed, without extending its expiry.
    const attemptId = id.split("--")[0];
    const key = transactionKey(attemptId, id);
    const tx = (await readRecord(key)) as StoredTransaction | null;
    if (!tx || tx.status !== "exchanging") return null;
    const next: StoredTransaction = { ...tx, status };
    return (await transition(key, "exchanging", next)) ? frozen(next) : null;
  }
  return {
    createAttempt,
    claimAttempt,
    rejectAttempt,
    approveAttempt,
    createSignedState,
    claimTransaction,
    completeTransaction,
  };
}
