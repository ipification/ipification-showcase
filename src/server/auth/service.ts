import { randomUUID } from "node:crypto";
import * as provider from "./provider";
import {
  authResultRepository,
  sessionRepository,
  type AuthResultRepository,
  type SessionRepository,
} from "./repositories";
import {
  resolveClient,
  resolveServer,
  AuthAttemptError,
} from "@/server/shared/errors";
import type { ServiceContext } from "@/server/shared/context";
import type {
  CallbackInput,
  MobileInput,
  StartInput,
  PrepareInput,
} from "./input";
import {
  authAttempts,
  bindingHash,
  validState,
  AUTH_ATTEMPT_MS,
  QR_SCAN_MS,
  type AuthAttemptRepository,
} from "./attempts";
import { describeAuthFailure } from "./failure";
const genericCallbackMessage = "Unable to complete authentication.";
function callbackMessage(error: unknown, description: unknown) {
  // The provider code takes priority; redact credentials and links from displayed text.
  const value = [error, description].find(
    (item): item is string => typeof item === "string" && !!item.trim(),
  );
  if (!value) return genericCallbackMessage;
  return (
    value
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/https?:\/\/[^\s]+/gi, "[link removed]")
      .replace(
        /\b(?:access_token|refresh_token|id_token|client_secret|authorization|code|state)\s*[:=]\s*[^\s,;]+/gi,
        "[sensitive data removed]",
      )
      .replace(/\bBearer\s+[^\s,;]+/gi, "[sensitive data removed]")
      .trim()
      .slice(0, 500) || genericCallbackMessage
  );
}
interface Dependencies {
  provider: Pick<
    typeof provider,
    "buildAuthorizationUrl" | "exchangeAuthorizationCode"
  >;
  results: AuthResultRepository;
  sessions: SessionRepository;
  attempts: AuthAttemptRepository;
  id: () => string;
}
export type CallbackOutcome =
  | { kind: "provider_error"; sessionId: string; qr?: boolean }
  | { kind: "backchannel" }
  | { kind: "pending"; state: string }
  | { kind: "qr"; failed: boolean }
  | { kind: "redirect"; url: string };
