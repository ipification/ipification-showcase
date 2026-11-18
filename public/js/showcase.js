import intlTelInput from "/vendor/intl/js/intlTelInputWithUtils.mjs";
import qrcode from "/vendor/qrcode/qrcode.mjs";

const storage = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
};
const groups = {
  pnv: [
    "pvn_ip",
    "pvn_ip_plus",
    "pvn_im",
    "pvn_ipificator",
    "pvn_sim",
    "pvn_sms",
  ],
  login: ["login_ip", "login_ip_plus", "login_im", "login_sim"],
  identity: ["anonymous", "kyc_phone"],
};
const keys = {
  pvn_ip: "ip",
  login_ip: "ip",
  pvn_ip_plus: "ip_plus",
  login_ip_plus: "ip_plus",
  pvn_im: "im",
  login_im: "im",
  pvn_ipificator: "ip_via_app",
  pvn_sim: "sim",
  login_sim: "sim",
  pvn_sms: "sms",
  anonymous: "anonymous_identity",
  kyc_phone: "kyc",
};
const needsPhone = (flow) => flow.startsWith("pvn_") || flow === "kyc_phone";
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
const container = document.querySelector("#showcase");
try {
  const response = await fetch("/api/showcase-config", { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load showcase configuration");
  const config = await response.json();
  const tabs = Object.keys(groups).filter((tab) =>
    groups[tab].some((flow) =>
      config.clients.some((client) => client.user_flow === flow),
    ),
  );
  let tab = tabs.includes(location.hash.slice(1))
    ? location.hash.slice(1)
    : tabs.includes(storage.get("selector"))
      ? storage.get("selector")
      : tabs[0];
  let server =
    config.auth_servers.find(
      (s) => s.id === storage.get("selected_auth_server_id"),
    )?.id ||
    config.auth_servers[0]?.id ||
    "";
  let phone = "",
    valid = false,
    iti,
    keyboardNavigation = false,
    activeSim = null,
    activePreparation = null;
  document.addEventListener("keydown", (event) => {
    if (
      event.key !== "Tab" &&
      event.target instanceof HTMLElement &&
      (event.target.matches("input, textarea") ||
        event.target.isContentEditable)
    )
      return;
    if (["Tab", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      keyboardNavigation = true;
      container.closest(".legacy-showcase").dataset.keyboardNavigation = "true";
    }
  });
  document.addEventListener("pointerdown", () => {
    keyboardNavigation = false;
    container.closest(".legacy-showcase").dataset.keyboardNavigation = "false";
  });
  function render() {
    if (activePreparation) {
      activePreparation.abort();
      activePreparation = null;
    }
    if (activeSim) {
      activeSim.controller.abort();
      activeSim = null;
    }
    container.closest(".legacy-showcase").dataset.tab = tab;
    iti?.destroy();
    phone = "";
    valid = false;
    const section = config.locale.sections[tab];
    const mobile =
      innerWidth <= 768 || /Android|iPhone|Mobile/i.test(navigator.userAgent);
    let sim = false;
    try {
      sim =
        window.DigitalCredential?.userAgentAllowsProtocol?.(
          "openid4vp-v1-unsigned",
        ) === true;
    } catch {}
    const methods = groups[tab].filter(
      (flow) =>
        config.clients.some((c) => c.user_flow === flow) &&
        (!flow.endsWith("_sim") || sim),
    );
    const button = (flow) => {
      const client = config.clients.find((c) => c.user_flow === flow),
        key = keys[flow];
      const label =
        section?.[`button_${key}_label`] ||
        config.locale.buttons[key] ||
        client.title ||
        flow;
      return `<button id="${esc(flow)}" type="button" ${flow === "pvn_ipificator" && !mobile ? "hidden" : ""} class="legacy-method ${needsPhone(flow) ? "legacy-method-phone" : "legacy-method-direct"}" ${needsPhone(flow) ? "disabled" : ""}><span>${esc(label)}</span><span class="legacy-method-arrow" aria-hidden="true"></span></button>`;
    };
    const phoneBox = `${
      config.appEnv === "stage"
        ? `<label class="sr-only" for="stage-country">Country</label><select id="stage-country" title="Choose country" class="legacy-stage-country" ${config.disabledSelectCountry ? "disabled" : ""}><option value="ww">Wonderland (+999)</option>${intlTelInput
            .getAllCountries()
            .map(
              (c) =>
                `<option value="${esc(c.iso2)}">${esc(c.name)} (+${esc(c.dialCode)})</option>`,
            )
            .join("")}</select>`
        : ""
    }<div class="legacy-phone ${config.appEnv === "stage" ? "legacy-stage-phone" : ""}"><label class="sr-only" for="showcase-phone">Phone number</label>${config.appEnv === "stage" ? '<div class="iti legacy-wonderland"><span class="legacy-wonderland-flag" aria-hidden="true"></span><span class="legacy-wonderland-code">+999</span>' : ""}<input id="showcase-phone" type="tel" autocomplete="tel" aria-invalid="false" aria-describedby="phone-guidance" class="legacy-phone-input">${config.appEnv === "stage" ? "</div>" : ""}</div><p id="phone-guidance" role="status" class="legacy-phone-guidance">Enter a phone number to enable verification methods.</p>`;
    const body =
      tab === "identity"
        ? `<div class="legacy-identity-direct">${methods
            .filter((f) => !needsPhone(f))
            .map(button)
            .join(
              "",
            )}</div>${methods.some(needsPhone) ? phoneBox + `<div class="legacy-methods">${methods.filter(needsPhone).map(button).join("")}</div>` : ""}`
        : `${tab !== "login" ? phoneBox : ""}<div class="legacy-methods">${methods.map(button).join("")}</div>`;
    container.innerHTML = `<div class="legacy-shell"><header class="legacy-header"><a href="/auth/login" class="legacy-brand"><img class="legacy-brand-logo" width="326" height="70" src="${esc(config.logoUrl || "/images/logo/ipification-horizontal-black.svg")}" alt="${esc(config.locale.app.name)}"></a>${config.auth_servers.length > 1 ? `<div class="legacy-site"><span>Site</span><button id="site" type="button" role="combobox" aria-label="Authentication server" aria-expanded="false">${esc(server)}</button><div id="site-list" role="listbox" hidden>${config.auth_servers.map((s) => `<button type="button" role="option" data-server="${esc(s.id)}">${esc(s.id)}</button>`).join("")}</div></div>` : ""}</header><main class="legacy-main" aria-busy="false"><h1 class="sr-only">${esc(config.locale.app.name)}</h1><div role="tablist" aria-label="Authentication options" class="legacy-tabs" data-slot="tabs-list" style="grid-template-columns:repeat(${tabs.length},1fr)">${tabs.map((t) => `<button role="tab" data-slot="tabs-trigger" type="button" data-tab="${esc(t)}" data-state="${t === tab ? "active" : "inactive"}" aria-selected="${t === tab}">${esc(config.locale.tabs[t])}</button>`).join("")}</div><div class="legacy-section"><h2 class="legacy-section-title">${esc(section?.title)}</h2><p class="legacy-description">${esc(section?.description)}</p>${body}<p role="alert" class="legacy-inline-error" id="flow-error" hidden></p></div></main><footer class="legacy-footer"><div class="legacy-footer-links"><a href="https://www.ipification.com/legal">${esc(config.locale.footer.privacy_policy)}</a><button type="button" id="about">${esc(config.locale.footer.about)}</button><a href="https://www.ipification.com/media/IPification%20-%20Showcase%20Guide%202.2.pdf">${esc(config.locale.footer.help)}</a></div></footer></div>`;
    container.querySelectorAll('[role="tab"]').forEach((el) =>
      el.addEventListener("click", () => {
        tab = el.dataset.tab;
        history.replaceState(null, "", `#${tab}`);
        storage.set("selector", tab);
        render();
        container.querySelector(`[data-tab="${tab}"]`).focus();
      }),
    );
    container.querySelector("#site")?.addEventListener("click", (e) => {
      const list = container.querySelector("#site-list");
      list.hidden = !list.hidden;
      e.currentTarget.setAttribute("aria-expanded", String(!list.hidden));
    });
    container.querySelectorAll("[data-server]").forEach((el) =>
      el.addEventListener("click", () => {
        server = el.dataset.server;
        storage.set("selected_auth_server_id", server);
        container.querySelector("#site").textContent = server;
        container.querySelector("#site").setAttribute("aria-expanded", "false");
        container.querySelector("#site-list").hidden = true;
      }),
    );
    const input = container.querySelector("#showcase-phone");
    container.closest(".legacy-showcase").dataset.keyboardNavigation =
      String(keyboardNavigation);
    container.querySelectorAll('[role="tab"]').forEach((el) =>
      el.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
          return;
        event.preventDefault();
        const index = tabs.indexOf(tab);
        tab =
          event.key === "Home"
            ? tabs[0]
            : event.key === "End"
              ? tabs.at(-1)
              : tabs[
                  (index +
                    (event.key === "ArrowRight" ? 1 : -1) +
                    tabs.length) %
                    tabs.length
                ];
        history.replaceState(null, "", `#${tab}`);
        storage.set("selector", tab);
        render();
        container.querySelector(`[data-tab="${tab}"]`).focus();
      }),
    );
    if (input) {
      if (config.appEnv === "stage") {
        input.placeholder = "123456789";
        input.addEventListener("input", () => {
          input.value = input.value.replace(/\D/g, "");
          phone = input.value
            ? iti
              ? (
                  iti.getNumber() ||
                  iti.getSelectedCountry()?.dialCode + input.value
                ).replace(/[ +]/g, "")
              : "999" + input.value
            : "";
          valid = iti ? !!iti.isValidNumber() : !!input.value;
          container
            .querySelectorAll(".legacy-method-phone")
            .forEach((el) => (el.disabled = !input.value));
        });
      } else
        iti = intlTelInput(input, {
          initialCountry: config.defaultCountry || "rs",
          separateDialCode: true,
          strictMode: false,
          formatAsYouType: false,
        });
      const update = () => {
        input.value = input.value.replace(/\D/g, "");
        phone = input.value
          ? (
              iti.getNumber() ||
              iti.getSelectedCountry()?.dialCode + input.value
            ).replace(/[ +]/g, "")
          : "";
        valid = Boolean(iti.isValidNumber());
        input.setAttribute(
          "aria-invalid",
          String(
            Boolean(input.value) && !valid && input.dataset.touched === "true",
          ),
        );
        document.querySelector("#phone-guidance").textContent =
          input.dataset.touched === "true" && input.value && !valid
            ? "Enter a valid phone number for the selected country."
            : valid
              ? "Phone number is ready. Choose a verification method."
              : input.value
                ? "Choose a verification method to check this phone number."
                : "Enter a phone number to enable verification methods.";
        container
          .querySelectorAll(".legacy-method-phone")
          .forEach((el) => (el.disabled = !input.value));
      };
      if (config.appEnv !== "stage") {
        input.addEventListener("blur", () => {
          input.dataset.touched = "true";
          update();
        });
        input.addEventListener("input", update);
        input.addEventListener("countrychange", update);
      }
      container
        .querySelector("#stage-country")
        ?.addEventListener("change", (event) => {
          const country = event.target.value;
          const wrap = input.parentElement;
          iti?.destroy();
          iti = undefined;
          input.value = "";
          phone = "";
          valid = false;
          if (country === "ww") {
            if (!wrap.classList.contains("legacy-wonderland")) {
              const wonder = document.createElement("div");
              wonder.className = "iti legacy-wonderland";
              wonder.innerHTML =
                '<span class="legacy-wonderland-flag" aria-hidden="true"></span><span class="legacy-wonderland-code">+999</span>';
              input.before(wonder);
              wonder.append(input);
            }
            input.placeholder = "123456789";
          } else {
            if (wrap.classList.contains("legacy-wonderland")) {
              wrap.before(input);
              wrap.remove();
            }
            iti = intlTelInput(input, {
              initialCountry: country,
              countrySelectorMode: "OFF",
              separateDialCode: true,
              strictMode: false,
              formatAsYouType: false,
            });
          }
          container
            .querySelectorAll(".legacy-method-phone")
            .forEach((el) => (el.disabled = true));
        });
    }
    container
      .querySelectorAll(".legacy-method")
      .forEach((el) =>
        el.addEventListener("click", () =>
          start(config.clients.find((c) => c.user_flow === el.id)),
        ),
      );
    container.querySelector("#about")?.addEventListener("click", () => {
      const selected = config.auth_servers.find((item) => item.id === server),
        dialog = document.createElement("dialog");
      dialog.className = "legacy-dialog legacy-about-dialog";
      dialog.dataset.slot = "dialog-content";
      dialog.innerHTML = `<h2 data-slot="dialog-title">${esc(config.locale.modals.about_title)}</h2><p>${esc(config.locale.modals.server_label)}: ${esc(selected?.id)}</p><p>${esc(selected?.url)}</p><a href="https://developer.ipification.com/#/" target="_blank" rel="noreferrer">${esc(config.locale.modals.developer_link)}</a><button type="button" data-slot="dialog-close" aria-label="Close">×</button>`;
      dialog.querySelector("button").onclick = () => dialog.close();
      dialog.addEventListener("close", () => dialog.remove());
      document.body.append(dialog);
      dialog.showModal();
    });
  }
  async function start(client) {
    if (needsPhone(client.user_flow) && !valid) {
      const error = container.querySelector("#flow-error");
      error.hidden = false;
      error.textContent = config.locale.modals.phone_invalid;
      return;
    }
    if (client.user_flow === "pvn_sms") return showSms(client);
    if (client.user_flow === "pvn_sim" || client.user_flow === "login_sim")
      return startSim(client);
    const mobile =
      innerWidth <= 768 || /Android|iPhone|Mobile/i.test(navigator.userAgent);
    const qr = !mobile && !client.user_flow.endsWith("_im");
    if (activePreparation) return;
    const controller = new AbortController();
    activePreparation = controller;
    const trigger = container.querySelector(`#${client.user_flow}`);
    trigger.disabled = true;
    trigger.setAttribute("aria-busy", "true");
    try {
      const result = await fetch("/auth/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          user_flow: client.user_flow,
          server_id: server,
          qr,
          ...(needsPhone(client.user_flow) ? { phone } : {}),
        }),
      });
      if (!result.ok) throw new Error("Unable to prepare verification");
      const attempt = await result.json();
      if (controller.signal.aborted || activePreparation !== controller) return;
      if (!qr) location.assign(attempt.url);
      else showQr(attempt, client);
    } catch {
      if (!controller.signal.aborted) {
        const error = container.querySelector("#flow-error");
        error.hidden = false;
        error.textContent = "Unable to open verification. Please try again.";
      }
    } finally {
      if (activePreparation === controller) {
        activePreparation = null;
        trigger.disabled = false;
        trigger.setAttribute("aria-busy", "false");
      }
    }
  }
  render();
  container.hidden = false;
  document.querySelector(".legacy-loading").remove();
  window.addEventListener("resize", () => {
    const el = container.querySelector("#pvn_ipificator");
    if (el)
      el.hidden = !(
        innerWidth <= 768 || /Android|iPhone|Mobile/i.test(navigator.userAgent)
      );
  });
  window.addEventListener("hashchange", () => {
    const next = location.hash.slice(1);
    if (tabs.includes(next) && next !== tab) {
      tab = next;
      render();
    }
  });

  // Callback messages are stored in the session and consumed once.
  fetch("/auth/login/error", { cache: "no-store" })
    .then((r) => r.json())
    .then(({ error_message: message }) => {
      if (!message) return;
      const dialog = document.createElement("dialog");
      dialog.className = "legacy-callback-error";
      dialog.setAttribute("aria-label", message);
      const title = document.createElement("h2");
      title.textContent = message;
      dialog.append(title);
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) dialog.close();
      });
      dialog.addEventListener("close", () => dialog.remove());
      document.body.append(dialog);
      dialog.showModal();
    })
    .catch(() => {});

  function showQr(attempt, client) {
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
      busy = false;
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
      try {
        const r = await fetch(
          `/auth/status?${new URLSearchParams({ state: attempt.state })}`,
          { cache: "no-store" },
        );
        const data = await r.json();
        if (!active) return;
        if (!r.ok) throw new Error("unavailable");
        disconnected = false;
        if (data.status === "finished") location.assign("/user/info");
        else if (data.status === "completed" || data.status === "failed") {
          const url = new URL(data.completionUrl, location.origin);
          if (
            url.origin === location.origin &&
            url.pathname === "/auth/complete" &&
            !url.hash &&
            url.searchParams.getAll("state").length === 1 &&
            url.searchParams.get("state") === attempt.state
          )
            location.assign(url.href);
        } else if (
          data.status === "pending" &&
          data.started === true &&
          Number.isFinite(data.expiresAt)
        ) {
          started = true;
          deadline = Math.min(data.expiresAt, attempt.expiresAt + 300000);
          draw();
        }
      } catch {
        if (active) {
          disconnected = true;
          draw();
        }
      } finally {
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

  async function jsonPost(url, body, signal) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    return { response, data };
  }
  function showSms(client) {
    const dialog = document.createElement("dialog"),
      controller = new AbortController();
    dialog.className = "legacy-dialog legacy-sms-dialog";
    dialog.dataset.slot = "dialog-content";
    dialog.innerHTML =
      '<header data-slot="dialog-header"><h2 data-slot="dialog-title">Enter OTP code</h2><p>Enter the verification code sent to your phone.</p></header><form><label for="sms-code">OTP code</label><input id="sms-code" autocomplete="one-time-code" inputmode="numeric" disabled><p role="status">Sending code…</p><p role="alert" hidden></p><div><button type="button">Cancel</button><button type="button" data-retry hidden>Retry</button><button type="submit" disabled>Verify</button></div></form>';
    const input = dialog.querySelector("input"),
      form = dialog.querySelector("form"),
      error = dialog.querySelector('[role="alert"]'),
      status = dialog.querySelector('[role="status"]'),
      submit = dialog.querySelector('[type="submit"]');
    let auth;
    dialog.querySelector('[type="button"]').onclick = () => {
      controller.abort();
      dialog.close();
    };
    dialog.addEventListener("cancel", () => controller.abort());
    dialog.addEventListener("close", () => {
      controller.abort();
      dialog.remove();
    });
    input.oninput = () => {
      input.value = input.value.replace(/\D/g, "");
      submit.disabled = !input.value;
    };
    async function verify(code) {
      submit.disabled = true;
      error.hidden = true;
      try {
        const { response, data } = await jsonPost(
          "/sms/token",
          { ...auth, client_id: client.client_id, server_id: server, code },
          controller.signal,
        );
        await jsonPost(
          "/sms/log",
          { data: { type: "get_token_response", data } },
          controller.signal,
        );
        if (!response.ok)
          throw new Error(
            data.data?.error_description ||
              data.error ||
              "Unable to verify OTP code",
          );
        location.assign("/user/info");
      } catch (e) {
        if (!controller.signal.aborted) {
          error.textContent = e.message;
          error.hidden = false;
          submit.disabled = false;
        }
      }
    }
    form.onsubmit = (event) => {
      event.preventDefault();
      if (auth && input.value) void verify(input.value);
    };
    document.body.append(dialog);
    dialog.showModal();
    async function sendCode() {
      error.hidden = true;
      status.hidden = false;
      dialog.querySelector("[data-retry]").hidden = true;
      try {
        const { response, data } = await jsonPost(
          "/sms/auth",
          {
            client_id: client.client_id,
            server_id: server,
            login_hint: phone,
            scope: "openid ip:phone_verify",
          },
          controller.signal,
        );
        if (!response.ok)
          throw new Error(data.error || "Unable to start SMS verification");
        auth = { auth_req_id: data.auth_req_id, nonce: data.nonce };
        input.disabled = false;
        status.hidden = true;
        input.focus();
        if ("OTPCredential" in window && navigator.credentials?.get)
          navigator.credentials
            .get({ otp: { transport: ["sms"] }, signal: controller.signal })
            .then((credential) => {
              if (credential?.code) {
                input.value = credential.code;
                void verify(credential.code);
              }
            })
            .catch(() => {});
      } catch (e) {
        if (!controller.signal.aborted) {
          status.hidden = true;
          error.hidden = false;
          error.textContent = e.message;
          dialog.querySelector("[data-retry]").hidden = false;
        }
      }
    }
    dialog.querySelector("[data-retry]").onclick = sendCode;
    void sendCode();
  }
  async function startSim(client) {
    if (activeSim) return;
    const login = client.user_flow === "login_sim",
      alert = container.querySelector("#flow-error"),
      controller = new AbortController();
    const attempt = { controller };
    activeSim = attempt;
    const button = container.querySelector(`#${client.user_flow}`);
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    const pending = document.createElement("div");
    pending.className = "legacy-pending";
    pending.innerHTML =
      '<p role="status">Waiting for SIM verification…</p><button type="button">Cancel</button>';
    container.querySelector(".legacy-section").append(pending);
    function release() {
      if (activeSim !== attempt) return;
      activeSim = null;
      button.disabled = false;
      button.setAttribute("aria-busy", "false");
      pending.remove();
    }
    pending.querySelector("button").onclick = () => {
      controller.abort();
      release();
    };
    try {
      const { response, data } = await jsonPost(
        "/ts43/auth",
        {
          client_id: client.client_id,
          server_id: server,
          login_hint: login ? "anonymous" : phone,
          carrier_hint: 51010,
          scope: login ? "openid ip:phone" : "openid ip:phone_verify",
          ...(login ? { operation: "GetPhoneNumber" } : {}),
        },
        controller.signal,
      );
      if (!response.ok)
        throw new Error(data.error || "Unable to start SIM verification");
      const credential = await navigator.credentials.get({
        digital: { requests: [data.digital_request] },
        signal: controller.signal,
      });
      if (activeSim !== attempt) return;
      if (!credential) throw new Error("SIM verification was cancelled.");
      const vp = (credential.token || credential.data)?.vp_token?.[
        "ipification.com"
      ]?.[0];
      if (!vp)
        throw new Error(
          "This browser did not return a supported SIM credential. Choose another method.",
        );
      const token = await jsonPost(
        "/ts43/token",
        {
          vp_token: vp,
          auth_req_id: data.auth_req_id,
          client_id: client.client_id,
          server_id: server,
          nonce: data.nonce,
        },
        controller.signal,
      );
      await jsonPost(
        "/ts43/log",
        { data: { type: "get_token_response", data: token.data } },
        controller.signal,
      );
      location.assign("/user/info");
    } catch (error) {
      if (activeSim === attempt) {
        alert.textContent = error.message || "SIM verification is unavailable.";
        alert.hidden = false;
      }
    } finally {
      release();
    }
  }
} catch {
  const loading = document.querySelector(".legacy-loading");
  if (loading)
    loading.textContent =
      "Showcase is not ready. Check runtime configuration and retry.";
}
