import { randomUUID } from "node:crypto";
import * as provider from "./provider";
import {
  authResultRepository,
  sessionRepository,
  type AuthResultRepository,
  type SessionRepository,
} from "./repositories";
import { notifyAuthComplete } from "@/server/realtime/notifier";
import { resolveClient, resolveServer } from "@/server/shared/errors";
import type { ServiceContext } from "@/server/shared/context";
import type { CallbackInput, MobileInput, StartInput } from "./input";
const messages: Record<string, string> = {
  access_denied: "Authentication was cancelled.",
  login_required: "Authentication is required to continue.",
  operator_not_resolved: "Your mobile operator could not be resolved.",
  server_error: "Authentication is temporarily unavailable.",
  temporarily_unavailable: "Authentication is temporarily unavailable.",
};
interface Dependencies {
  provider: Pick<
    typeof provider,
    "buildAuthorizationUrl" | "exchangeAuthorizationCode"
  >;
  results: AuthResultRepository;
  sessions: SessionRepository;
  notify: (state: string, url: string) => Promise<void>;
  id: () => string;
}
export type CallbackOutcome =
  | { kind: "provider_error"; sessionId: string }
  | { kind: "backchannel" }
  | { kind: "qr"; failed: boolean }
  | { kind: "redirect"; url: string };
export function createAuthService(overrides: Partial<Dependencies> = {}) {
  const ports: Dependencies = {
    provider,
    results: authResultRepository,
    sessions: sessionRepository,
    notify: notifyAuthComplete,
    id: randomUUID,
    ...overrides,
  };
  return {
    begin(context: ServiceContext, input: StartInput) {
      const server = resolveServer(context, input.server_id),
        client = resolveClient(context, { flow: input.user_flow });
      if (!input.state) return { kind: "login_required" } as const;
      return {
        kind: "authorize",
        url: ports.provider.buildAuthorizationUrl({
          client,
          server,
          baseUrl: context.origin,
          userFlow: client.user_flow,
          realm: context.config.realm,
          state: input.state,
          phone: input.phone,
          appEnv: context.appEnv,
        }),
      } as const;
    },
    async callback(
      context: ServiceContext,
      input: CallbackInput,
    ): Promise<CallbackOutcome> {
      const state = input.state === undefined ? ports.id() : input.state;
      if (input.error || input.error_description) {
        const existing = await ports.sessions.read(input.previousSessionId);
        const sessionId = await ports.sessions.create(
          {
            ...existing,
            isAuthenticated: existing?.isAuthenticated || false,
            errorMessage:
              messages[String(input.error)] ||
              "Unable to complete authentication.",
          },
          input.previousSessionId,
        );
        return { kind: "provider_error", sessionId };
      }
      const server = resolveServer(context, input.serverId),
        client = resolveClient(context, { flow: input.userFlow });
      const { userInfo } = await ports.provider.exchangeAuthorizationCode({
        server,
        realm: context.config.realm,
        clientId: client.client_id,
        clientSecret: client.client_secret,
        redirectUri: `${context.origin}/auth/callback/${input.userFlow}/${server.id}`,
        code: input.code,
      });
      await ports.results.saveResult(
        state,
        {
          userInfo,
          client_id: client.client_id,
          client_title: client.title || "",
          state,
        },
        userInfo,
      );
      const url = `${context.origin}/auth/complete?state=${state}`;
      if (input.backchannel) return { kind: "backchannel" };
      if (typeof state !== "string") throw new Error("Invalid state");
      if (state.includes("-qrcode")) {
        await ports.notify(state, url);
        return {
          kind: "qr",
          failed: userInfo.phone_number_verified === "false",
        };
      }
      return { kind: "redirect", url };
    },
    async complete(state: unknown, previousId: string) {
      const result = await ports.results.waitForResult(state);
      return result
        ? ports.sessions.create(
            { isAuthenticated: true, userData: result },
            previousId,
          )
        : undefined;
    },
    async mobile(context: ServiceContext, input: MobileInput) {
      const server = resolveServer(context, input.server_id),
        client = resolveClient(context, { id: input.client_id });
      const { userInfo } = await ports.provider.exchangeAuthorizationCode({
        server,
        realm: context.config.realm,
        clientId: client.client_id,
        clientSecret: client.client_secret,
        redirectUri: input.redirect_uri,
        code: input.code,
      });
      return { server, userInfo };
    },
    userInfo: (state: unknown) => ports.results.getUserInfo(state),
  };
}
export const authService = createAuthService();
