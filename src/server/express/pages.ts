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
const html = (content: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/css/showcase.css"><title>IPification Showcase</title></head><body>${content}</body></html>`;
export async function userInfo(req: Request, res: Response) {
  const session = await readSession(sessionId(toWebRequest(req)));
  if (!session?.isAuthenticated || !session.userData)
    return res.redirect(302, "/");
  const result = session.userData;
  const explanation = Object.hasOwn(
    result.userInfo ?? {},
    "phone_number_verified",
  )
    ? `<aside class="legacy-result-help" aria-label="Phone verification explanation"><h2>About <code>phone_number_verified</code></h2><p><code>true</code> / <code>"true"</code>: <span>Phone verification succeeded.</span></p><p><code>false</code> / <code>"false"</code>: <span>Phone verification did not succeed. Retry or use another method, such as SMS OTP.</span></p><p>Missing or other values do not confirm phone verification.</p><p>Check this value in your backend before accepting verification. The string <code>"false"</code> is truthy in JavaScript.</p></aside>`
    : "";
  res.set("Cache-Control", "private, no-store");
  return res.send(
    html(
      `<div class="legacy-result-page"><main class="legacy-result"><header><h1>${escapeHtml(result.client_title)}</h1><a href="/" class="legacy-result-close" aria-label="Back to Showcase">×</a></header><section aria-label="Userinfo"><button type="button" id="copy-json">Copy JSON</button><span role="status" id="copy-status"></span><pre class="legacy-result-json">${resultJson(result.userInfo)}</pre></section>${explanation}<footer><div>client id: ${escapeHtml(result.client_id)}</div><div>state: ${escapeHtml(result.state)}</div></footer></main></div><script type="module" src="/js/result.js"></script>`,
    ),
  );
}
export async function qrError(req: Request, res: Response) {
  const id = sessionId(toWebRequest(req));
  const message = id ? await consumeSessionError(id) : null;
  res.set("Cache-Control", "private, no-store");
  return res.send(
    html(
      `<main class="legacy-status-page"><div class="legacy-status-message"><h1>Failure</h1><p>${escapeHtml(message || "Authentication unsuccessful")}</p><span class="legacy-status-error" aria-hidden="true"></span><a class="sr-only" href="/auth/login">Try again</a></div></main>`,
    ),
  );
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
  return res.send(
    html(
      `<main class="legacy-error-page"><article><div class="error-icon" aria-hidden="true">ⓘ</div><p class="error-brand">IPification Showcase</p><h1>${escapeHtml(failure.title)}</h1><p>${escapeHtml(failure.description)}</p><div class="error-advice"><h2>What you can do</h2><p>${escapeHtml(failure.action)}</p></div><details><summary>Error details</summary><dl><dt>Error code</dt><dd>${escapeHtml(reason)}</dd>${stage ? `<dt>Step</dt><dd>${escapeHtml(stage)}</dd>` : ""}${status ? `<dt>Provider HTTP status</dt><dd>${escapeHtml(status)}</dd>` : ""}${provider ? `<dt>Provider error</dt><dd>${escapeHtml(provider)}</dd>` : ""}</dl></details>${reference ? `<p class="error-reference">Support reference: ${escapeHtml(reference)}</p>` : ""}<a class="error-return" href="/auth/login"><span aria-hidden="true">← &nbsp;</span>Try again</a></article></main>`,
    ),
  );
}
