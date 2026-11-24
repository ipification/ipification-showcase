import type { ServiceContext } from "./context";
import type { AuthFailureReason } from "@/shared/auth-failures";
export class AuthAttemptError extends Error {
  constructor(
    readonly reason: AuthFailureReason,
    readonly stage: "token" | "userinfo" | "application" = "application",
    readonly status?: number,
    readonly providerCode?: string,
  ) {
    super(reason);
    this.name = "AuthAttemptError";
  }
}
export class ApplicationError extends Error {
  constructor(
    readonly code: "SERVER_NOT_FOUND" | "CLIENT_NOT_FOUND",
    readonly input?: unknown,
  ) {
    super(code);
  }
}
export function resolveServer(context: ServiceContext, id: unknown) {
  const server = id
    ? context.config.auth_servers.find((s) => s.id === id)
    : context.config.auth_servers[0];
  if (!server) throw new ApplicationError("SERVER_NOT_FOUND", id);
  return server;
}
export function resolveClient(
  context: ServiceContext,
  selector: { id: unknown } | { flow: unknown },
) {
  const client = context.config.clients.find((c) =>
    "id" in selector
      ? c.client_id === selector.id
      : c.user_flow === selector.flow,
  );
  if (!client) throw new ApplicationError("CLIENT_NOT_FOUND");
  return client;
}
export function providerFailure(error: unknown) {
  if (error instanceof ProviderError)
    return {
      message: error.message,
      status: error.status || 500,
      ...(error.data ? { data: error.data } : {}),
    };
  const e =
    error && typeof error === "object"
      ? (error as {
          message?: unknown;
          response?: { status?: unknown; data?: unknown };
        })
      : {};
  return {
    message:
      typeof e.message === "string" && e.message
        ? e.message
        : "Authentication failed",
    status:
      typeof e.response?.status === "number" && e.response.status
        ? e.response.status
        : 500,
    ...(e.response?.data ? { data: e.response.data } : {}),
  };
}

export class UpstreamUnavailableError extends Error {
  constructor(
    readonly reasonCode: string,
    cause: unknown,
  ) {
    super(reasonCode, { cause });
    this.name = "UpstreamUnavailableError";
  }
}

export type ProviderStep = "authentication" | "dcql" | "token" | "userinfo";
/** Provider boundary only; raw payload remains private unless an existing API contract exposes it. */
export class ProviderRequestTimeoutError extends Error {
  constructor() {
    super("Authentication provider did not respond in time.");
    this.name = "ProviderRequestTimeoutError";
  }
}
export class ProviderError extends Error {
  readonly timedOut: boolean;
  readonly status?: number;
  readonly data?: unknown;
  constructor(
    readonly step: ProviderStep,
    error: unknown,
  ) {
    const details = providerFailure(error);
    super(details.message);
    this.name = "ProviderError";
    this.timedOut =
      error instanceof ProviderRequestTimeoutError ||
      (error instanceof ProviderError && error.timedOut);
    const raw =
      error && typeof error === "object"
        ? (error as { response?: { status?: unknown } })
        : {};
    this.status =
      error instanceof ProviderError
        ? error.status
        : typeof raw.response?.status === "number"
          ? raw.response.status
          : undefined;
    this.data = details.data;
  }
}

export class InvalidTokenResponseError extends ProviderError {
  constructor() {
    super(
      "token",
      new Error("Authentication provider returned an invalid token response"),
    );
    this.name = "InvalidTokenResponseError";
  }
}
export async function providerCall<T>(
  step: ProviderStep,
  call: () => Promise<T>,
): Promise<T> {
  try {
    return await call();
  } catch (error) {
    throw error instanceof ProviderError
      ? error
      : new ProviderError(step, error);
  }
}
