/** Only the completion endpoint for this attempt can consume its result. */
export function completionUrlForAttempt(value, origin, state) {
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
