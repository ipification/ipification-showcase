const state = new URLSearchParams(location.search).get("state") || "";
const message = document.querySelector("#pending-message"),
  retry = document.querySelector("#retry");
let active = true,
  busy = false,
  deadline = Date.now() + 300000;
async function check() {
  if (!active || busy) return;
  if (Date.now() >= deadline) {
    active = false;
    location.replace("/auth/error?reason=AUTH_STATE_EXPIRED");
    return;
  }
  busy = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(
      `/auth/status?${new URLSearchParams({ state })}`,
      {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      },
    );
    const data = await response.json();
    if (!response.ok && [400, 401, 403].includes(response.status)) {
      active = false;
      location.replace(
        "/auth/error?reason=" +
          encodeURIComponent(data.error || "AUTH_STATE_EXPIRED"),
      );
    } else if (!response.ok) throw new Error("unavailable");
    else if (data.status === "finished") {
      active = false;
      location.replace("/user/info");
    } else if (["completed", "failed"].includes(data.status)) {
      const url = new URL(data.completionUrl, location.origin);
      if (
        url.origin !== location.origin ||
        url.pathname !== "/auth/complete" ||
        url.username ||
        url.password ||
        url.hash ||
        url.searchParams.getAll("state").length !== 1 ||
        url.searchParams.get("state") !== state
      )
        throw new Error("unavailable");
      active = false;
      location.replace(url.href);
    } else if (data.status === "pending") {
      if (data.started && Number.isFinite(data.expiresAt))
        deadline = Math.min(deadline, data.expiresAt);
      message.textContent =
        "Please keep this page open while your result arrives.";
      message.removeAttribute("role");
      retry.hidden = true;
    } else throw new Error("unavailable");
  } catch {
    message.textContent =
      "Connection interrupted. We will keep checking for your result.";
    message.setAttribute("role", "alert");
    retry.hidden = false;
  } finally {
    clearTimeout(timer);
    busy = false;
  }
}
retry.onclick = check;
setInterval(check, 2000);
void check();
