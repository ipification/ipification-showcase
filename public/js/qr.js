import qrcode from "/vendor/qrcode/qrcode.mjs";
import { completionUrlForAttempt } from "./completion-url.js";

export function showQr(attempt, client, token, { start, endFlow }) {
  const dialog = document.createElement("dialog");
  dialog.className = "legacy-dialog legacy-qr-dialog";
  dialog.tabIndex = -1;
  dialog.dataset.slot = "dialog-content";
  dialog.setAttribute("aria-label", client.title || "Verify your identity");
  dialog.innerHTML = `<header data-slot="dialog-header"><h2 data-slot="dialog-title"></h2></header><div class="legacy-qr-content"></div><div class="legacy-qr-caption"></div><button type="button" data-slot="dialog-close" aria-label="Close">×</button>`;
  dialog.querySelector("h2").textContent =
    client.title || "Verify your identity";
  const content = dialog.querySelector(".legacy-qr-content"),
    caption = dialog.querySelector(".legacy-qr-caption");
  let deadline = attempt.expiresAt,
    started = false,
    disconnected = false,
    active = true,
    busy = false,
    requestController;
  const code = qrcode(0, "L");
  code.addData(attempt.url);
  code.make();
  function draw() {
    const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    if (!left) {
      content.innerHTML =
        '<div class="legacy-qr-recovery"><strong>QR code expired</strong><p>This verification link has expired. Create a new QR code to continue.</p></div>';
      caption.innerHTML =
        '<p>Create a new code to restart verification.</p><button class="legacy-action" type="button">Create new QR code</button>';
      caption.querySelector("button").onclick = () => {
        endFlow(token);
        dialog.close();
        void start(client);
      };
      return;
    }
    if (disconnected) {
      content.innerHTML =
        '<div class="legacy-qr-recovery"><strong>Connection interrupted</strong><p>Check your connection, then create a new QR code to continue.</p></div>';
      caption.innerHTML =
        '<p>Unable to receive verification updates.</p><button class="legacy-action" type="button">Create new QR code</button>';
      caption.querySelector("button").onclick = () => {
        endFlow(token);
        dialog.close();
        void start(client);
      };
      return;
    }
    const countdown = `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
    content.innerHTML = started
      ? '<p role="status">Verification in progress… Complete the steps on your phone.</p>'
      : `<div class="legacy-qr-code">${code.createSvgTag({ cellSize: 4, margin: 0 })}</div><a data-testid="qr-auth-link" class="sr-only" target="_blank" rel="noreferrer"></a>`;
    const link = content.querySelector("a");
    if (link) {
      link.href = attempt.url;
      link.textContent = "Open verification link";
    }
    caption.innerHTML = `${started ? "" : "<p>Scan QR code with your phone</p>"}<p class="legacy-qr-status" role="status">${started ? "Waiting for the verification result…" : "Waiting for verification…"}</p><p class="legacy-qr-expiry">${started ? "Complete verification in" : "Expires in"} <span class="legacy-qr-countdown">${countdown}</span></p>`;
  }
  async function poll() {
    if (!active || busy) return;
    busy = true;
    const controller = new AbortController();
    requestController = controller;
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const r = await fetch(
        `/auth/status?${new URLSearchParams({ state: attempt.state })}`,
        { cache: "no-store", signal: controller.signal },
      );
      const data = await r.json();
      if (!active) return;
      if (!r.ok && [400, 401, 403].includes(r.status)) {
        deadline = 0;
        draw();
        clearInterval(polling);
        return;
      }
      if (!r.ok) throw new Error("unavailable");
      disconnected = false;
      if (data.status === "finished") location.assign("/user/info");
      else if (data.status === "completed" || data.status === "failed") {
        const url = completionUrlForAttempt(
          data.completionUrl,
          location.origin,
          attempt.state,
        );
        if (url) location.assign(url);
        else throw new Error("Invalid completion URL");
      } else if (
        data.status === "pending" &&
        data.started === true &&
        Number.isFinite(data.expiresAt)
      ) {
        started = true;
        deadline = Math.min(data.expiresAt, attempt.expiresAt + 300000);
        draw();
      } else if (
        data.status !== "pending" ||
        typeof data.started !== "boolean" ||
        !Number.isFinite(data.expiresAt)
      ) {
        throw new Error("unavailable");
      }
    } catch {
      if (active) {
        disconnected = true;
        draw();
      }
    } finally {
      clearTimeout(timeout);
      if (requestController === controller) requestController = undefined;
      busy = false;
    }
  }
  const timer = setInterval(draw, 1000),
    polling = setInterval(poll, 2000);
  dialog.addEventListener("cancel", () => {
    active = false;
  });
  dialog.querySelector('[data-slot="dialog-close"]').onclick = () => {
    active = false;
    dialog.close();
  };
  dialog.addEventListener("close", () => {
    active = false;
    requestController?.abort();
    endFlow(token);
    clearInterval(timer);
    clearInterval(polling);
    dialog.remove();
  });
  document.body.append(dialog);
  draw();
  dialog.showModal();
  dialog.focus();
  void poll();
}
