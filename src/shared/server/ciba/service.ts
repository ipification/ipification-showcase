import * as provider from "./provider";
import {
  sessionRepository,
  type SessionRepository,
} from "@/shared/server/session/store";
import {
  resolveServer,
  resolveClient,
  providerFailure,
} from "@/shared/server/common/errors";
import type { ServiceContext } from "@/shared/server/common/context";
import type { ServerClient } from "@/config/load";
import type { CibaInput } from "./input";
import type { UserInfo, AuthServer } from "@/shared/contracts";
type Failure = ReturnType<typeof providerFailure>;
/**
 * Converts a normalized provider failure to fields returned by SMS/SIM endpoints.
 *
 * @param failure - Provider error normalized by `providerFailure`.
 * @returns Public error message/status and optional safe provider data.
 */
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

/**
 * Creates shared operations for starting and exchanging SMS/SIM CIBA requests.
 *
 * @param overrides - Optional provider or session implementations.
 * @returns The four endpoint operations used by the SMS and SIM modules.
 */
export function createCibaService(overrides: Partial<Dependencies> = {}) {
  const ports = { provider, sessions: sessionRepository, ...overrides };
  /**
   * Resolves configured client/server values and provider credentials for a request.
   *
   * @param context - Resolved app config and request origin.
   * @param input - CIBA request fields containing client/server IDs.
   * @returns Selected client/server and credentials for provider calls.
   */
  function target(context: ServiceContext, input: CibaInput) {
    // Resolve the client and server once so every provider call uses one config snapshot.
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

  /**
   * Starts an SMS challenge with the provider.
   *
   * @param context - Resolved app configuration and request origin.
   * @param input - Client/server IDs, phone hint and requested scope.
   * @returns Challenge ID and nonce, or normalized provider failure details.
   */
  async function sendSmsCode(
    context: ServiceContext,
    input: CibaInput,
  ): Promise<StartOutcome> {
    const { server, client, credentials } = target(context, input);
    try {
      // Provider response supplies the auth request ID and nonce needed by /sms/token.
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

  /**
   * Submits an OTP to the provider and creates a Showcase display session.
   *
   * @param context - Resolved app configuration and request origin.
   * @param input - Challenge ID, OTP, expected nonce and client/server IDs.
   * @param previousId - Existing Showcase session ID to replace or continue.
   * @returns Provider claims and display-session ID, or failure details and an error-display session.
   */
  async function verifySmsCode(
    context: ServiceContext,
    input: CibaInput,
    previousId: string,
  ): Promise<TokenOutcome> {
    const { server, client, credentials } = target(context, input);
    // The shared helper exchanges the code and creates the Showcase result session.
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

  /**
   * Creates the provider's SIM credential request for a browser.
   *
   * @param context - Resolved app configuration and request origin.
   * @param input - Client/server IDs, phone/carrier hints, scope and operation.
   * @returns Challenge ID, nonce and digital request, or normalized provider failure details.
   */
  async function createSimCredentialRequest(
    context: ServiceContext,
    input: CibaInput,
  ): Promise<StartOutcome> {
    const { server, client, credentials } = target(context, input);
    try {
      // Provider returns the auth request ID, nonce and browser-ready digital request.
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

  /**
   * Submits a SIM credential to the provider and creates a Showcase display session.
   *
   * @param context - Resolved app configuration and request origin.
   * @param input - Digital credential, challenge ID, nonce and client/server IDs.
   * @param previousId - Existing Showcase session ID to replace or continue.
   * @returns Provider claims and display-session ID, or failure details and an error-display session.
   */
  async function exchangeSimCredential(
    context: ServiceContext,
    input: CibaInput,
    previousId: string,
  ): Promise<TokenOutcome> {
    const { server, client, credentials } = target(context, input);
    // Use the common result-session path after exchanging the SIM credential.
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

  /**
   * Runs the selected provider exchange and stores claims/error data for Showcase display.
   *
   * @param options - Provider target, display labels, nonce, previous session and exchange function.
   * @returns Success or failure data together with the session ID used by the result page.
   */
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
    // Both SMS and SIM share the same exchange -> result-session response flow.
    // This session opens the Showcase result page for both success and error data.
    // isAuthenticated here is a demo-display flag, not a phone-verification policy.
    /** @param data - Claims or safe error fields to display. @param failed - Whether to mark this as error-only display. @returns New Showcase session ID. */
    const createDemoDisplaySession = (data: UserInfo, failed = false) =>
      ports.sessions.create(
        {
          isAuthenticated: !failed,
          ...(failed ? { displayErrorOnly: true } : {}),
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
        sessionId: await createDemoDisplaySession(failureData(failure), true),
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
