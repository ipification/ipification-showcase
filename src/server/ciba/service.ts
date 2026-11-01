import * as provider from "./provider";
import {
  sessionRepository,
  type SessionRepository,
} from "@/server/auth/repositories";
import {
  resolveServer,
  resolveClient,
  providerFailure,
} from "@/server/shared/errors";
import type { ServiceContext } from "@/server/shared/context";
import type { ServerClient } from "@/server/config/load";
import type { CibaInput } from "./input";
import type { UserInfo, AuthServer } from "@/shared/contracts";
type Failure = ReturnType<typeof providerFailure>;
export const failureData = (failure: Failure) => ({
  error: failure.message,
  status: failure.status,
  ...("data" in failure ? { data: failure.data } : {}),
});
interface Dependencies {
  provider: Pick<
    typeof provider,
    | "sendSmsCode"
    | "verifySmsCode"
    | "createSimCredentialRequest"
    | "exchangeSimCredential"
  >;
  sessions: SessionRepository;
}
export type StartOutcome =
  | ({ kind: "started"; server: AuthServer } & provider.CibaStartResult)
  | { kind: "failure"; server: AuthServer; failure: Failure };
export type TokenOutcome =
  | {
      kind: "token_exchanged";
      server: AuthServer;
      data: UserInfo;
      sessionId: string;
    }
  | {
      kind: "failure";
      server: AuthServer;
      failure: Failure;
      sessionId: string;
    };

export function createCibaService(overrides: Partial<Dependencies> = {}) {
  const ports = { provider, sessions: sessionRepository, ...overrides };
  function target(context: ServiceContext, input: CibaInput) {
    const server = resolveServer(context, input.server_id);
    const client = resolveClient(context, { id: input.client_id });
    return {
      server,
      client,
      credentials: {
        authServerUrl: server.url,
        realm: context.config.realm,
        clientId: client.client_id,
        clientSecret: client.client_secret,
      },
    };
  }

  async function sendSmsCode(
    context: ServiceContext,
    input: CibaInput,
  ): Promise<StartOutcome> {
    const { server, client, credentials } = target(context, input);
    try {
      const result = await ports.provider.sendSmsCode({
        ...credentials,
        scope: client.scope,
        reqScope: input.scope,
        loginHint: input.login_hint,
      });
      return { kind: "started", server, ...result };
    } catch (error) {
      return { kind: "failure", server, failure: providerFailure(error) };
    }
  }

  async function verifySmsCode(
    context: ServiceContext,
    input: CibaInput,
    previousId: string,
  ): Promise<TokenOutcome> {
    const { server, client, credentials } = target(context, input);
    return exchangeAndCreateDemoSession({
      server,
      client,
      title: client.title || "SMS",
      nonce: input.nonce,
      previousId,
      exchange: () =>
        ports.provider.verifySmsCode({
          ...credentials,
          authReqId: input.auth_req_id,
          smsCode: input.code,
        }),
    });
  }

  async function createSimCredentialRequest(
    context: ServiceContext,
    input: CibaInput,
  ): Promise<StartOutcome> {
    const { server, client, credentials } = target(context, input);
    try {
      const result = await ports.provider.createSimCredentialRequest({
        ...credentials,
        scope: client.scope,
        reqScope: input.scope,
        loginHint: input.login_hint,
        carrierHint: input.carrier_hint,
        operation: input.operation,
      });
      return { kind: "started", server, ...result };
    } catch (error) {
      return { kind: "failure", server, failure: providerFailure(error) };
    }
  }

  async function exchangeSimCredential(
    context: ServiceContext,
    input: CibaInput,
    previousId: string,
  ): Promise<TokenOutcome> {
    const { server, client, credentials } = target(context, input);
    return exchangeAndCreateDemoSession({
      server,
      client,
      title: "SIM",
      nonce: input.nonce,
      previousId,
      exchange: () =>
        ports.provider.exchangeSimCredential({
          ...credentials,
          authReqId: input.auth_req_id,
          vpToken: input.vp_token,
        }),
    });
  }

  async function exchangeAndCreateDemoSession({
    server,
    client,
    title,
    nonce,
    previousId,
    exchange,
  }: {
    server: AuthServer;
    client: ServerClient;
    title: string;
    nonce: unknown;
    previousId: string;
    exchange: () => Promise<UserInfo>;
  }): Promise<TokenOutcome> {
    // This session opens the Showcase result page for both success and error data.
    // isAuthenticated here is a demo-display flag, not a phone-verification policy.
    const createDemoDisplaySession = (data: UserInfo) =>
      ports.sessions.create(
        {
          isAuthenticated: true,
          userData: {
            userInfo: data,
            client_id: client.client_id,
            client_title: title,
            state: nonce,
          },
        },
        previousId,
      );
    try {
      const data = await exchange();
      return {
        kind: "token_exchanged",
        server,
        data,
        sessionId: await createDemoDisplaySession(data),
      };
    } catch (error) {
      const failure = providerFailure(error);
      // Preserve error display, including fallback if the first session write fails.
      return {
        kind: "failure",
        server,
        failure,
        sessionId: await createDemoDisplaySession(failureData(failure)),
      };
    }
  }

  return {
    sendSmsCode,
    verifySmsCode,
    createSimCredentialRequest,
    exchangeSimCredential,
  };
}
export const cibaService = createCibaService();
