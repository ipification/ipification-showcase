import qrcode from "/vendor/qrcode/qrcode.mjs";
import { completionUrlForAttempt } from "../completion-url.js";

export function showQr(attempt, client, token, { start, endFlow }) {
  const dialog = document.createElement("dialog");
  dialog.className = "showcase-dialog showcase-qr-dialog";
  dialog.tabIndex = -1;
  dialog.dataset.slot = "dialog-content";
  dialog.setAttribute("aria-label", client.title || "Verify your identity");
  dialog.innerHTML = `<header class="showcase-qr-header" data-slot="dialog-header"><div class="showcase-qr-heading"><h2 data-slot="dialog-title"></h2><p>Scan the QR code with your phone to continue.</p></div></header><div class="showcase-qr-body"><div class="showcase-qr-content"></div><ol class="showcase-qr-instructions"><li><span>1</span><p>Open your phone camera.</p></li><li><span>2</span><p>Scan the QR code, tap the link shown on your camera, and follow the instructions.</p></li></ol></div><div class="showcase-qr-caption"></div><button type="button" data-slot="dialog-close" aria-label="Close">×</button>`;
  dialog.querySelector("h2").textContent =
    client.title || "Verify your identity";
  const content = dialog.querySelector(".showcase-qr-content"),
    caption = dialog.querySelector(".showcase-qr-caption");
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
        '<div class="showcase-qr-recovery"><strong>QR code expired</strong><p>This verification link has expired. Create a new QR code to continue.</p></div>';
      caption.innerHTML =
        '<p class="showcase-qr-status" role="status">This code has expired.</p><button class="showcase-action" type="button">Create new QR code</button>';
      caption.querySelector("button").onclick = () => {
        endFlow(token);
        dialog.close();
        void start(client);
      };
      return;
    }
    if (disconnected) {
      content.innerHTML =
        '<div class="showcase-qr-recovery"><strong>Connection interrupted</strong><p>Check your connection, then create a new QR code to continue.</p></div>';
      caption.innerHTML =
        '<p class="showcase-qr-status" role="status">Unable to receive verification updates.</p><button class="showcase-action" type="button">Create new QR code</button>';
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
      : `<div class="showcase-qr-code">${code.createSvgTag({ cellSize: 4, margin: 0 })}</div><a data-testid="qr-auth-link" class="sr-only" target="_blank" rel="noreferrer"></a>`;
    const link = content.querySelector("a");
    if (link) {
      link.href = attempt.url;
      link.textContent = "Open verification link";
    }
    caption.innerHTML = `<p class="showcase-qr-status" role="status"><span class="showcase-qr-spinner" aria-hidden="true"></span>${started ? "Waiting for the verification result…" : "Waiting for verification"}</p><p class="showcase-qr-expiry">${started ? "Complete verification in" : "Expires in"} <span class="showcase-qr-countdown">${countdown}</span></p>`;
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
