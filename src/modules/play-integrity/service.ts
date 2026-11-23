import type { ServiceContext } from "@/shared/server/common/context";
import { UpstreamUnavailableError } from "@/shared/server/common/errors";
import type { UserInfo } from "@/shared/contracts";
import type { IntegrityPorts } from "./ports";
import {
  decodeIntegrity,
  type IntegrityEndpoint,
  type CreateAttemptInput,
  type VerifyAttemptInput,
  type ExchangeCodeInput,
} from "./input";
export type IntegrityCategory =
  "input" | "conflict" | "policy" | "unavailable" | "exchange";
export type IntegrityOutcome =
  | {
      kind: "created";
      attemptId: string;
      requestHash: string;
      expiresAt: string;
    }
  | { kind: "verified"; state: string; expiresAt: string }
  | { kind: "exchanged"; userInfo: UserInfo }
  | {
      kind: "denied";
      category: IntegrityCategory;
      decision: "deny" | "unavailable";
      reasonCodes: string[];
    };
/**
 * Builds the common API outcome for an input, policy, provider or state failure.
 *
 * @param category - Failure class used to choose the public decision.
 * @param reasonCodes - Stable details describing why the operation was denied.
 * @returns A typed denial result for the HTTP handler.
 */
const denied = (
  category: IntegrityCategory,
  ...reasonCodes: string[]
): IntegrityOutcome => ({
  kind: "denied",
  category,
  decision: category === "unavailable" ? "unavailable" : "deny",
  reasonCodes,
});

/**
 * Creates the three-step Android integrity flow from repository/provider adapters.
 *
 * @param dependencies - Attempt storage, Google verifier, code exchange and policy.
 * @returns An operation dispatcher used by the Play Integrity HTTP handler.
 */
