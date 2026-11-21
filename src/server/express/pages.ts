import type { Request, Response } from "express";
import { readSession, consumeSessionError } from "@/server/session/store";
import { sessionId } from "@/server/session/cookies";
import { toWebRequest } from "./http";
const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const resultJson = (value: unknown) =>
  (JSON.stringify(value, null, 2) || "")
    .split(
      /("(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)/g,
    )
    .map((token) => {
      const css = /^".*:\s*$/.test(token)
        ? "legacy-json-key"
        : /^(?:true|false|null|-?\d)/.test(token)
          ? "legacy-json-value"
          : "";
      return css
        ? `<span class="${css}">${escapeHtml(token)}</span>`
        : escapeHtml(token);
    })
    .join("");
export async function userInfo(req: Request, res: Response) {
  let session;
  try {
    session = await readSession(sessionId(toWebRequest(req)));
  } catch {
    return res
      .status(503)
      .set("Cache-Control", "private, no-store")
      .send("Service unavailable");
  }
  if (!session?.isAuthenticated || !session.userData)
    return res.redirect(302, "/");
  const result = session.userData;
  res.set("Cache-Control", "private, no-store");
  return res.render("user-info", { result, highlightedJson: resultJson(result.userInfo), showExplanation: Object.hasOwn(result.userInfo ?? {}, "phone_number_verified") });
}
export async function qrError(req: Request, res: Response) {
  const id = sessionId(toWebRequest(req));
  const message = id ? await consumeSessionError(id) : null;
  res.set("Cache-Control", "private, no-store");
  return res.render("qr-error", { message: message || "Authentication unsuccessful" });
}

export async function authError(req: Request, res: Response) {
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
  return res.render("auth-error", { failure, reason, reference, status, provider, stage });
}
