import { randomUUID } from "node:crypto";
import { buildAuthorizationUrl } from "./provider";
import { exchangeAuthorizationCode } from "@/shared/server/common/authorization-code";
import { validState } from "@/shared/server/storage/auth-state";
import { authResultStore } from "@/shared/server/storage/auth-results";
import {
  sessionRepository,
  type SessionRepository,
} from "@/shared/server/session/store";
import {
  resolveClient,
  resolveServer,
  AuthAttemptError,
} from "@/shared/server/common/errors";
import type { ServiceContext } from "@/shared/server/common/context";
import type { CallbackInput, StartInput, PrepareInput } from "./input";
import {
  authAttempts,
  bindingHash,
  AUTH_ATTEMPT_MS,
  QR_SCAN_MS,
  type AuthAttempt,
  type AuthAttemptRepository,
} from "./attempts";
import { describeAuthFailure } from "./failure";
const genericCallbackMessage = "Unable to complete authentication.";
/**
 * Sanitizes text returned by a provider before it is stored for display.
 *
 * @param error - Provider error code or short error value.
 * @param description - Optional provider explanation.
 * @returns Redacted, control-character-free text truncated to 500 characters, or a generic message.
 */
function sanitizeCallbackMessage(error: unknown, description: unknown) {
  // The provider code takes priority; redact credentials and links from displayed text.
  const value = [error, description].find(
    (item): item is string => typeof item === "string" && !!item.trim(),
  );
  if (!value) return genericCallbackMessage;
  return (
    // Provider error text is untrusted: remove secrets, links and control chars before display.
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
  provider: {
    buildAuthorizationUrl: typeof buildAuthorizationUrl;
    exchangeAuthorizationCode: typeof exchangeAuthorizationCode;
  };
  results: Pick<typeof authResultStore, "saveResult" | "readDisplayResult">;
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
/**
 * Creates browser authorization operations with replaceable provider and storage dependencies.
 *
 * @param overrides - Optional ports used to provide alternate implementations.
 * @returns Operations for preparing, starting, completing, and checking browser attempts.
 */
export function createAuthService(overrides: Partial<Dependencies> = {}) {
  const ports: Dependencies = {
    provider: { buildAuthorizationUrl, exchangeAuthorizationCode },
    results: authResultStore,
    sessions: sessionRepository,
    attempts: authAttempts,
    id: randomUUID,
    ...overrides,
  };

  /**
   * Creates the server-side record and start URL for a browser login attempt.
   *
   * @param context - Resolved application config, origin and runtime settings.
   * @param input - Requested flow, server, phone and QR option.
   * @param ownerToken - Random cookie token held by the initiating browser.
   * @returns Attempt state, start URL and logical expiry time.
   */
  async function prepareWebAuthentication(
    context: ServiceContext,
    input: PrepareInput,
    ownerToken: string,
  ) {
    // Step 1: resolve the configured flow and save an owner-bound attempt.
    const server = resolveServer(context, input.server_id);
    const client = resolveClient(context, { flow: input.user_flow });
    if (
      typeof input.qr !== "boolean" ||
      (input.qr && ["pvn_im", "login_im"].includes(client.user_flow))
    )
      throw new AuthAttemptError("AUTH_STATE_INVALID");
    const state = ports.id() + (input.qr ? "-qrcode" : "");
    const expiresAt = Date.now() + (input.qr ? QR_SCAN_MS : AUTH_ATTEMPT_MS);
    // Save the attempt before returning its URL so later steps can trust the saved
    // flow, origin, nonce and owner binding instead of editable query parameters.
    await ports.attempts.create({
      state,
      userFlow: client.user_flow,
      serverId: server.id,
      clientId: client.client_id,
      origin: context.origin,
      phone: input.phone,
      qr: input.qr,
      ownerHash: bindingHash(ownerToken),
      nonce: randomUUID(),
      status: "prepared",
      expiresAt,
      ...(input.qr ? { scanExpiresAt: expiresAt } : {}),
    });
    // The URL only carries the values needed to locate and start this saved attempt.
    const params = new URLSearchParams({
      user_flow: client.user_flow,
      server_id: server.id,
      state,
    });
    if (input.phone !== undefined) params.set("phone", String(input.phone));
    return { state, url: `${context.origin}/auth/start?${params}`, expiresAt };
  }

  /**
   * Validates a prepared attempt and builds its provider authorization redirect.
   *
   * @param context - Resolved application config and request origin.
   * @param input - Flow, server and state from the prepared start URL.
   * @param binding - Owner and callback browser tokens.
   * @returns Provider authorization URL and the validated attempt state.
   */
  async function startPreparedAttempt(
    context: ServiceContext,
    input: StartInput,
    binding: { owner: string; callback: string },
  ) {
    // Step 2: claim the prepared attempt, then build its provider redirect.
    const server = resolveServer(context, input.server_id);
    const client = resolveClient(context, { flow: input.user_flow });
    // Validate and start the saved attempt before sending the user to IPification.
    // The saved flow, server, origin and phone take precedence over URL edits.
    // Atomically verify the owner and move prepared -> started; replayed links fail here.
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
    // Build the provider URL from the validated attempt, including its state and nonce.
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
        nonce: attempt.nonce,
        phone: attempt.phone,
        appEnv: context.appEnv,
      }),
    };
  }

  /**
   * Saves a provider callback error for the browser and marks the attempt failed.
   *
   * @param attempt - The attempt already claimed by this callback.
   * @param input - Callback fields and browser/session details.
   * @param providerError - True when the provider returned an explicit error.
   * @returns A display-session ID for browser callbacks, or undefined for backchannel callbacks.
   */
  async function saveCallbackFailure(
    attempt: AuthAttempt,
    input: CallbackInput,
    providerError: boolean,
  ) {
    const message = sanitizeCallbackMessage(
      input.error,
      input.error_description,
    );
    const failure = {
      reason: providerError
        ? ("AUTH_CANCELLED" as const)
        : ("AUTH_FAILED" as const),
      stage: "application" as const,
      callbackMessage: message,
    };
    // Browser callbacks need a display session for the error page; backchannel calls do not.
    let displaySessionId: string | undefined;
    if (!input.backchannel) {
      const existingSession = await ports.sessions.read(input.previousSessionId);
      displaySessionId = await ports.sessions.create(
        {
          ...existingSession,
          isAuthenticated: existingSession?.isAuthenticated || false,
          errorMessage: message,
        },
        input.previousSessionId,
      );
    }
    // Record failure before returning, so the owner browser's status poll can finish the flow.
    await ports.attempts.finishCallback(attempt.state, failure);
    if (input.backchannel) throw new AuthAttemptError(failure.reason);
    return displaySessionId;
  }

  /**
   * Exchanges a claimed callback code, stores user claims, and completes the attempt.
   *
   * @param context - Resolved app context used for provider exchange.
   * @param attempt - The claimed attempt containing its saved origin, state and nonce.
   * @param input - Provider callback fields.
   * @param client - Configured client whose ID must match the saved attempt.
   * @param server - Configured authorization server.
   * @returns Provider user claims after the result and completed state are saved.
   */
  async function exchangeAndSaveCallbackResult(
    context: ServiceContext,
    attempt: AuthAttempt,
    input: CallbackInput,
    client: ReturnType<typeof resolveClient>,
    server: ReturnType<typeof resolveServer>,
  ) {
    if (client.client_id !== attempt.clientId)
      throw new AuthAttemptError("AUTH_STATE_INVALID");
    // Exchange with the callback URI saved for this attempt, plus its expected state and nonce.
    const { userInfo } = await ports.provider.exchangeAuthorizationCode({
      server,
      realm: context.config.realm,
      clientId: client.client_id,
      clientSecret: client.client_secret,
      redirectUri: `${attempt.origin}/auth/callback/${attempt.userFlow}/${attempt.serverId}`,
      code: input.code,
      browser: { state: attempt.state, nonce: attempt.nonce },
    });
    // Save claims before marking the attempt complete; status polling must never beat the write.
    await ports.results.saveResult(attempt.state, {
      userInfo,
      client_id: client.client_id,
      client_title: client.title || "",
      state: attempt.state,
    });
    await ports.attempts.finishCallback(attempt.state, undefined, input.backchannel);
    return userInfo;
  }

  /**
   * Claims and processes a browser or backchannel authorization callback.
   *
   * @param context - Resolved app context and request origin.
   * @param input - Provider callback plus browser binding and session metadata.
   * @returns A typed outcome for pending, error, QR, backchannel or redirect handling.
   */
  async function handleAuthorizationCallback(
    context: ServiceContext,
    input: CallbackInput,
  ): Promise<CallbackOutcome> {
    // Step 3: validate and claim the callback before exchanging or saving anything.
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
    // Claim once before calling the provider or writing a result, preventing callback replay.
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
    let errorDisplaySessionId: string | undefined;
    let userInfo;
    try {
      if (callbackError) {
        errorDisplaySessionId = await saveCallbackFailure(
          attempt,
          input,
          providerError,
        );
      } else {
        // 1. Exchange the code using the callback origin captured for this attempt.
        // 2. Save the result before marking the attempt terminal for status polling.
        userInfo = await exchangeAndSaveCallbackResult(
          context,
          attempt,
          input,
          client!,
          server!,
        );
      }
    } catch (error) {
      await ports.attempts
        .finishCallback(attempt.state, describeAuthFailure(error))
        .catch(() => {});
      throw error;
    }
    if (errorDisplaySessionId)
      return {
        kind: "provider_error",
        sessionId: errorDisplaySessionId,
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

  /**
   * Claims a finished attempt and creates the browser's result or error session.
   *
   * @param context - Resolved app context and request origin.
   * @param state - Attempt state from the completion URL.
   * @param previousId - Current Showcase session ID, if present.
   * @param ownerToken - Initiating browser's owner binding token.
   * @returns The new session ID on success, or a callback-error session result.
   */
  async function completeWebAuthentication(
    context: ServiceContext,
    state: unknown,
    previousId: string,
    ownerToken: string,
  ) {
    // Step 4: only the initiating browser can claim the display result once.
    const attempt = await ports.attempts.claimCompletion(
      state,
      ownerToken,
      context.origin,
    );
    try {
      if (attempt.failure?.callbackMessage) {
        // Recreate the callback error in this browser's session, then consume the attempt.
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
      // The callback stored this display result before setting the attempt to completed.
      const result = await ports.results.readDisplayResult(attempt.state);
      if (!result) throw new AuthAttemptError("AUTH_STATE_INVALID");
      // Same demo display-session policy as before; the attempt adds ownership/single use only.
      // Create the Showcase display session from the saved claims, then mark completion consumed.
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

  /**
   * Reads attempt progress for its owner without returning provider claims.
   *
   * @param context - Resolved app context and origin.
   * @param state - Attempt state being polled.
   * @param ownerToken - Initiating browser's owner binding token.
   * @param previousSessionId - Optional display session that already completed this state.
   * @returns Public status, expiry, start flag and completion URL when ready.
   */
  async function getAuthenticationStatus(
    context: ServiceContext,
    state: unknown,
    ownerToken: string,
    previousSessionId = "",
  ) {
    // Polling reports state only; it does not claim or expose the provider claims.
    // Completion clears its owner cookie; an existing display session may resume only its exact state.
    if (previousSessionId && validState(state)) {
      const session = await ports.sessions.read(previousSessionId);
      if (session?.isAuthenticated && session.userData?.state === state)
        return { status: "finished" as const, started: true };
    }
    // Read only the owner's attempt status; claims are exposed later through completion.
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

  return {
    prepareWebAuthentication,
    startPreparedAttempt,
    handleAuthorizationCallback,
    completeWebAuthentication,
    getAuthenticationStatus,
  };
}
export const authService = createAuthService();
