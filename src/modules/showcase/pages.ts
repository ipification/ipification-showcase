import type { Request, Response } from "express";
import {
  readSession,
  consumeSessionError,
} from "@/shared/server/session/store";
import { sessionId } from "@/shared/server/session/cookies";
import { toWebRequest } from "@/shared/server/express/http";
/** @param value - JSON token or text. @returns HTML-escaped text safe for template output. */
const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
/** @param value - Provider claims to display. @returns Pretty JSON markup with escaped, syntax-highlighted tokens. */
const resultJson = (value: unknown) =>
  (JSON.stringify(value, null, 2) || "")
    .split(
      /("(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)/g,
    )
    .map((token) => {
      const css = /^".*:\s*$/.test(token)
        ? "showcase-json-key"
        : /^(?:true|false|null|-?\d)/.test(token)
          ? "showcase-json-value"
          : "";
      return css
        ? `<span class="${css}">${escapeHtml(token)}</span>`
        : escapeHtml(token);
    })
    .join("");
/**
 * Loads the current display session and renders its provider claims.
 *
 * @param req - Express request carrying the Showcase session cookie.
 * @param res - Express response used to redirect or render the page.
 * @returns A private, no-store user-info page, login redirect, or HTTP 503.
 */
export async function renderUserInfoPage(req: Request, res: Response) {
  let session;
  try {
    session = await readSession(sessionId(toWebRequest(req)));
  } catch {
    return res
      .status(503)
      .set("Cache-Control", "private, no-store")
      .send("Service unavailable");
  }
  if (
    (!session?.isAuthenticated && !session?.displayErrorOnly) ||
    !session.userData
  )
    return res.redirect(302, "/");
  // Render only a valid display session and escape the highlighted claims before HTML output.
  const result = session.userData;
  res.set("Cache-Control", "private, no-store");
  return res.render("showcase/user-info", {
    result,
    highlightedJson: resultJson(result.userInfo),
    showExplanation: Object.hasOwn(
      result.userInfo ?? {},
      "phone_number_verified",
    ),
  });
}
/**
 * Renders and consumes the QR authentication error for the current session.
 *
 * @param req - Express request carrying the session cookie.
 * @param res - Express response used to render the QR error view.
 * @returns A private, no-store QR error page with a one-time or generic message.
 */
export async function renderQrErrorPage(req: Request, res: Response) {
  const currentSessionId = sessionId(toWebRequest(req));
  // Consume the saved error once so a later visit falls back to the generic message.
  const message = currentSessionId
    ? await consumeSessionError(currentSessionId)
    : null;
  res.set("Cache-Control", "private, no-store");
  return res.render("showcase/qr-error", {
    message: message || "Authentication unsuccessful",
  });
}

/**
 * Renders the browser authorization error using validated query parameters.
 *
 * @param req - Express request containing error reason and optional diagnostics.
 * @param res - Express response used to render the error view.
 * @returns A private, no-store error page with safe provider details.
 */
export async function renderAuthErrorPage(req: Request, res: Response) {
  // Treat query parameters as untrusted and map them to known safe error labels.
  const { authFailures, authFailureReason, safeProviderCode } =
    await import("@/shared/auth-failures");
  const reason = authFailureReason(req.query.reason);
  const failure = authFailures[reason];
  const reference =
    typeof req.query.reference === "string" &&
    /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(req.query.reference)
      ? req.query.reference
      : "";
  const status =
    typeof req.query.status === "string" && /^[45]\d{2}$/.test(req.query.status)
      ? req.query.status
      : "";
  const provider = safeProviderCode(req.query.provider_error);
  const stage =
    req.query.stage === "token"
      ? "Authorization code exchange"
      : req.query.stage === "userinfo"
        ? "Profile retrieval"
        : "";
  res.set("Cache-Control", "private, no-store");
  return res.render("errors/auth-error", {
    failure,
    reason,
    reference,
    status,
    provider,
    stage,
  });
}
