/** Display a dismissible notification without interpreting its message as HTML. */
export function notify({ type = "error", message, title } = {}) {
  document.querySelectorAll(".showcase-notification").forEach((notice) => notice.remove());
  const kind = type === "success" ? "success" : "error";
  const notice = document.createElement("div");
  notice.className = `showcase-notification showcase-notification--${kind}`;
  notice.setAttribute("role", kind === "error" ? "alert" : "status");
  notice.innerHTML = '<span class="showcase-notification-icon" aria-hidden="true"></span><div class="showcase-notification-content"><strong></strong><p></p></div><button type="button" aria-label="Dismiss notification">×</button>';
  notice.querySelector("strong").textContent = title || (kind === "error" ? "Something went wrong" : "Success");
  notice.querySelector("p").textContent = String(message || "");
  notice.querySelector(".showcase-notification-icon").textContent = kind === "error" ? "!" : "✓";
  const dismiss = () => notice.remove();
  notice.querySelector("button").addEventListener("click", dismiss);
  if (typeof notice.showPopover === "function") {
    notice.setAttribute("popover", "manual");
    document.body.append(notice);
    notice.showPopover();
  } else {
    (document.querySelector("dialog[open]") || document.body).append(notice);
  }
  if (kind === "success") setTimeout(dismiss, 5000);
  return dismiss;
}
export const notifyError = (message) => notify({ type: "error", message });
export const notifySuccess = (message) => notify({ type: "success", message });
