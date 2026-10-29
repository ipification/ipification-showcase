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
import type { CibaInput } from "./input";
import type { UserInfo, AuthServer } from "@/shared/contracts";
type Failure = ReturnType<typeof providerFailure>;
export const failureData = (failure: Failure) => ({
  error: failure.message,
  status: failure.status,
  ...("data" in failure ? { data: failure.data } : {}),
});
interface Dependencies {
  provider: Pick<typeof provider, "startAuthentication" | "exchangeToken">;
  sessions: SessionRepository;
}
type TokenOutcome =
  | { kind: "verified"; server: AuthServer; data: UserInfo; sessionId: string }
  | {
      kind: "failure";
      server: AuthServer;
      failure: Failure;
      sessionId: string;
    };
export function createCibaService(overrides: Partial<Dependencies> = {}) {
  const ports = { provider, sessions: sessionRepository, ...overrides };
  function target(context: ServiceContext, input: CibaInput) {
    const server = resolveServer(context, input.server_id),
      client = resolveClient(context, { id: input.client_id });
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
  return {
    async start(
      context: ServiceContext,
      protocol: provider.Protocol,
      input: CibaInput,
    ) {
      const { server, client, credentials } = target(context, input);
      try {
        const result = await ports.provider.startAuthentication(protocol, {
          ...credentials,
          scope: client.scope,
          reqScope: input.scope,
          loginHint: input.login_hint,
          carrierHint: input.carrier_hint,
          operation: input.operation,
        });
        return { kind: "started", server, ...result } as const;
      } catch (error) {
        return {
          kind: "failure",
          server,
          failure: providerFailure(error),
        } as const;
      }
    },
    async token(
      context: ServiceContext,
      protocol: provider.Protocol,
      input: CibaInput,
      previousId: string,
    ): Promise<TokenOutcome> {
      const { server, client, credentials } = target(context, input);
      const display = (data: UserInfo) =>
        ports.sessions.create(
          {
            isAuthenticated: true,
            userData: {
              userInfo: data,
              client_id: client.client_id,
              client_title: protocol === "ts43" ? "SIM" : client.title || "SMS",
              state: input.nonce,
            },
          },
          previousId,
        );
      try {
        const data = await ports.provider.exchangeToken(protocol, {
          ...credentials,
          authReqId: input.auth_req_id,
          vpToken: input.vp_token,
          smsCode: input.code,
        });
        return {
          kind: "verified",
          server,
          data,
          sessionId: await display(data),
        };
      } catch (error) {
        const failure = providerFailure(error);
        return {
          kind: "failure",
          server,
          failure,
          sessionId: await display(failureData(failure)),
        };
      }
    },
  };
}
export const cibaService = createCibaService();