export function createAuthService(overrides: Partial<Dependencies> = {}) {
  const ports: Dependencies = {
    provider,
    results: authResultRepository,
    sessions: sessionRepository,
    attempts: authAttempts,
    id: randomUUID,
    ...overrides,
  };

  async function prepareWebAuthentication(
    context: ServiceContext,
    input: PrepareInput,
    ownerToken: string,
  ) {
    const server = resolveServer(context, input.server_id);
    const client = resolveClient(context, { flow: input.user_flow });
    if (
      typeof input.qr !== "boolean" ||
      (input.qr && ["pvn_im", "login_im"].includes(client.user_flow))
    )
      throw new AuthAttemptError("AUTH_STATE_INVALID");
    const state = ports.id() + (input.qr ? "-qrcode" : "");
    const expiresAt = Date.now() + (input.qr ? QR_SCAN_MS : AUTH_ATTEMPT_MS);
    await ports.attempts.create({
      state,
      userFlow: client.user_flow,
      serverId: server.id,
      clientId: client.client_id,
      origin: context.origin,
      phone: input.phone,
      qr: input.qr,
      ownerHash: bindingHash(ownerToken),
      status: "prepared",
      expiresAt,
      ...(input.qr ? { scanExpiresAt: expiresAt } : {}),
    });
    const params = new URLSearchParams({
      user_flow: client.user_flow,
      server_id: server.id,
      state,
    });
    if (input.phone !== undefined) params.set("phone", String(input.phone));
    return { state, url: `${context.origin}/auth/start?${params}`, expiresAt };
  }

  async function startWebAuthentication(
    context: ServiceContext,
    input: StartInput,
    binding: { owner: string; callback: string },
  ) {
    const server = resolveServer(context, input.server_id);
    const client = resolveClient(context, { flow: input.user_flow });
    // A prepared attempt owns its flow, server, origin and phone; URL edits cannot change them.
    const attempt = await ports.attempts.start(
      input.state,
      {
        userFlow: client.user_flow,
        serverId: server.id,
        clientId: client.client_id,
        origin: context.origin,
      },
      binding.owner,
      binding.callback,
    );
    return {
      kind: "authorize" as const,
      state: attempt.state,
      url: ports.provider.buildAuthorizationUrl({
        client,
        server,
        baseUrl: attempt.origin,
        userFlow: client.user_flow,
        realm: context.config.realm,
        state: attempt.state,
        phone: attempt.phone,
        appEnv: context.appEnv,
      }),
    };
  }

  async function handleAuthorizationCallback(
    context: ServiceContext,
    input: CallbackInput,
  ): Promise<CallbackOutcome> {
    const providerError = [input.error, input.error_description].some(
      (value) => (typeof value === "string" ? !!value.trim() : !!value),
    );
    const missingCode = typeof input.code !== "string" || !input.code.trim();
    const callbackError = providerError || missingCode;
    const server = callbackError
      ? undefined
      : resolveServer(context, input.serverId);
    const client = callbackError
      ? undefined
      : resolveClient(context, { flow: input.userFlow });
    // Claim before any provider call, result write or session adoption.
    const attempt = await ports.attempts.claimCallback(
      input.state,
      {
        userFlow: input.userFlow,
        serverId: input.serverId,
        origin: context.origin,
      },
      input.callbackBinding,
      input.backchannel,
    );
    const completionUrl = `${attempt.origin}/auth/complete?state=${attempt.state}`;
    // IM may deliver backchannel first. A bound browser return only redirects to its stored result.
    if (
      attempt.status === "processing" &&
      attempt.backchannelProcessing &&
      !input.backchannel
    )
      return { kind: "pending", state: attempt.state };
    if (attempt.status === "completed")
      return { kind: "redirect", url: completionUrl };
    let errorSession: string | undefined;
    let userInfo;
    try {
      if (callbackError) {
        const message = callbackMessage(input.error, input.error_description);
        const failure = {
          reason: providerError
            ? ("AUTH_CANCELLED" as const)
            : ("AUTH_FAILED" as const),
          stage: "application" as const,
          callbackMessage: message,
        };
        if (!input.backchannel) {
          const existing = await ports.sessions.read(input.previousSessionId);
          errorSession = await ports.sessions.create(
            {
              ...existing,
              isAuthenticated: existing?.isAuthenticated || false,
              errorMessage: message,
            },
            input.previousSessionId,
          );
        }
        await ports.attempts.finishCallback(attempt.state, failure);
        if (input.backchannel) throw new AuthAttemptError(failure.reason);
      } else {
        if (client!.client_id !== attempt.clientId)
          throw new AuthAttemptError("AUTH_STATE_INVALID");
        // 1. Exchange the code using the callback origin captured for this attempt.
        ({ userInfo } = await ports.provider.exchangeAuthorizationCode({
          server: server!,
          realm: context.config.realm,
          clientId: client!.client_id,
          clientSecret: client!.client_secret,
          redirectUri: `${attempt.origin}/auth/callback/${attempt.userFlow}/${attempt.serverId}`,
          code: input.code,
        }));
        // 2. Store both result views before marking the attempt terminal for status polling.
        await ports.results.saveResult(
          attempt.state,
          {
            userInfo,
            client_id: client!.client_id,
            client_title: client!.title || "",
            state: attempt.state,
          },
          userInfo,
        );
        await ports.attempts.finishCallback(
          attempt.state,
          undefined,
          input.backchannel,
        );
      }
    } catch (error) {
      await ports.attempts
        .finishCallback(attempt.state, describeAuthFailure(error))
        .catch(() => {});
      throw error;
    }
    if (errorSession)
      return {
        kind: "provider_error",
        sessionId: errorSession,
        qr: attempt.qr,
      };
    if (input.backchannel) return { kind: "backchannel" };
    if (attempt.qr)
      return {
        kind: "qr",
        failed: userInfo!.phone_number_verified === "false",
      };
    return { kind: "redirect", url: completionUrl };
  }

  async function completeWebAuthentication(
    context: ServiceContext,
    state: unknown,
    previousId: string,
    ownerToken: string,
  ) {
    const attempt = await ports.attempts.claimCompletion(
      state,
      ownerToken,
      context.origin,
    );
    try {
      if (attempt.failure?.callbackMessage) {
        const existing = await ports.sessions.read(previousId);
        const sessionId = await ports.sessions.create(
          {
            ...existing,
            isAuthenticated: existing?.isAuthenticated || false,
            errorMessage: attempt.failure.callbackMessage,
          },
          previousId,
        );
        await ports.attempts.finishCompletion(attempt.state);
        return { sessionId, callbackError: true as const };
      }
      if (attempt.failure)
        throw new AuthAttemptError(
          attempt.failure.reason,
          attempt.failure.stage,
          attempt.failure.status,
          attempt.failure.providerCode,
        );
      const result = await ports.results.waitForResult(attempt.state);
      if (!result) throw new AuthAttemptError("AUTH_STATE_INVALID");
      // Same demo display-session policy as before; the attempt adds ownership/single use only.
      const id = await ports.sessions.create(
        { isAuthenticated: true, userData: result },
        previousId,
      );
      await ports.attempts.finishCompletion(attempt.state);
      return id;
    } catch (error) {
      await ports.attempts
        .finishCompletion(attempt.state, true)
        .catch(() => {});
      throw error;
    }
  }

  async function getAuthenticationStatus(
    context: ServiceContext,
    state: unknown,
    ownerToken: string,
    previousSessionId = "",
  ) {
    // Completion clears its owner cookie; an existing display session may resume only its exact state.
    if (previousSessionId && validState(state)) {
      const session = await ports.sessions.read(previousSessionId);
      if (session?.isAuthenticated && session.userData?.state === state)
        return { status: "finished" as const, started: true };
    }
    const attempt = await ports.attempts.readOwned(
      state,
      ownerToken,
      context.origin,
    );
    const ready = attempt.status === "completed" || attempt.status === "failed";
    return {
      started: attempt.status !== "prepared",
      expiresAt: attempt.expiresAt,
      status: ready
        ? attempt.status
        : attempt.status === "consumed"
          ? "finished"
          : "pending",
      completionUrl: ready
        ? `${attempt.origin}/auth/complete?state=${attempt.state}`
        : undefined,
    };
  }

  async function exchangeMobileCode(
    context: ServiceContext,
    input: MobileInput,
  ) {
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
  }
  function readS2sResult(state: unknown) {
    return ports.results.getUserInfo(state);
  }
  return {
    prepareWebAuthentication,
    startWebAuthentication,
    handleAuthorizationCallback,
    completeWebAuthentication,
    getAuthenticationStatus,
    exchangeMobileCode,
    readS2sResult,
  };
}
export const authService = createAuthService();
