import type { UserInfo } from "@/shared/contracts";
export interface ClientSnapshot {
  id?: string;
  client_id: string;
  client_secret: string;
  redirectUri: string;
}
export interface ServerSnapshot {
  id?: string;
  url: string;
  realm: string;
}
export interface AttemptSnapshot {
  id: string;
  action?: string;
  requestHash: string;
  client: ClientSnapshot;
  server: ServerSnapshot;
}
export interface TransactionSnapshot {
  id: string;
  status: string;
  expiresAt: string;
  attempt: AttemptSnapshot;
}
export interface AttemptRepository {
  createAttempt(input: {
    phoneNumber: string;
    clientId: string;
    serverId: string;
    resolveClient: () => ClientSnapshot & { id: string };
    resolveServer: () => ServerSnapshot & { id: string };
  }): Promise<{
    attemptId: string;
    requestHash: string;
    expiresAt: string;
  } | null>;
  claimAttempt(id: string): Promise<AttemptSnapshot | null>;
  rejectAttempt(id: string, reason: string): Promise<unknown>;
  approveAttempt(id: string): Promise<TransactionSnapshot | null>;
  createSignedState(transaction: TransactionSnapshot): string;
  claimTransaction(
    state: string,
  ): Promise<{ status: string; transaction?: TransactionSnapshot }>;
  completeTransaction(
    id: string,
    status: "consumed" | "failed",
  ): Promise<unknown>;
}
export interface IntegrityPorts {
  attempts: AttemptRepository;
  verify: (input: {
    integrityToken: string;
    expectedRequestHash: string;
    expectedPackageName?: string;
  }) => Promise<{ decision: string; reasonCodes: string[] }>;
  exchange: (
    tokenUrl: string,
    userUrl: string,
    params: Record<string, unknown>,
  ) => Promise<{ userInfo: UserInfo }>;
  policy: { userFlow?: string; packageName?: string };
}
