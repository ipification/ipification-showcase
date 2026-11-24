import {
  authFailureReason,
  type AuthFailureReason,
} from "@/shared/auth-failures";
export type AuthStatusUpdate =
  | { kind: "pending"; started: boolean; expiresAt: number }
  | { kind: "complete"; url: string }
  | { kind: "finished" }
  | { kind: "expired"; reason: AuthFailureReason }
  | { kind: "unavailable" };

/** Accept only this app's completion route for this exact attempt. */
export function completionUrlForAttempt(
  value: unknown,
  origin: string,
  state: string,
) {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value, origin);
    if (
      url.origin === origin &&
      url.pathname === "/auth/complete" &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.searchParams.getAll("state").length === 1 &&
      url.searchParams.get("state") === state
    )
      return url.href;
  } catch {}
}

/** One cancellable polling lifecycle for QR and IM waiting. */
export function watchAuthStatus({
  state,
  origin,
  maxExpiresAt,
  onUpdate,
  intervalMs = 2000,
  requestTimeoutMs = 5000,
  fetcher = fetch,
}: {
  state: string;
  origin: string;
  maxExpiresAt: number;
  onUpdate: (update: AuthStatusUpdate) => void;
  intervalMs?: number;
  requestTimeoutMs?: number;
  fetcher?: typeof fetch;
}) {
  // One in-flight request at a time; temporary failures stay retryable until
  // a terminal response, explicit cancellation, or the overall deadline.
  let active = true,
    busy = false;
  let request: AbortController | undefined;
  let requestTimer: ReturnType<typeof setTimeout> | undefined;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let deadline = maxExpiresAt;
  function stop() {
    active = false;
    clearInterval(interval);
    clearTimeout(deadlineTimer);
    clearTimeout(requestTimer);
    request?.abort();
  }
  function emit(update: AuthStatusUpdate) {
    if (!active) return;
    if (
      update.kind === "complete" ||
      update.kind === "finished" ||
      update.kind === "expired"
    )
      stop();
    onUpdate(update);
  }
  function armDeadline(next = deadline) {
    deadline = Math.min(deadline, next);
    clearTimeout(deadlineTimer);
    deadlineTimer = setTimeout(
      () => emit({ kind: "expired", reason: "AUTH_STATE_EXPIRED" }),
      Math.max(0, deadline - Date.now()),
    );
  }
  async function check() {
    if (!active || busy) return;
    if (Date.now() >= deadline) {
      emit({ kind: "expired", reason: "AUTH_STATE_EXPIRED" });
      return;
    }
    busy = true;
    const controller = new AbortController();
    request = controller;
    requestTimer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetcher(
        new URL("/auth/status?" + new URLSearchParams({ state }), origin),
        {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        },
      );
      const value: unknown = await response.json();
      if (!active || controller.signal.aborted) return;
      const data =
        value && typeof value === "object"
          ? (value as Record<string, unknown>)
          : {};
      if (!response.ok) {
        if (
          response.status === 400 ||
          response.status === 401 ||
          response.status === 403
        )
          emit({ kind: "expired", reason: authFailureReason(data.error) });
        else emit({ kind: "unavailable" });
      } else if (data.status === "finished") {
        emit({ kind: "finished" });
      } else if (data.status === "completed" || data.status === "failed") {
        const url = completionUrlForAttempt(data.completionUrl, origin, state);
        emit(url ? { kind: "complete", url } : { kind: "unavailable" });
      } else if (
        data.status === "pending" &&
        typeof data.started === "boolean" &&
        typeof data.expiresAt === "number" &&
        Number.isFinite(data.expiresAt)
      ) {
        // Prepared QR expiry is not a hard stop: a last-second scan may already have opened a new window.
        if (data.started) armDeadline(data.expiresAt);
        emit({
          kind: "pending",
          started: data.started,
          expiresAt: data.expiresAt,
        });
      } else emit({ kind: "unavailable" });
    } catch {
      if (active) emit({ kind: "unavailable" });
    } finally {
      clearTimeout(requestTimer);
      if (request === controller) request = undefined;
      busy = false;
    }
  }
  armDeadline();
  const interval = setInterval(() => {
    void check();
  }, intervalMs);
  void check();
  return { check, stop };
}
