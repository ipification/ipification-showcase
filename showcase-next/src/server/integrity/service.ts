import type { ServiceContext } from "@/server/shared/context";
import { UpstreamUnavailableError } from "@/server/shared/errors";
import type { UserInfo } from "@/shared/contracts";
import type { IntegrityPorts } from "./ports";
import { decodeIntegrity, type IntegrityEndpoint } from "./input";
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
const denied = (
  category: IntegrityCategory,
  ...reasonCodes: string[]
): IntegrityOutcome => ({
  kind: "denied",
  category,
  decision: category === "unavailable" ? "unavailable" : "deny",
  reasonCodes,
});
export function createIntegrityService({
  attempts,
  verify,
  exchange,
  policy,
}: IntegrityPorts) {
  return {
    async execute(
      endpoint: IntegrityEndpoint,
      context: ServiceContext,
      body: Record<string, unknown>,
    ): Promise<IntegrityOutcome> {
      const input = decodeIntegrity(endpoint, body);
      if (!input) return denied("input", "INVALID_REQUEST");
      try {
        if (input.kind === "attempt") {
          const client = context.config.clients.find(
              (c) => c.user_flow === policy.userFlow,
            ),
            server = context.config.auth_servers.find(
              (s) => s.id === input.serverId,
            );
          if (!client || !server) return denied("input", "INVALID_REQUEST");
          try {
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
        if (input.kind === "verify") {
          const attempt = await attempts.claimAttempt(input.attemptId);
          if (!attempt) return denied("conflict", "ATTEMPT_UNAVAILABLE");
          try {
            const required = context.config.play_integrity_verify_domains?.some(
              (d) =>
                typeof d === "string" &&
                d.trim().toLowerCase() === context.hostname,
            );
            const verdict = required
              ? await verify({
                  integrityToken: input.token,
                  expectedRequestHash: attempt.requestHash,
                  expectedPackageName: policy.packageName,
                })
              : { decision: "allow", reasonCodes: [] };
            if (verdict.decision !== "allow") {
              await attempts.rejectAttempt(
                attempt.id,
                verdict.reasonCodes[0] || "POLICY_DENIED",
              );
              return denied("policy", ...verdict.reasonCodes);
            }
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
        const claim = await attempts.claimTransaction(input.state);
        if (claim.status === "invalid") return denied("input", "INVALID_STATE");
        if (claim.status !== "claimed" || !claim.transaction)
          return denied("conflict", "TRANSACTION_UNAVAILABLE");
        const transaction = claim.transaction,
          attempt = transaction.attempt;
        const root = `${attempt.server.url.replace(/\/$/, "")}/realms/${encodeURIComponent(attempt.server.realm)}/protocol/openid-connect`;
        try {
          const { userInfo } = await exchange(
            root + "/token",
            root + "/userinfo",
            {
              code: input.code,
              redirect_uri: attempt.client.redirectUri,
              grant_type: "authorization_code",
              client_id: attempt.client.client_id,
              client_secret: attempt.client.client_secret,
            },
          );
          await attempts.completeTransaction(transaction.id, "consumed");
          return { kind: "exchanged", userInfo };
        } catch {
          await attempts.completeTransaction(transaction.id, "failed");
          return denied("exchange", "IPIFICATION_EXCHANGE_FAILED");
        }
      } catch {
        return denied("unavailable", "SERVICE_UNAVAILABLE");
      }
    },
  };
}