export function createIntegrityService(dependencies: IntegrityPorts) {
  const { attempts, verify, exchange, policy } = dependencies;
  /**
   * Decodes and dispatches one of the three endpoint operations.
   *
   * @param endpoint - Attempt, verify or token-exchange route operation.
   * @param context - Resolved config, request origin and host policy.
   * @param requestBody - Parsed JSON body from the client.
   * @returns A typed created/verified/exchanged result or safe denial outcome.
   */
  async function execute(
    endpoint: IntegrityEndpoint,
    context: ServiceContext,
    requestBody: Record<string, unknown>,
  ): Promise<IntegrityOutcome> {
    // Convert the endpoint's wire fields to one of the three internal operations.
    const operationInput = decodeIntegrity(endpoint, requestBody);
    if (!operationInput) return denied("input", "INVALID_REQUEST");
    try {
      // Await each step here so rejected repository promises keep the same error boundary.
      switch (operationInput.kind) {
        case "attempt":
          return await createAttempt(context, operationInput);
        case "verify":
          return await verifyAttempt(context, operationInput);
        case "exchange":
          return await exchangeAuthorizationCode(operationInput);
      }
    } catch {
      return denied("unavailable", "SERVICE_UNAVAILABLE");
    }
  }

  /**
   * Creates an attempt that binds a phone request to its client and server config.
   *
   * @param context - Resolved application config and origin.
   * @param input - Phone number and selected server ID.
   * @returns Created attempt details or an input/conflict denial.
   */
  async function createAttempt(
    context: ServiceContext,
    input: CreateAttemptInput,
  ): Promise<IntegrityOutcome> {
    // 1. Capture the configured client/server for this attempt's later exchange.
    const client = context.config.clients.find(
      (c) => c.user_flow === policy.userFlow,
    );
    const server = context.config.auth_servers.find(
      (s) => s.id === input.serverId,
    );
    if (!client || !server) return denied("input", "INVALID_REQUEST");
    try {
      // Store an immutable client/server snapshot for the later authorization-code exchange.
      const attempt = await attempts.createAttempt({
        phoneNumber: input.phoneNumber,
        clientId: client.client_id,
        serverId: server.id,
        resolveClient: () => ({
          ...client,
          id: client.client_id,
          redirectUri:
            client.redirect_uri ||
            `${context.origin}/auth/callback/${client.user_flow}/${server.id}`,
        }),
        resolveServer: () => ({ ...server, realm: context.config.realm }),
      });
      return attempt
        ? { kind: "created", ...attempt }
        : denied("conflict", "ATTEMPT_UNAVAILABLE");
    } catch {
      return denied("input", "INVALID_REQUEST");
    }
  }

  /**
   * Claims an attempt, verifies Google's verdict, and returns signed state on approval.
   *
   * @param context - Resolved application config and request policy.
   * @param input - Attempt ID and opaque Google integrity token.
   * @returns Signed state when allowed, or policy/unavailable/conflict denial.
   */
  async function verifyAttempt(
    context: ServiceContext,
    input: VerifyAttemptInput,
  ): Promise<IntegrityOutcome> {
    // 2. Claim once before verification; keep atomic state changes in the repository.
    const attempt = await attempts.claimAttempt(input.attemptId);
    if (!attempt) return denied("conflict", "ATTEMPT_UNAVAILABLE");
    try {
      // Compare Google's decoded token with the exact request hash created in step 1.
      const verdict = await verify({
        integrityToken: input.token,
        expectedRequestHash: attempt.requestHash,
        expectedPackageName: policy.packageName,
      });
      if (verdict.decision !== "allow") {
        // Rejected attempts are terminal and cannot be verified again.
        await attempts.rejectAttempt(
          attempt.id,
          verdict.reasonCodes[0] || "POLICY_DENIED",
        );
        return denied("policy", ...verdict.reasonCodes);
      }
      // Approval creates the single-use transaction that the client receives as signed state.
      const transaction = await attempts.approveAttempt(attempt.id);
      return transaction
        ? {
            kind: "verified",
            state: attempts.createSignedState(transaction),
            expiresAt: transaction.expiresAt,
          }
        : denied("conflict", "ATTEMPT_UNAVAILABLE");
    } catch (error) {
      const reason =
        error instanceof UpstreamUnavailableError
          ? error.reasonCode
          : "GOOGLE_VERIFICATION_FAILED";
      await attempts.rejectAttempt(attempt.id, reason);
      return denied("unavailable", reason);
    }
  }

  /**
   * Claims signed state once, exchanges the code, and closes the transaction.
   *
   * @param input - Authorization code and signed state returned from verification.
   * @returns Provider claims, or invalid/conflict/provider failure outcome.
   */
  async function exchangeAuthorizationCode(
    input: ExchangeCodeInput,
  ): Promise<IntegrityOutcome> {
    // 3. Claim the signed transaction and use its captured credentials/redirect.
    const claim = await attempts.claimTransaction(input.state);
    if (claim.status === "invalid") return denied("input", "INVALID_STATE");
    if (claim.status !== "claimed" || !claim.transaction)
      return denied("conflict", "TRANSACTION_UNAVAILABLE");
    const transaction = claim.transaction;
    const attempt = transaction.attempt;
    const serverUrl = attempt.server.url.replace(/\/$/, "");
    const realmPath = `/realms/${encodeURIComponent(attempt.server.realm)}`;
    const oidcEndpoint = `${serverUrl}${realmPath}/protocol/openid-connect`;
    try {
      // Exchange only after the transaction is claimed, using its saved client credentials.
      const { userInfo } = await exchange(
        `${oidcEndpoint}/token`,
        `${oidcEndpoint}/userinfo`,
        {
          code: input.code,
          redirect_uri: attempt.client.redirectUri,
          grant_type: "authorization_code",
          client_id: attempt.client.client_id,
          client_secret: attempt.client.client_secret,
        },
      );
      // Consume the transaction before returning claims so a repeated state cannot exchange again.
      await attempts.completeTransaction(transaction.id, "consumed");
      return { kind: "exchanged", userInfo };
    } catch {
      // Provider failures also close the transaction; clients must start a new attempt.
      await attempts.completeTransaction(transaction.id, "failed");
      return denied("exchange", "IPIFICATION_EXCHANGE_FAILED");
    }
  }

  return { execute };
}
